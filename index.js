/**
 * Host half of the notes bundle.
 *
 * The notebook is plugin-owned data, not session data, so it lives in one small
 * JSON file under the DSH home (`<DSH_HOME>/.dsh-notes/notes.json`, which is
 * `%USERPROFILE%\.dsh\.dsh-notes\notes.json` by default). That location does not
 * depend on the profile or on the port the Web GUI happens to bind, so notes
 * survive restarts. The Client half reads and writes it through one same-origin
 * JSON route; the file is rewritten atomically and every payload is re-validated
 * before it reaches the disk.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const ROUTE_PATH = '/dsh-notes/state';
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_NOTES = 5000;
const MAX_TAGS = 100;
const MAX_TEXT = 20000;
/**
 * Ids reach React keys and plain-object indexes on the Client half, so keep
 * them boring: letters, digits and dashes only. That also rejects names such as
 * `__proto__`, which a crafted payload could otherwise slip into the store.
 */
const ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

/** The DSH home this host instance belongs to (profile-independent). */
function dshHome() {
  const fromEnv = process.env.DSH_HOME;
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv;
  return join(homedir(), '.dsh');
}

function storeFile() {
  return join(dshHome(), '.dsh-notes', 'notes.json');
}

/** Content-derived revision: what a writer saw is exactly what it will replace. */
function revOf(content) {
  return createHash('sha1').update(content, 'utf8').digest('hex').slice(0, 16);
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

/** Loopback authority check: `Host` is the header a rebinding page cannot forge. */
function loopbackAuthority(host) {
  if (host === undefined) return false;
  const lower = host.toLowerCase();
  const name = lower.startsWith('[') ? lower.slice(0, lower.indexOf(']') + 1) : lower.split(':')[0];
  return name === '127.0.0.1' || name === 'localhost' || name === '[::1]';
}

/**
 * Same-origin gate for the data route. Reads stay available to the page;
 * anything that a foreign page could drive is refused.
 */
function sameOrigin(request) {
  const host = request.headers.host;
  if (host !== undefined && !loopbackAuthority(host)) return false;
  if (request.headers['sec-fetch-site'] === 'cross-site') return false;
  if (request.headers['sec-fetch-site'] === 'same-site') return false;
  const origin = request.headers.origin;
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error('request body too large');
    chunks.push(buffer);
  }
  if (size === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function text(value, limit) {
  return typeof value === 'string' ? value.slice(0, limit) : '';
}

/** Rebuild the payload from known fields only; unknown input is dropped. */
function sanitize(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const knownTags = [];
  const tagIds = new Set();
  const tags = Array.isArray(source.tags) ? source.tags : [];
  for (const tag of tags.slice(0, MAX_TAGS)) {
    if (!tag || typeof tag !== 'object') continue;
    const id = text(tag.id, 64);
    const name = text(tag.name, 40).trim();
    if (!ID_PATTERN.test(id) || name === '' || tagIds.has(id)) continue;
    tagIds.add(id);
    knownTags.push({ id, name });
  }

  const knownNotes = [];
  const noteIds = new Set();
  const notes = Array.isArray(source.notes) ? source.notes : [];
  for (const note of notes.slice(0, MAX_NOTES)) {
    if (!note || typeof note !== 'object') continue;
    const id = text(note.id, 64);
    const body = text(note.text, MAX_TEXT);
    if (!ID_PATTERN.test(id) || body.trim() === '' || noteIds.has(id)) continue;
    noteIds.add(id);
    const created = typeof note.createdAt === 'string' && !Number.isNaN(Date.parse(note.createdAt))
      ? new Date(note.createdAt).toISOString()
      : new Date().toISOString();
    const noteTags = [];
    if (Array.isArray(note.tags)) {
      for (const tagId of note.tags) {
        if (typeof tagId === 'string' && tagIds.has(tagId) && noteTags.indexOf(tagId) === -1) {
          noteTags.push(tagId);
        }
      }
    }
    knownNotes.push({ id, text: body, createdAt: created, tags: noteTags });
  }

  return { notes: knownNotes, tags: knownTags };
}

/** One writer at a time, so two requests cannot interleave their temp files. */
let writeQueue = Promise.resolve();
function enqueue(task) {
  const next = writeQueue.then(task, task);
  writeQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function loadState() {
  const file = storeFile();
  let raw;
  try {
    raw = await readFile(file, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') return { data: { notes: [], tags: [] }, recovered: false, rev: '0' };
    throw error;
  }
  const rev = revOf(raw);
  try {
    return { data: sanitize(JSON.parse(raw)), recovered: false, rev };
  } catch {
    // Unreadable JSON is moved aside instead of being silently overwritten.
    const backup = `${file}.corrupt-${Date.now()}`;
    try {
      await rename(file, backup);
    } catch {
      // keep going: the next write still replaces the broken file
    }
    return { data: { notes: [], tags: [] }, recovered: true, rev: '0' };
  }
}

/**
 * Write the store, but only if the caller is replacing what it actually read.
 *
 * `ifRev` is the revision returned by the last GET/POST. A mismatch means
 * another window (or another writer) already replaced the file, so the write is
 * refused with the current content instead of silently dropping their notes.
 * A missing `ifRev` — an older Client half, or a session that never loaded —
 * keeps the previous unconditional behaviour.
 */
async function saveState(payload, ifRev) {
  const data = sanitize(payload);
  const file = storeFile();
  let currentRev = '0';
  let existing = null;
  try {
    existing = await readFile(file, 'utf8');
    currentRev = revOf(existing);
  } catch (error) {
    if (!error || error.code !== 'ENOENT') throw error;
  }
  if (typeof ifRev === 'string' && ifRev !== '' && ifRev !== currentRev) {
    let fresh = { notes: [], tags: [] };
    if (existing !== null) {
      try {
        fresh = sanitize(JSON.parse(existing));
      } catch {
        fresh = { notes: [], tags: [] };
      }
    }
    return { conflict: true, rev: currentRev, data: fresh };
  }
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  const body = JSON.stringify({ version: 1, ...data }, null, 2);
  await writeFile(temporary, body, 'utf8');
  try {
    await rename(temporary, file);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  return { conflict: false, rev: revOf(body), data };
}

export function apply(ctx) {
  ctx.inject(['webServer'], (hostCtx) => {
    hostCtx.effect(
      () =>
        hostCtx.webServer.register({
          kind: 'exact',
          path: ROUTE_PATH,
          handler: async (request, response) => {
            if (!sameOrigin(request)) {
              sendJson(response, 403, { ok: false, error: 'untrusted origin' });
              return;
            }
            if (request.method === 'GET') {
              try {
                const loaded = await loadState();
                sendJson(response, 200, {
                  ok: true,
                  data: loaded.data,
                  recovered: loaded.recovered,
                  rev: loaded.rev,
                });
              } catch (error) {
                sendJson(response, 500, { ok: false, error: String((error && error.message) || error) });
              }
              return;
            }
            if (request.method !== 'POST') {
              response.writeHead(405, { allow: 'GET, POST' });
              response.end();
              return;
            }
            try {
              const body = await readJsonBody(request);
              const data = body && typeof body === 'object' ? body.data : undefined;
              // An empty or malformed body used to mean "write nothing", which the
              // sanitiser turned into an empty store — one stray POST wiped the file.
              if (!data || typeof data !== 'object' || Array.isArray(data)) {
                sendJson(response, 400, { ok: false, error: 'expected {"data":{"notes":[],"tags":[]}}' });
                return;
              }
              const result = await enqueue(() => saveState(data, body.ifRev));
              if (result.conflict) {
                sendJson(response, 409, { ok: false, conflict: true, rev: result.rev, data: result.data });
                return;
              }
              sendJson(response, 200, {
                ok: true,
                rev: result.rev,
                savedAt: new Date().toISOString(),
                notes: result.data.notes.length,
                tags: result.data.tags.length,
              });
            } catch (error) {
              sendJson(response, 400, { ok: false, error: String((error && error.message) || error) });
            }
          },
        }),
      'dsh-notes: state route',
    );
  });
}