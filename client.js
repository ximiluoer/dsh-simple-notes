window.__ModuleLoader__.load({
  id: 'dsh-simple-notes',
  factory(require) {
    const React = require('react');
    const reactDom = require('react-dom');
    const h = React.createElement;
    /** Set by the mounted sidebar entry; opened by the document-level handler. */
    let quickSheet = null;
    const { useCallback, useEffect, useMemo, useRef, useState } = React;

    const NS = 'dsh-notes';
    const PANEL_ID = 'dsh-notes';
    const ROUTE_PATH = '/dsh-notes/state';
    const MIRROR_KEY = 'dsh-notes:mirror:v1';
    const UNDO_TIMEOUT = 7000;
    const MAX_NOTE_CHARS = 20000;
    const MAX_TAGS = 100;

    /* ------------------------------------------------------------------ copy */

    const zh = {
      title: '随手记',
      subtitleUnitNotes: '条记录',
      subtitleUnitTags: '个标签',
      close: '关闭',
      placeholder: '记录点什么…（Ctrl + Enter 保存）',
      save: '保存',
      hint: '按日期或标签查看，随时删除',
      tags: '标签',
      newTagPlaceholder: '新建标签',
      addTag: '添加标签',
      byDate: '按日期',
      byTag: '按标签',
      today: '今天',
      yesterday: '昨天',
      untagged: '无标签',
      emptyTitle: '还没有记录',
      emptyHint: '在上方写下第一条记录，点「保存」即可添加。',
      emptyTagTitle: '还没有标签',
      emptyTagHint: '在输入框下方新建标签，记录就能按标签归类。',
      deleteNote: '删除这条记录',
      deleteTag: '删除标签',
      undo: '撤销',
      deletedNote: '已删除记录',
      deletedTag: '已删除标签',
      loading: '正在读取记录…',
      offline: '本地存储暂时不可用，记录已保存在浏览器缓存中。',
      recovered: '数据文件曾损坏，已备份并重新开始。',
      openNote: '点开查看这条记录',
      back: '返回列表',
      created: '记录于',
      edit: '修改',
      saveChanges: '保存修改',
      cancel: '取消',
      editPlaceholder: '修改这条记录…（Ctrl + Enter 保存）',
      limitNote: '单条上限 {n} 字符',
      overLimit: '超出部分保存时截断',
      selectMode: '批量选择',
      cancelSelect: '取消选择',
      merge: '合并',
      moveTo: '移动至',
      deleteSelected: '删除',
      view: '查看',
      togglePick: '选择这条记录',
      selectedCount: '已选 {n} 条',
      mergedNote: '已合并 {n} 条记录',
      movedNote: '已移动 {n} 条记录',
      deletedSelected: '已删除 {n} 条记录',
      noTags: '还没有标签',
      newTag: '新建标签',
      collapse: '收起',
      expand: '展开',
      selectAll: '全选',
      clearAll: '取消全选',
      selectGroup: '选中该组全部',
      more: '向右查看',
      conflict: '内容已在别处修改，已载入最新版本。',
      trimmed: '部分内容超出上限，已按上限截断。',
      quickHint: '右键打开速记框',
    };

    const en = {
      title: 'Notes',
      subtitleUnitNotes: 'notes',
      subtitleUnitTags: 'tags',
      close: 'Close',
      placeholder: 'Write something… (Ctrl + Enter to save)',
      save: 'Save',
      hint: 'Browse by date or tag, delete anytime',
      tags: 'Tags',
      newTagPlaceholder: 'New tag',
      addTag: 'Add tag',
      byDate: 'By date',
      byTag: 'By tag',
      today: 'Today',
      yesterday: 'Yesterday',
      untagged: 'Untagged',
      emptyTitle: 'No notes yet',
      emptyHint: 'Write your first note above and press Save.',
      emptyTagTitle: 'No tags yet',
      emptyTagHint: 'Create a tag under the input to group notes by tag.',
      deleteNote: 'Delete this note',
      deleteTag: 'Delete tag',
      undo: 'Undo',
      deletedNote: 'Note deleted',
      deletedTag: 'Tag deleted',
      loading: 'Loading notes…',
      offline: 'Local storage is unavailable; notes are kept in browser cache.',
      recovered: 'The data file was damaged, so it was backed up and started empty.',
      openNote: 'Open this note',
      back: 'Back to list',
      created: 'Saved',
      edit: 'Edit',
      saveChanges: 'Save changes',
      cancel: 'Cancel',
      editPlaceholder: 'Edit this note… (Ctrl + Enter to save)',
      limitNote: 'Limit {n} characters per note',
      overLimit: 'trimmed on save',
      selectMode: 'Select',
      cancelSelect: 'Cancel',
      merge: 'Merge',
      moveTo: 'Move to',
      deleteSelected: 'Delete',
      view: 'View',
      togglePick: 'Select this note',
      selectedCount: '{n} selected',
      mergedNote: 'Merged {n} notes',
      movedNote: 'Moved {n} notes',
      deletedSelected: 'Deleted {n} notes',
      noTags: 'No tags yet',
      newTag: 'New tag',
      collapse: 'Collapse',
      expand: 'Expand',
      selectAll: 'Select all',
      clearAll: 'Clear all',
      selectGroup: 'Select all in this group',
      more: 'Scroll right',
      conflict: 'Changed elsewhere; the latest version has been loaded.',
      trimmed: 'Some content exceeded the limit and was trimmed.',
      quickHint: 'Right-click for a quick note',
    };

    /* ------------------------------------------------------------------ data */

    const EMPTY = () => ({ notes: [], tags: [] });

    function uid() {
      try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
      } catch {
        // fall through to the timestamp form
      }
      return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    }

    function pad2(value) {
      return value < 10 ? '0' + value : String(value);
    }

    function dayKeyOf(iso) {
      const date = new Date(iso);
      return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
    }

    function normalize(raw) {
      const source = raw && typeof raw === 'object' ? raw : EMPTY();
      const tags = Array.isArray(source.tags)
        ? source.tags.filter(
            (tag) =>
              tag &&
              typeof tag === 'object' &&
              typeof tag.id === 'string' &&
              tag.id !== '' &&
              typeof tag.name === 'string' &&
              tag.name.trim() !== '',
          )
        : [];
      const cleanTags = tags.map((tag) => ({ id: tag.id, name: tag.name }));
      const tagIds = new Set(cleanTags.map((tag) => tag.id));
      const notes = Array.isArray(source.notes)
        ? source.notes
            .filter(
              (note) =>
                note &&
                typeof note === 'object' &&
                typeof note.id === 'string' &&
                note.id !== '' &&
                typeof note.text === 'string' &&
                note.text.trim() !== '',
            )
            .map((note) => ({
              id: note.id,
              text: note.text,
              createdAt:
                typeof note.createdAt === 'string' && !Number.isNaN(Date.parse(note.createdAt))
                  ? note.createdAt
                  : new Date().toISOString(),
              tags: Array.isArray(note.tags)
                ? note.tags.filter((id) => typeof id === 'string' && tagIds.has(id))
                : [],
            }))
        : [];
      return { notes, tags: cleanTags };
    }

    function readMirror() {
      try {
        const raw = window.localStorage.getItem(MIRROR_KEY);
        if (!raw) return null;
        return normalize(JSON.parse(raw));
      } catch {
        return null;
      }
    }

    function writeMirror(data) {
      try {
        window.localStorage.setItem(MIRROR_KEY, JSON.stringify(data));
      } catch {
        // the mirror is best effort only
      }
    }

    function snippet(value) {
      const flat = value.replace(/\s+/g, ' ').trim();
      return flat.length > 18 ? flat.slice(0, 18) + '…' : flat;
    }

    function activeLocaleOf(locale) {
      try {
        const snapshot = locale.getLocale();
        return (snapshot && snapshot.active) || 'zh';
      } catch {
        return 'zh';
      }
    }

    /* ----------------------------------------------------------------- style */

    const CSS = `
.dn-root{--dn-blue:light-dark(#3355f0,#7c9dff);height:100%;min-height:0;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;padding:calc(24px + var(--dsh-frame-top-clearance,0px)) 20px 20px;overflow-y:auto;scrollbar-gutter:stable;container-type:size;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:14px;line-height:1.5;}
.dn-root::-webkit-scrollbar{width:9px;}
.dn-root::-webkit-scrollbar-track{background:transparent;}
.dn-root::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2);border-radius:5px;}
.dn-root:hover::-webkit-scrollbar-thumb{background:var(--dsw-alias-label-primary);}
.dn-root:has(.dn-body:hover)::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2);}
.dn-shell{width:min(760px,100%);flex:0 0 auto;min-height:100%;display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:16px;overflow:hidden;}
.dn-root[data-compact="true"] .dn-shell{height:100%;}
.dn-root[data-compact="true"] .dn-body{max-height:none;}
.dn-head{display:flex;align-items:flex-start;gap:12px;padding:16px 18px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);}
.dn-headline{flex:1;min-width:0;}
.dn-title{margin:0;font-size:15px;font-weight:600;line-height:1.4;}
.dn-sub{margin-top:2px;font-size:12px;color:var(--dsw-alias-label-secondary);}
.dn-icon{display:inline-flex;align-items:center;justify-content:center;flex:none;width:28px;height:28px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background .12s,color .12s;}
.dn-icon:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}
.dn-icon:disabled{opacity:.35;cursor:not-allowed;background:transparent;}
.dn-icon-danger:hover{color:var(--dsw-alias-state-error-primary);}
.dn-compose{display:flex;flex-direction:column;gap:10px;padding:14px 18px 12px;}
.dn-fold{display:flex;justify-content:center;padding:2px 18px 4px;border-bottom:1px solid var(--dsw-alias-border-l1);}
.dn-foldbtn{display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 10px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;cursor:pointer;transition:background .12s,color .12s;}
.dn-foldbtn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}
.dn-foldbtn svg{transition:transform .15s;}
.dn-foldbtn[data-collapsed="false"] svg{transform:rotate(180deg);}
.dn-compose .dn-input{margin-top:0;}
.dn-input{box-sizing:border-box;width:100%;min-height:74px;max-height:200px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:13.5px;line-height:1.6;resize:vertical;outline:none;transition:border-color .15s;}
.dn-input::placeholder{color:var(--dsw-alias-label-secondary);}
.dn-input:focus{border-color:var(--dsw-alias-brand-primary);}
.dn-tagline{display:flex;flex-wrap:wrap;align-items:center;gap:6px;max-height:92px;overflow:auto;}
.dn-chiplabel{font-size:12px;color:var(--dsw-alias-label-secondary);}
.dn-chip{display:inline-flex;align-items:center;height:24px;padding:0 9px;border:1px solid color-mix(in srgb,var(--dn-blue,#3355f0) 42%,transparent);border-radius:999px;background:color-mix(in srgb,var(--dn-blue,#3355f0) 10%,transparent);color:var(--dn-blue,#3355f0);font:inherit;font-size:12px;cursor:pointer;white-space:nowrap;transition:background .12s,color .12s,border-color .12s;}
.dn-chip:hover{background:color-mix(in srgb,var(--dn-blue,#3355f0) 20%,transparent);}
.dn-chip[data-on="true"]{background:var(--dn-blue,#3355f0);border-color:var(--dn-blue,#3355f0);color:var(--dsw-alias-bg-base);}
.dn-newtag{display:inline-flex;align-items:center;gap:2px;}
.dn-newtag input{box-sizing:border-box;width:112px;height:24px;padding:0 8px;border:1px dashed var(--dsw-alias-border-l2);border-radius:999px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;outline:none;}
.dn-newtag input:focus{border-style:solid;border-color:var(--dsw-alias-brand-primary);}
.dn-rowend{display:flex;align-items:center;justify-content:space-between;gap:12px;}
.dn-hint{font-size:11.5px;color:var(--dsw-alias-label-secondary);}
.dn-primary{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 14px;border:1px solid var(--dsw-alias-brand-primary);border-radius:8px;background:transparent;color:var(--dsw-alias-brand-primary);font:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:background .12s;}
.dn-primary:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);}
.dn-primary:disabled{opacity:.4;cursor:not-allowed;}
.dn-tabs{display:flex;gap:2px;padding:0 18px;border-bottom:1px solid var(--dsw-alias-border-l1);}
.dn-tab{position:relative;display:inline-flex;align-items:center;gap:6px;height:38px;padding:0 10px;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12.5px;cursor:pointer;}
.dn-tab:hover{color:var(--dsw-alias-label-primary);}
.dn-tab[data-active="true"]{color:var(--dsw-alias-label-primary);font-weight:600;}
.dn-tab[data-active="true"]::after{content:"";position:absolute;left:8px;right:8px;bottom:-1px;height:2px;border-radius:2px 2px 0 0;background:var(--dsw-alias-brand-primary);}
.dn-body{flex:1;min-height:220px;max-height:calc(100vh - 400px);max-height:calc(100cqh - 350px);overflow:auto;padding:12px 18px 18px;}
.dn-body::-webkit-scrollbar{width:6px;}
.dn-body::-webkit-scrollbar-track{background:transparent;}
.dn-body::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2);border-radius:4px;}
.dn-body:hover::-webkit-scrollbar-thumb{background:var(--dsw-alias-label-primary);}
.dn-group{margin-bottom:14px;padding:6px 12px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-2);}
.dn-group:last-child{margin-bottom:0;}
.dn-grouphead{display:flex;align-items:center;gap:8px;min-height:46px;padding:4px 2px;margin-bottom:8px;border-bottom:1px solid var(--dsw-alias-border-l1);}
.dn-groupname{display:inline-flex;align-items:center;gap:6px;font-size:13.5px;font-weight:600;color:var(--dn-blue,#3355f0);}
.dn-groupcount{font-size:11.5px;color:var(--dsw-alias-label-secondary);opacity:.75;}
.dn-grouphead .dn-icon{width:20px;height:20px;border-radius:6px;}
.dn-groupfold{flex:none;margin-left:auto;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background .12s,color .12s;}
.dn-groupfold:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}
.dn-groupfold svg{transition:transform .15s;}
.dn-groupfold[data-folded="true"] svg{transform:rotate(-90deg);}
.dn-check-head{width:16px;height:16px;margin-top:0;padding:0;font:inherit;background:transparent;cursor:pointer;}
.dn-check-dash{display:block;width:8px;height:2px;border-radius:1px;background:var(--dsw-alias-brand-primary);}
.dn-stripwrap{position:relative;}
.dn-strip{display:flex;gap:8px;width:100%;box-sizing:border-box;overflow-x:auto;overflow-y:hidden;padding:2px 38px 8px 2px;}
.dn-strip::-webkit-scrollbar{height:6px;}
.dn-strip::-webkit-scrollbar-track{background:transparent;}
.dn-strip::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2);border-radius:3px;}
.dn-strip:hover::-webkit-scrollbar-thumb{background:var(--dsw-alias-label-primary);}
.dn-tile{position:relative;flex:none;box-sizing:border-box;display:flex;flex-direction:column;gap:4px;width:120px;height:120px;padding:9px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);cursor:pointer;overflow:hidden;transition:border-color .12s;}
.dn-tile:hover{border-color:var(--dsw-alias-border-l2);}
.dn-tile:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;}
.dn-tile[data-selected="true"]{border-color:var(--dn-blue,#3355f0);box-shadow:inset 0 0 0 1px var(--dn-blue,#3355f0);}
.dn-tile-text{flex:1;min-height:0;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;font-size:11.5px;line-height:1.5;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;}
.dn-tile-tags{flex:none;display:flex;flex-wrap:nowrap;gap:3px;height:14px;overflow:hidden;}
.dn-tile-tag{flex:none;max-width:100%;padding:0 4px;border:1px solid color-mix(in srgb,var(--dn-blue,#3355f0) 40%,transparent);border-radius:999px;font-size:9px;line-height:12px;color:var(--dn-blue,#3355f0);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.dn-tile-meta{flex:none;display:flex;align-items:center;justify-content:space-between;gap:4px;font-size:10.5px;color:var(--dsw-alias-label-secondary);}
.dn-tile-btn{padding:0;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:10.5px;cursor:pointer;}
.dn-tile-btn:hover{color:var(--dsw-alias-label-primary);}
.dn-tile-del:hover{color:var(--dsw-alias-state-error-primary);}
.dn-check-tile{position:absolute;top:5px;right:5px;margin-top:0;background:var(--dsw-alias-bg-base);}
.dn-tile[data-select="true"] .dn-tile-text{padding-right:14px;}
.dn-more{position:absolute;right:0;top:50%;display:flex;align-items:center;justify-content:flex-end;width:36px;height:calc(100% - 26px);padding:0 6px 0 0;border:0;border-radius:0 10px 10px 0;background:linear-gradient(to right,transparent,var(--dsw-alias-bg-layer-2) 62%);color:var(--dsw-alias-label-secondary);cursor:pointer;transform:translateY(-50%);}
.dn-more:hover{color:var(--dsw-alias-label-primary);}
.dn-notes{display:flex;flex-direction:column;}
.dn-note{display:flex;gap:6px;box-sizing:border-box;height:92px;overflow:hidden;padding:9px 10px;margin-bottom:7px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-base);transition:border-color .12s;}
.dn-note:hover{border-color:var(--dsw-alias-border-l2);}
.dn-note:last-child{margin-bottom:0;}
.dn-note-open{flex:1;min-width:0;display:block;text-align:left;padding:0;border:0;background:transparent;color:inherit;font:inherit;cursor:pointer;}
.dn-note-open:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;border-radius:6px;}
.dn-note-text{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;font-size:13.5px;line-height:1.6;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;}
.dn-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:5px;font-size:11.5px;color:var(--dsw-alias-label-secondary);}
.dn-meta-tag{padding:0 6px;border:1px solid color-mix(in srgb,var(--dn-blue,#3355f0) 40%,transparent);border-radius:999px;font-size:11px;color:var(--dn-blue,#3355f0);background:color-mix(in srgb,var(--dn-blue,#3355f0) 9%,transparent);}
.dn-note .dn-icon{opacity:0;}
.dn-note:hover .dn-icon,.dn-note:focus-within .dn-icon{opacity:1;}
@media (hover:none){.dn-note .dn-icon{opacity:1;}}
.dn-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:44px 20px;text-align:center;color:var(--dsw-alias-label-secondary);}
.dn-empty-title{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);}
.dn-empty-hint{font-size:12px;max-width:320px;}
.dn-undo{display:flex;align-items:center;gap:10px;padding:9px 18px;border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);font-size:12.5px;color:var(--dsw-alias-label-secondary);}
.dn-undo-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dn-textbtn{padding:0;border:0;background:transparent;color:var(--dsw-alias-brand-primary);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;}
.dn-detail{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:10px;padding:12px 18px 18px;}
.dn-back{align-self:flex-start;display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 8px 0 4px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12.5px;cursor:pointer;}
.dn-back:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}
.dn-detail-text{flex:1;font-size:14px;line-height:1.75;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;}
.dn-detail-meta{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:11.5px;color:var(--dsw-alias-label-secondary);}
.dn-detail-actions{display:flex;justify-content:flex-end;gap:8px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l1);}
.dn-danger{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:transparent;color:var(--dsw-alias-state-error-primary);font:inherit;font-size:12.5px;cursor:pointer;transition:background .12s;}
.dn-danger:hover{background:var(--dsw-alias-bg-layer-2);}
.dn-edit{display:flex;flex:1;min-height:0;flex-direction:column;gap:10px;}
.dn-edit-input{flex:1;min-height:140px;max-height:none;}
.dn-edit-actions{display:flex;justify-content:flex-end;gap:8px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l1);}
.dn-ghost{display:inline-flex;align-items:center;height:30px;padding:0 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12.5px;cursor:pointer;transition:background .12s,color .12s;}
.dn-ghost:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}
.dn-limit{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:0 2px;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary);}
.dn-limit[data-over="true"]{color:var(--dsw-alias-state-warn-primary);}
.dn-tabs-end{margin-left:auto;font-size:12px;}
.dn-bulk{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:9px 18px;border-bottom:1px solid var(--dsw-alias-border-l1);}
.dn-bulkbtn{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;cursor:pointer;transition:border-color .12s,background .12s;}
.dn-bulkbtn:hover:not(:disabled){border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);}
.dn-bulkbtn:disabled{opacity:.4;cursor:not-allowed;}
.dn-bulkbtn[data-open="true"]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);}
.dn-bulk-danger{color:var(--dsw-alias-state-error-primary);}
.dn-bulk-count{margin-left:auto;font-size:11.5px;color:var(--dsw-alias-label-secondary);}
.dn-bulk-move{position:relative;}
.dn-menu{position:absolute;top:calc(100% + 6px);left:0;z-index:30;width:212px;max-height:250px;overflow:auto;padding:6px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1);}
.dn-menu-item{display:block;width:100%;padding:6px 8px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;text-align:left;cursor:pointer;}
.dn-menu-item:hover{background:var(--dsw-alias-bg-layer-2);}
.dn-menu-empty{padding:6px 8px;font-size:12px;color:var(--dsw-alias-label-secondary);}
.dn-menu-new{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:6px;padding:8px 6px 4px;border-top:1px solid var(--dsw-alias-border-l1);}
.dn-menu-label{width:100%;font-size:11.5px;color:var(--dsw-alias-label-secondary);}
.dn-menu-new input{flex:1;min-width:0;height:26px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;}
.dn-menu-new input:focus{outline:none;border-color:var(--dsw-alias-brand-primary);}
.dn-menu-add{height:26px;padding:0 10px;border:1px solid var(--dsw-alias-brand-primary);border-radius:6px;background:transparent;color:var(--dsw-alias-brand-primary);font:inherit;font-size:12px;cursor:pointer;}
.dn-menu-add:disabled{opacity:.4;cursor:not-allowed;}
.dn-check{flex:none;display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;margin-top:3px;border:1.5px solid var(--dsw-alias-border-l2);border-radius:5px;color:var(--dsw-alias-bg-base);}
.dn-check[data-on="true"]{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-brand-primary);}
.dn-check-btn{padding:0;margin-top:0;background:transparent;cursor:pointer;}
.dn-check-btn[data-on="true"]{background:var(--dsw-alias-brand-primary);}
.dn-note[data-selected="true"]{border-color:var(--dsw-alias-brand-primary);}
.dn-note[data-select="true"]{cursor:pointer;}
.dn-view-btn{flex:none;display:inline-flex;align-items:center;height:26px;margin-top:1px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;transition:border-color .12s,color .12s;}
.dn-view-btn:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);}
.dn-detail-head{display:flex;align-items:center;justify-content:space-between;gap:10px;}
.dn-banner{padding:8px 18px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);font-size:12px;color:var(--dsw-alias-state-warn-primary);}
.dn-trigger{display:inline-flex;align-items:center;justify-content:center;}
.dn-qn-backdrop{position:fixed;inset:0;z-index:9000;}
.dn-qn{position:fixed;z-index:9001;box-sizing:border-box;width:380px;max-width:calc(100vw - 24px);display:flex;flex-direction:column;gap:10px;padding:14px;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 16px 40px rgba(0,0,0,.22);color:var(--dsw-alias-label-primary);font-size:13px;--dn-blue:light-dark(#3355f0,#7c9dff);}
.dn-qn-head{display:flex;align-items:center;gap:8px;}
.dn-qn-title{flex:1;min-width:0;font-size:13px;font-weight:600;}
.dn-qn .dn-icon{width:24px;height:24px;border-radius:6px;}
.dn-qn .dn-input{min-height:72px;max-height:180px;}
.dn-qn-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;}
.dn-qn-loading{padding:18px 0;text-align:center;font-size:12px;color:var(--dsw-alias-label-secondary);}
`;

    /* ----------------------------------------------------------------- icons */

    const stroke = {
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.7,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    };

    function svgProps(size, extra) {
      return Object.assign(
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          'aria-hidden': 'true',
          focusable: 'false',
          style: { display: 'block' },
        },
        extra || {},
      );
    }

    function IconNotes({ size = 18 }) {
      return h(
        'svg',
        svgProps(size),
        h('path', Object.assign({ key: 'a', d: 'M6.2 3.6h8.1l3.7 3.7v11.1a2.1 2.1 0 0 1-2.1 2.1H6.2a2.1 2.1 0 0 1-2.1-2.1V5.7a2.1 2.1 0 0 1 2.1-2.1Z' }, stroke)),
        h('path', Object.assign({ key: 'b', d: 'M14.1 3.8v3.8H18' }, stroke)),
        h('path', Object.assign({ key: 'c', d: 'M8.1 11.6h6.2M8.1 15.3h4.4' }, stroke)),
      );
    }

    function IconTrash({ size = 16 }) {
      return h(
        'svg',
        svgProps(size),
        h('path', Object.assign({ key: 'a', d: 'M5 7.2h14M9.6 7.2V5.5h4.8v1.7M7.2 7.2l.8 11a1.5 1.5 0 0 0 1.5 1.4h5a1.5 1.5 0 0 0 1.5-1.4l.8-11' }, stroke)),
        h('path', Object.assign({ key: 'b', d: 'M10.4 10.6v5.4M13.6 10.6v5.4' }, stroke)),
      );
    }

    function IconClose({ size = 16 }) {
      return h(
        'svg',
        svgProps(size),
        h('path', Object.assign({ key: 'a', d: 'M6.4 6.4l11.2 11.2M17.6 6.4L6.4 17.6' }, stroke)),
      );
    }

    function IconPlus({ size = 15 }) {
      return h('svg', svgProps(size), h('path', Object.assign({ key: 'a', d: 'M12 5.5v13M5.5 12h13' }, stroke)));
    }

    function IconCheck({ size = 15 }) {
      return h('svg', svgProps(size), h('path', Object.assign({ key: 'a', d: 'M5.2 12.6l4.4 4.4 9.2-10' }, stroke)));
    }

    function IconTag({ size = 14 }) {
      return h(
        'svg',
        svgProps(size),
        h('path', Object.assign({ key: 'a', d: 'M4.6 10.1V5.4a1 1 0 0 1 1-1h4.7a1 1 0 0 1 .7.3l8 8a1 1 0 0 1 0 1.4l-4.7 4.7a1 1 0 0 1-1.4 0l-8-8a1 1 0 0 1-.3-.7Z' }, stroke)),
        h('circle', { key: 'b', cx: 8.4, cy: 8.4, r: 1.15, fill: 'currentColor' }),
      );
    }

    function IconCalendar({ size = 14 }) {
      return h(
        'svg',
        svgProps(size),
        h('rect', Object.assign({ key: 'a', x: 4.2, y: 5.6, width: 15.6, height: 13.6, rx: 2.2 }, stroke)),
        h('path', Object.assign({ key: 'b', d: 'M4.6 9.8h14.8M8.6 3.9v3.2M15.4 3.9v3.2' }, stroke)),
      );
    }

    function IconUndo({ size = 14 }) {
      return h(
        'svg',
        svgProps(size),
        h('path', Object.assign({ key: 'a', d: 'M5 9.2h8.6a4.4 4.4 0 0 1 0 8.8H9.4' }, stroke)),
        h('path', Object.assign({ key: 'b', d: 'M8.2 5.6L5 9.2l3.2 3.6' }, stroke)),
      );
    }

    function IconBack({ size = 14 }) {
      return h(
        'svg',
        svgProps(size),
        h('path', Object.assign({ key: 'a', d: 'M14.4 5.4L7.8 12l6.6 6.6' }, stroke)),
        h('path', Object.assign({ key: 'b', d: 'M8.2 12h9.6' }, stroke)),
      );
    }

    function IconEdit({ size = 15 }) {
      return h(
        'svg',
        svgProps(size),
        h('path', Object.assign({ key: 'a', d: 'M4.4 19.6h3.7L19.3 8.4a2 2 0 0 0-2.8-2.8L5.3 16.8l-.9 2.8Z' }, stroke)),
        h('path', Object.assign({ key: 'b', d: 'M14.9 7.2l2.8 2.8' }, stroke)),
      );
    }

    function IconChevron({ size = 12 }) {
      return h(
        'svg',
        svgProps(size),
        h('path', Object.assign({ key: 'a', d: 'M6 9.2l6 6 6-6' }, stroke)),
      );
    }

    function IconArrowRight({ size = 16 }) {
      return h(
        'svg',
        svgProps(size),
        h('path', Object.assign({ key: 'a', d: 'M4.6 12h13.6' }, stroke)),
        h('path', Object.assign({ key: 'b', d: 'M12.6 6.4L18.2 12l-5.6 5.6' }, stroke)),
      );
    }

    /* ---------------------------------------------------------------- panel */

    function formatIntl(localeId, options) {
      try {
        return new Intl.DateTimeFormat(localeId, options);
      } catch {
        try {
          return new Intl.DateTimeFormat(undefined, options);
        } catch {
          return null;
        }
      }
    }

    function NotesPanel(props) {
      const { t, locale, close } = props;

      const tr = useCallback(
        (key) => {
          let value;
          try {
            value = t(key);
          } catch {
            value = key;
          }
          if (typeof value === 'string' && value !== key) return value;
          return zh[key] !== undefined ? zh[key] : key;
        },
        [t],
      );

      const [localeId, setLocaleId] = useState(() => activeLocaleOf(locale));
      const [data, setData] = useState(EMPTY);
      const [phase, setPhase] = useState('loading');
      const [notice, setNotice] = useState('');
      const [draft, setDraft] = useState('');
      const [tagDraft, setTagDraft] = useState('');
      const [selected, setSelected] = useState([]);
      const [tab, setTab] = useState('date');
      const [undo, setUndo] = useState(null);
      const [detailId, setDetailId] = useState(null);
      const [editing, setEditing] = useState(false);
      const [editText, setEditText] = useState('');
      const [editTags, setEditTags] = useState([]);
      const [selectMode, setSelectMode] = useState(false);
      const [picked, setPicked] = useState([]);
      const [moveOpen, setMoveOpen] = useState(false);
      const [newTagName, setNewTagName] = useState('');
      const [collapsed, setCollapsed] = useState(false);
      const [folded, setFolded] = useState({});

      const aliveRef = useRef(true);
      // Writes are refused until the first load settles, so an empty in-memory
      // snapshot can never be persisted over the real store.
      const readyRef = useRef(false);
      // Last revision the Host reported; sent back so a newer writer wins.
      const revRef = useRef(null);
      const queueRef = useRef(Promise.resolve());
      const textareaRef = useRef(null);
      const trRef = useRef(tr);
      trRef.current = tr;

      useEffect(() => {
        if (!locale || typeof locale.subscribe !== 'function') return undefined;
        return locale.subscribe(() => setLocaleId(activeLocaleOf(locale)));
      }, [locale]);

      const dateFmt = useMemo(
        () => formatIntl(localeId, { year: 'numeric', month: 'short', day: 'numeric' }),
        [localeId],
      );
      const timeFmt = useMemo(
        () => formatIntl(localeId, { hour: '2-digit', minute: '2-digit' }),
        [localeId],
      );

      const formatDay = useCallback(
        (key) => {
          const parts = key.split('-').map(Number);
          const date = new Date(parts[0], parts[1] - 1, parts[2]);
          const isZh = String(localeId).toLowerCase().indexOf('zh') === 0;
          const names = isZh
            ? ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
            : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          const week = Number.isNaN(date.getTime()) ? '' : names[date.getDay()];
          const ymd = parts[0] + '/' + pad2(parts[1]) + '/' + pad2(parts[2]);
          return week ? ymd + ' ' + week : key;
        },
        [localeId],
      );

      const formatTime = useCallback(
        (iso) => {
          const date = new Date(iso);
          if (Number.isNaN(date.getTime())) return '';
          if (timeFmt) {
            try {
              return timeFmt.format(date);
            } catch {
              // fall through
            }
          }
          return pad2(date.getHours()) + ':' + pad2(date.getMinutes());
        },
        [timeFmt],
      );

      /* --------------------------------------------------------------- load */

      const reload = useCallback(async () => {
        const mirror = readMirror();
        try {
          const response = await fetch(ROUTE_PATH, { cache: 'no-store', credentials: 'same-origin' });
          if (!response.ok) throw new Error('HTTP ' + response.status);
          const body = await response.json();
          if (!body || body.ok !== true) throw new Error((body && body.error) || 'bad response');
          if (!aliveRef.current) return;
          const next = normalize(body.data);
          revRef.current = typeof body.rev === 'string' ? body.rev : null;
          readyRef.current = true;
          setData(next);
          writeMirror(next);
          if (body.recovered) setNotice(trRef.current('recovered'));
          setPhase('ready');
        } catch (error) {
          if (!aliveRef.current) return;
          // No revision was read, so the next write carries none and the Host
          // keeps its previous unconditional behaviour instead of conflicting.
          readyRef.current = true;
          setData(mirror || EMPTY());
          setNotice(trRef.current('offline'));
          setPhase('ready');
          console.error('[dsh-notes] state load failed', error);
        }
      }, []);

      useEffect(() => {
        aliveRef.current = true;
        reload();
        // The quick-note dialog writes through the same route; refresh so the
        // open panel shows the new note instead of waiting for the next conflict.
        const onChanged = () => {
          reload();
        };
        window.addEventListener('dsh-notes:changed', onChanged);
        return () => {
          aliveRef.current = false;
          window.removeEventListener('dsh-notes:changed', onChanged);
        };
      }, [reload]);

      useEffect(() => {
        const node = textareaRef.current;
        if (node) node.focus();
      }, []);

      useEffect(() => {
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return;
          if (moveOpen) {
            setMoveOpen(false);
            return;
          }
          if (editing) {
            setEditing(false);
            return;
          }
          if (detailId) {
            setDetailId(null);
            return;
          }
          if (selectMode) {
            setSelectMode(false);
            setPicked([]);
            return;
          }
          close();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
      }, [close, detailId, editing, moveOpen, selectMode]);

      useEffect(() => {
        if (!undo) return undefined;
        const timer = setTimeout(() => setUndo(null), UNDO_TIMEOUT);
        return () => clearTimeout(timer);
      }, [undo]);

      /* -------------------------------------------------------------- write */

      const persist = useCallback((next) => {
        writeMirror(next);
        queueRef.current = queueRef.current.then(async () => {
          try {
            const payload = { data: next };
            if (revRef.current !== null) payload.ifRev = revRef.current;
            const response = await fetch(ROUTE_PATH, {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(payload),
            });
            if (response.status === 409) {
              // Someone else wrote first. Take their version rather than
              // overwriting it, and drop the pending undo snapshot.
              const conflict = await response.json().catch(() => null);
              if (conflict && conflict.data) {
                const fresh = normalize(conflict.data);
                revRef.current = typeof conflict.rev === 'string' ? conflict.rev : null;
                setData(fresh);
                writeMirror(fresh);
                setUndo(null);
                if (aliveRef.current) setNotice(trRef.current('conflict'));
              }
              return;
            }
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const saved = await response.json().catch(() => null);
            if (saved && typeof saved.rev === 'string') revRef.current = saved.rev;
            if (
              saved &&
              typeof saved.notes === 'number' &&
              (saved.notes !== next.notes.length || saved.tags !== next.tags.length)
            ) {
              // The Host stored fewer entries than were sent (caps or rejected
              // rows), so reload instead of leaving a lie on screen.
              const reload = await fetch(ROUTE_PATH, { cache: 'no-store', credentials: 'same-origin' });
              if (reload.ok) {
                const body = await reload.json();
                if (body && body.ok === true) {
                  const fresh = normalize(body.data);
                  revRef.current = typeof body.rev === 'string' ? body.rev : null;
                  setData(fresh);
                  writeMirror(fresh);
                  if (aliveRef.current) setNotice(trRef.current('trimmed'));
                  return;
                }
              }
            }
            if (aliveRef.current) setNotice('');
          } catch (error) {
            if (aliveRef.current) setNotice(trRef.current('offline'));
            console.error('[dsh-notes] state save failed', error);
          }
        });
      }, []);

      const commit = useCallback(
        (next, undoEntry) => {
          if (!readyRef.current) return;
          setData(next);
          if (undoEntry !== undefined) setUndo(undoEntry);
          persist(next);
        },
        [persist],
      );

      /* ------------------------------------------------------------ actions */

      const saveNote = useCallback(() => {
        // Clearing the draft is irreversible, so refuse before it happens.
        if (!readyRef.current) return;
        const body = draft.trim().slice(0, MAX_NOTE_CHARS);
        if (body === '') return;
        const note = {
          id: uid(),
          text: body,
          createdAt: new Date().toISOString(),
          tags: selected.slice(),
        };
        const next = { notes: [note].concat(data.notes), tags: data.tags };
        setDraft('');
        setSelected([]);
        commit(next, null);
        if (textareaRef.current) textareaRef.current.focus();
      }, [commit, data.notes, data.tags, draft, selected]);

      const deleteNote = useCallback(
        (note) => {
          const next = { notes: data.notes.filter((item) => item.id !== note.id), tags: data.tags };
          commit(next, { message: trRef.current('deletedNote') + ' · ' + snippet(note.text), data });
        },
        [commit, data],
      );

      const undoLast = useCallback(() => {
        if (!undo) return;
        const restored = undo.data;
        setUndo(null);
        commit(restored);
      }, [commit, undo]);

      const toggleTag = useCallback((tagId) => {
        setSelected((previous) =>
          previous.indexOf(tagId) === -1 ? previous.concat([tagId]) : previous.filter((item) => item !== tagId),
        );
      }, []);

      const addTag = useCallback(() => {
        if (!readyRef.current) return;
        const name = tagDraft.trim();
        if (name === '') return;
        const existing = data.tags.find((tag) => tag.name.toLowerCase() === name.toLowerCase());
        if (existing) {
          setSelected((previous) => (previous.indexOf(existing.id) === -1 ? previous.concat([existing.id]) : previous));
          setTagDraft('');
          return;
        }
        if (data.tags.length >= MAX_TAGS) return;
        const tag = { id: uid(), name: name.slice(0, 20) };
        const next = { notes: data.notes, tags: data.tags.concat([tag]) };
        setSelected((previous) => previous.concat([tag.id]));
        setTagDraft('');
        commit(next);
      }, [commit, data.notes, data.tags, tagDraft]);

      const deleteTag = useCallback(
        (tag) => {
          const next = {
            notes: data.notes.map((note) => ({
              id: note.id,
              text: note.text,
              createdAt: note.createdAt,
              tags: note.tags.filter((id) => id !== tag.id),
            })),
            tags: data.tags.filter((item) => item.id !== tag.id),
          };
          setSelected((previous) => previous.filter((id) => id !== tag.id));
          commit(next, { message: trRef.current('deletedTag') + ' · ' + tag.name, data });
        },
        [commit, data],
      );

      /* ------------------------------------------------------------- groups */

      const sorted = useMemo(() => {
        return data.notes.slice().sort((left, right) => {
          if (left.createdAt === right.createdAt) return 0;
          return left.createdAt < right.createdAt ? 1 : -1;
        });
      }, [data.notes]);

      const dayGroups = useMemo(() => {
        const groups = [];
        let current = null;
        for (const note of sorted) {
          const key = dayKeyOf(note.createdAt);
          if (!current || current.key !== key) {
            current = { key, notes: [] };
            groups.push(current);
          }
          current.notes.push(note);
        }
        return groups;
      }, [sorted]);

      const tagGroups = useMemo(() => {
        const groups = [];
        const claimed = new Set();
        for (const tag of data.tags) {
          const notes = sorted.filter((note) => note.tags.indexOf(tag.id) !== -1);
          if (notes.length === 0) continue;
          for (const note of notes) claimed.add(note.id);
          groups.push({ key: tag.id, tag, notes });
        }
        const loose = sorted.filter((note) => !claimed.has(note.id));
        if (loose.length > 0) groups.push({ key: '__untagged', tag: null, notes: loose });
        return groups;
      }, [data.tags, sorted]);

      const tagById = useMemo(() => {
        const map = new Map();
        for (const tag of data.tags) map.set(tag.id, tag);
        return map;
      }, [data.tags]);

      const detail = useMemo(() => {
        if (!detailId) return null;
        return data.notes.find((note) => note.id === detailId) || null;
      }, [data.notes, detailId]);

      const deleteFromDetail = useCallback(() => {
        if (!detail) return;
        setDetailId(null);
        setPicked((previous) => previous.filter((id) => id !== detail.id));
        deleteNote(detail);
      }, [deleteNote, detail]);

      const openDetail = useCallback((note) => {
        setEditing(false);
        setDetailId(note.id);
      }, []);

      const startEdit = useCallback(() => {
        if (!detail) return;
        setEditText(detail.text);
        setEditTags(detail.tags.slice());
        setEditing(true);
      }, [detail]);

      const cancelEdit = useCallback(() => setEditing(false), []);

      const toggleEditTag = useCallback((tagId) => {
        setEditTags((previous) =>
          previous.indexOf(tagId) === -1 ? previous.concat([tagId]) : previous.filter((item) => item !== tagId),
        );
      }, []);

      const saveEdit = useCallback(() => {
        if (!detail) return;
        const body = editText.trim().slice(0, MAX_NOTE_CHARS);
        if (body === '') return;
        const next = {
          // createdAt is carried over untouched, so the note keeps its date group.
          notes: data.notes.map((note) =>
            note.id === detail.id
              ? { id: note.id, text: body, createdAt: note.createdAt, tags: editTags.slice() }
              : note,
          ),
          tags: data.tags.slice(),
        };
        setEditing(false);
        commit(next, null);
      }, [commit, data.notes, data.tags, detail, editTags, editText]);

      /* ---------------------------------------------------------- selection */

      const toggleSelectMode = useCallback(() => {
        setMoveOpen(false);
        setNewTagName('');
        setPicked([]);
        setSelectMode((previous) => !previous);
      }, []);

      const togglePick = useCallback((noteId) => {
        setPicked((previous) =>
          previous.indexOf(noteId) === -1 ? previous.concat([noteId]) : previous.filter((id) => id !== noteId),
        );
      }, []);

      const togglePickMany = useCallback((ids) => {
        setPicked((previous) => {
          const allPicked = ids.length > 0 && ids.every((id) => previous.indexOf(id) !== -1);
          if (allPicked) return previous.filter((id) => ids.indexOf(id) === -1);
          const next = previous.slice();
          ids.forEach((id) => {
            if (next.indexOf(id) === -1) next.push(id);
          });
          return next;
        });
      }, []);

      const toggleFold = useCallback((groupKey) => {
        setFolded((previous) => {
          const next = Object.assign({}, previous);
          if (next[groupKey]) delete next[groupKey];
          else next[groupKey] = true;
          return next;
        });
      }, []);

      const mergePicked = useCallback(() => {
        const chosen = data.notes
          .filter((note) => picked.indexOf(note.id) !== -1)
          .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
        if (chosen.length < 2) return;
        const text = chosen
          .map((note) => note.text)
          .join('\n\n')
          .slice(0, MAX_NOTE_CHARS);
        const tags = [];
        for (const note of chosen) {
          for (const tagId of note.tags) if (tags.indexOf(tagId) === -1) tags.push(tagId);
        }
        // The merged record inherits the oldest timestamp, so it lands in the earliest date group.
        const merged = { id: uid(), text, createdAt: chosen[0].createdAt, tags };
        const rest = data.notes.filter((note) => picked.indexOf(note.id) === -1);
        const next = { notes: [merged].concat(rest), tags: data.tags };
        setPicked([]);
        commit(next, { message: trRef.current('mergedNote').replace('{n}', String(chosen.length)), data });
      }, [commit, data, picked]);

      const movePickedTo = useCallback(
        (tagId, freshName) => {
          if (picked.length === 0) return;
          let tags = data.tags;
          let target = tagId;
          if (!target) {
            const name = (freshName || '').trim().slice(0, 20);
            if (name === '') return;
            const existing = tags.find((tag) => tag.name.toLowerCase() === name.toLowerCase());
            if (existing) {
              target = existing.id;
            } else {
              if (tags.length >= MAX_TAGS) return;
              const created = { id: uid(), name };
              tags = tags.concat([created]);
              target = created.id;
            }
          }
          const notes = data.notes.map((note) => {
            if (picked.indexOf(note.id) === -1) return note;
            if (note.tags.indexOf(target) !== -1) return note;
            return { id: note.id, text: note.text, createdAt: note.createdAt, tags: note.tags.concat([target]) };
          });
          const next = { notes, tags };
          setPicked([]);
          setMoveOpen(false);
          setNewTagName('');
          commit(next, { message: trRef.current('movedNote').replace('{n}', String(picked.length)), data });
        },
        [commit, data, picked],
      );

      const deletePicked = useCallback(() => {
        if (picked.length === 0) return;
        const next = { notes: data.notes.filter((note) => picked.indexOf(note.id) === -1), tags: data.tags };
        setPicked([]);
        commit(next, { message: trRef.current('deletedSelected').replace('{n}', String(picked.length)), data });
      }, [commit, data, picked]);

      /* ------------------------------------------------------------- render */

      const renderLimit = (count) =>
        h(
          'div',
          {
            className: 'dn-limit',
            key: 'limit',
            'data-over': count > MAX_NOTE_CHARS ? 'true' : 'false',
          },
          h('span', { className: 'dn-limit-note' }, tr('limitNote').replace('{n}', String(MAX_NOTE_CHARS))),
          h(
            'span',
            { className: 'dn-limit-count' },
            count + ' / ' + MAX_NOTE_CHARS + (count > MAX_NOTE_CHARS ? ' · ' + tr('overLimit') : ''),
          ),
        );

      const renderNote = (note) => {
        const isPicked = picked.indexOf(note.id) !== -1;
        return h(
          'div',
          {
            className: 'dn-note',
            key: note.id,
            'data-selected': isPicked ? 'true' : 'false',
            'data-select': selectMode ? 'true' : 'false',
            onClick: selectMode ? () => togglePick(note.id) : undefined,
          },
          selectMode
            ? h(
                'span',
                { className: 'dn-check', key: 'check', 'data-on': isPicked ? 'true' : 'false', 'aria-hidden': 'true' },
                isPicked ? h(IconCheck, { size: 12 }) : null,
              )
            : null,
          h(
            'button',
            {
              type: 'button',
              className: 'dn-note-open',
              title: selectMode ? tr('togglePick') : tr('openNote'),
              'aria-label': selectMode ? tr('togglePick') : tr('openNote'),
              'aria-pressed': selectMode ? (isPicked ? 'true' : 'false') : undefined,
              onClick: (event) => {
                event.stopPropagation();
                if (selectMode) togglePick(note.id);
                else openDetail(note);
              },
            },
            h('div', { className: 'dn-note-text' }, note.text),
            h(
              'div',
              { className: 'dn-meta' },
              h('span', { key: 'time' }, formatTime(note.createdAt)),
              note.tags.map((tagId) => {
                const tag = tagById.get(tagId);
                if (!tag) return null;
                return h('span', { className: 'dn-meta-tag', key: tagId }, tag.name);
              }),
            ),
          ),
          selectMode
            ? h(
                'button',
                {
                  key: 'view',
                  type: 'button',
                  className: 'dn-view-btn',
                  onClick: (event) => {
                    event.stopPropagation();
                    openDetail(note);
                  },
                },
                tr('view'),
              )
            : h(
                'button',
                {
                  key: 'delete',
                  type: 'button',
                  className: 'dn-icon dn-icon-danger',
                  title: tr('deleteNote'),
                  'aria-label': tr('deleteNote'),
                  onClick: () => deleteNote(note),
                },
                h(IconTrash, { size: 15 }),
              ),
        );
      };

      const renderTile = (note) => {
        const isPicked = picked.indexOf(note.id) !== -1;
        return h(
          'div',
          {
            className: 'dn-tile',
            key: note.id,
            'data-selected': isPicked ? 'true' : 'false',
            'data-select': selectMode ? 'true' : 'false',
            role: 'button',
            tabIndex: 0,
            title: selectMode ? tr('togglePick') : tr('openNote'),
            onClick: () => (selectMode ? togglePick(note.id) : openDetail(note)),
            onKeyDown: (event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              if (selectMode) togglePick(note.id);
              else openDetail(note);
            },
          },
          selectMode
            ? h(
                'span',
                {
                  className: 'dn-check dn-check-tile',
                  key: 'check',
                  'data-on': isPicked ? 'true' : 'false',
                  'aria-hidden': 'true',
                },
                isPicked ? h(IconCheck, { size: 12 }) : null,
              )
            : null,
          h('div', { className: 'dn-tile-text', key: 'text' }, note.text),
          h(
            'div',
            { className: 'dn-tile-tags', key: 'tags' },
            note.tags.slice(0, 2).map((tagId) => {
              const tag = tagById.get(tagId);
              if (!tag) return null;
              return h('span', { className: 'dn-tile-tag', key: tagId }, tag.name);
            }),
          ),
          h(
            'div',
            { className: 'dn-tile-meta', key: 'meta' },
            h('span', { className: 'dn-tile-time' }, formatTime(note.createdAt)),
            selectMode
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'dn-tile-btn',
                    onClick: (event) => {
                      event.stopPropagation();
                      openDetail(note);
                    },
                  },
                  tr('view'),
                )
              : h(
                  'button',
                  {
                    type: 'button',
                    className: 'dn-tile-btn dn-tile-del',
                    title: tr('deleteNote'),
                    'aria-label': tr('deleteNote'),
                    onClick: (event) => {
                      event.stopPropagation();
                      deleteNote(note);
                    },
                  },
                  h(IconTrash, { size: 12 }),
                ),
          ),
        );
      };

      const renderGroup = (group, label, icon, trailing) => {
        const ids = group.notes.map((note) => note.id);
        const pickedCount = ids.filter((id) => picked.indexOf(id) !== -1).length;
        const checkState =
          ids.length > 0 && pickedCount === ids.length ? 'true' : pickedCount > 0 ? 'mixed' : 'false';
        const isFolded = folded[group.key] === true;
        return h(
          'section',
          { className: 'dn-group', key: group.key, 'data-folded': isFolded ? 'true' : 'false' },
          h(
            'div',
            { className: 'dn-grouphead' },
            h('span', { className: 'dn-groupname' }, icon, label),
            h('span', { className: 'dn-groupcount' }, String(group.notes.length)),
            selectMode
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'dn-check dn-check-head',
                    'data-on': checkState,
                    title: tr('selectGroup'),
                    'aria-label': tr('selectGroup'),
                    'aria-pressed': checkState === 'true' ? 'true' : 'false',
                    onClick: () => togglePickMany(ids),
                  },
                  checkState === 'true'
                    ? h(IconCheck, { size: 12 })
                    : checkState === 'mixed'
                      ? h('span', { className: 'dn-check-dash' })
                      : null,
                )
              : null,
            trailing || null,
            h(
              'button',
              {
                type: 'button',
                className: 'dn-groupfold',
                'data-folded': isFolded ? 'true' : 'false',
                title: isFolded ? tr('expand') : tr('collapse'),
                'aria-label': isFolded ? tr('expand') : tr('collapse'),
                'aria-expanded': isFolded ? 'false' : 'true',
                onClick: () => toggleFold(group.key),
              },
              h(IconChevron, { size: 13 }),
            ),
          ),
          isFolded
            ? h(
                'div',
                { className: 'dn-stripwrap', key: 'strip' },
                h(
                  'div',
                  { className: 'dn-strip' },
                  group.notes.map(renderTile),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dn-more',
                    title: tr('more'),
                    'aria-label': tr('more'),
                    onClick: (event) => {
                      const wrap = event.currentTarget.parentElement;
                      const strip = wrap ? wrap.querySelector('.dn-strip') : null;
                      if (strip) strip.scrollBy({ left: Math.max(220, strip.clientWidth * 0.8), behavior: 'smooth' });
                    },
                  },
                  h(IconArrowRight, { size: 20 }),
                ),
              )
            : h('div', { className: 'dn-notes', key: 'notes' }, group.notes.map(renderNote)),
        );
      };

      const renderEmpty = (title, hint, icon) =>
        h(
          'div',
          { className: 'dn-empty' },
          icon,
          h('div', { className: 'dn-empty-title' }, title),
          h('div', { className: 'dn-empty-hint' }, hint),
        );

      let body;
      if (phase === 'loading') {
        body = renderEmpty(tr('loading'), '', h(IconNotes, { size: 30 }));
      } else if (tab === 'date') {
        body =
          dayGroups.length === 0
            ? renderEmpty(tr('emptyTitle'), tr('emptyHint'), h(IconNotes, { size: 30 }))
            : dayGroups.map((group) =>
                renderGroup(group, formatDay(group.key), h(IconCalendar, { size: 13 }), null),
              );
      } else if (data.tags.length === 0 && data.notes.length === 0) {
        body = renderEmpty(tr('emptyTagTitle'), tr('emptyTagHint'), h(IconTag, { size: 30 }));
      } else if (tagGroups.length === 0) {
        body = renderEmpty(tr('emptyTitle'), tr('emptyHint'), h(IconNotes, { size: 30 }));
      } else {
        body = tagGroups.map((group) =>
          renderGroup(
            group,
            group.tag ? group.tag.name : tr('untagged'),
            group.tag ? h(IconTag, { size: 13 }) : h(IconNotes, { size: 13 }),
            group.tag
              ? h(
                  'button',
                  {
                    key: 'remove',
                    type: 'button',
                    className: 'dn-icon dn-icon-danger',
                    title: tr('deleteTag'),
                    'aria-label': tr('deleteTag'),
                    onClick: () => deleteTag(group.tag),
                  },
                  h(IconClose, { size: 12 }),
                )
              : null,
          ),
        );
      }

      const allPicked = data.notes.length > 0 && data.notes.every((note) => picked.indexOf(note.id) !== -1);

      return h(
        'div',
        { className: 'dn-root', 'data-compact': selectMode || collapsed ? 'true' : 'false' },
        h(
          'div',
          {
            className: 'dn-shell',
            role: 'dialog',
            'aria-labelledby': 'dsh-notes-title',
          },
          h(
            'div',
            { className: 'dn-head' },
            h(IconNotes, { size: 20 }),
            h(
              'div',
              { className: 'dn-headline' },
              h('h2', { className: 'dn-title', id: 'dsh-notes-title' }, tr('title')),
              h(
                'div',
                { className: 'dn-sub' },
                data.notes.length + ' ' + tr('subtitleUnitNotes') + ' · ' + data.tags.length + ' ' + tr('subtitleUnitTags'),
              ),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dn-icon',
                title: tr('close'),
                'aria-label': tr('close'),
                onClick: close,
              },
              h(IconClose, { size: 16 }),
            ),
          ),
          notice ? h('div', { className: 'dn-banner', key: 'banner' }, notice) : null,
          detail
            ? h(
                'div',
                { className: 'dn-detail', key: 'detail' },
                h(
                  'div',
                  { className: 'dn-detail-head', key: 'head' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dn-back',
                      onClick: () => (editing ? cancelEdit() : setDetailId(null)),
                    },
                    h(IconBack, { size: 14 }),
                    tr('back'),
                  ),
                  selectMode
                    ? h(
                        'button',
                        {
                          type: 'button',
                          className: 'dn-check dn-check-btn',
                          'data-on': picked.indexOf(detail.id) === -1 ? 'false' : 'true',
                          'aria-pressed': picked.indexOf(detail.id) === -1 ? 'false' : 'true',
                          'aria-label': tr('togglePick'),
                          onClick: () => togglePick(detail.id),
                        },
                        picked.indexOf(detail.id) === -1 ? null : h(IconCheck, { size: 12 }),
                      )
                    : null,
                ),
                editing
                  ? h(
                      'div',
                      { className: 'dn-edit', key: 'edit' },
                      h('textarea', {
                        className: 'dn-input dn-edit-input',
                        value: editText,
                        rows: 6,
                        autoFocus: true,
                        placeholder: tr('editPlaceholder'),
                        'aria-label': tr('edit'),
                        onChange: (event) => setEditText(event.target.value),
                        onKeyDown: (event) => {
                          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                            event.preventDefault();
                            saveEdit();
                          }
                        },
                      }),
                      data.tags.length > 0
                        ? h(
                            'div',
                            { className: 'dn-tagline', key: 'edittags' },
                            h('span', { className: 'dn-chiplabel' }, tr('tags')),
                            data.tags.map((tag) =>
                              h(
                                'button',
                                {
                                  key: tag.id,
                                  type: 'button',
                                  className: 'dn-chip',
                                  'data-on': editTags.indexOf(tag.id) === -1 ? 'false' : 'true',
                                  onClick: () => toggleEditTag(tag.id),
                                },
                                tag.name,
                              ),
                            ),
                          )
                        : null,
                      renderLimit(editText.length),
                      h(
                        'div',
                        { className: 'dn-edit-actions', key: 'editactions' },
                        h(
                          'button',
                          { type: 'button', className: 'dn-ghost', onClick: cancelEdit },
                          tr('cancel'),
                        ),
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'dn-primary',
                            disabled: editText.trim() === '',
                            onClick: saveEdit,
                          },
                          h(IconCheck, { size: 15 }),
                          tr('saveChanges'),
                        ),
                      ),
                    )
                  : h(
                      React.Fragment,
                      { key: 'view' },
                      h('div', { className: 'dn-detail-text' }, detail.text),
                      h(
                        'div',
                        { className: 'dn-detail-meta' },
                        h(
                          'span',
                          { key: 'created' },
                          tr('created') + ' ' + formatDay(dayKeyOf(detail.createdAt)) + ' ' + formatTime(detail.createdAt),
                        ),
                        detail.tags.map((tagId) => {
                          const tag = tagById.get(tagId);
                          if (!tag) return null;
                          return h('span', { className: 'dn-meta-tag', key: tagId }, tag.name);
                        }),
                      ),
                      h(
                        'div',
                        { className: 'dn-detail-actions' },
                        h(
                          'button',
                          { type: 'button', className: 'dn-primary', onClick: startEdit },
                          h(IconEdit, { size: 15 }),
                          tr('edit'),
                        ),
                        h(
                          'button',
                          { type: 'button', className: 'dn-danger', onClick: deleteFromDetail },
                          h(IconTrash, { size: 15 }),
                          tr('deleteNote'),
                        ),
                      ),
                    ),
              )
            : null,
          detail || selectMode || collapsed ? null : h(
            'div',
            { className: 'dn-compose' },
            h('textarea', {
              key: 'input',
              ref: textareaRef,
              className: 'dn-input',
              rows: 3,
              value: draft,
              placeholder: tr('placeholder'),
              'aria-label': tr('placeholder'),
              onChange: (event) => setDraft(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  saveNote();
                }
              },
            }),
            h(
              'div',
              { className: 'dn-tagline', key: 'tags' },
              data.tags.length > 0 ? h('span', { className: 'dn-chiplabel' }, tr('tags')) : null,
              data.tags.map((tag) =>
                h(
                  'button',
                  {
                    key: tag.id,
                    type: 'button',
                    className: 'dn-chip',
                    'data-on': selected.indexOf(tag.id) === -1 ? 'false' : 'true',
                    title: tag.name,
                    onClick: () => toggleTag(tag.id),
                  },
                  tag.name,
                ),
              ),
              h(
                'span',
                { className: 'dn-newtag', key: 'newtag' },
                h('input', {
                  value: tagDraft,
                  placeholder: tr('newTagPlaceholder'),
                  maxLength: 20,
                  'aria-label': tr('newTagPlaceholder'),
                  onChange: (event) => setTagDraft(event.target.value),
                  onKeyDown: (event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addTag();
                    }
                  },
                }),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dn-icon',
                    title: tr('addTag'),
                    'aria-label': tr('addTag'),
                    disabled: tagDraft.trim() === '' || phase !== 'ready',
                    onClick: addTag,
                  },
                  h(IconPlus, { size: 15 }),
                ),
              ),
            ),
            h(
              'div',
              { className: 'dn-rowend', key: 'actions' },
              h('span', { className: 'dn-hint' }, tr('hint')),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dn-primary',
                  disabled: draft.trim() === '' || phase !== 'ready',
                  onClick: saveNote,
                },
                h(IconCheck, { size: 15 }),
                tr('save'),
              ),
            ),
            renderLimit(draft.length),
          ),
          detail || selectMode ? null : h(
            'div',
            { className: 'dn-fold', key: 'fold' },
            h(
              'button',
              {
                type: 'button',
                className: 'dn-foldbtn',
                'data-collapsed': collapsed ? 'true' : 'false',
                'aria-expanded': collapsed ? 'false' : 'true',
                title: collapsed ? tr('expand') : tr('collapse'),
                onClick: () => setCollapsed((previous) => !previous),
              },
              h(IconChevron, { size: 12 }),
              collapsed ? tr('expand') : tr('collapse'),
            ),
          ),
          detail ? null : h(
            'div',
            { className: 'dn-tabs', role: 'tablist' },
            h(
              'button',
              {
                type: 'button',
                role: 'tab',
                className: 'dn-tab',
                'data-active': tab === 'date' ? 'true' : 'false',
                'aria-selected': tab === 'date' ? 'true' : 'false',
                onClick: () => setTab('date'),
              },
              h(IconCalendar, { size: 14 }),
              tr('byDate'),
            ),
            h(
              'button',
              {
                type: 'button',
                role: 'tab',
                className: 'dn-tab',
                'data-active': tab === 'tag' ? 'true' : 'false',
                'aria-selected': tab === 'tag' ? 'true' : 'false',
                onClick: () => setTab('tag'),
              },
              h(IconTag, { size: 14 }),
              tr('byTag'),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dn-tab dn-tabs-end',
                'data-active': selectMode ? 'true' : 'false',
                onClick: toggleSelectMode,
              },
              h(IconCheck, { size: 14 }),
              selectMode ? tr('cancelSelect') : tr('selectMode'),
            ),
          ),
          detail ? null : selectMode
            ? h(
                'div',
                { className: 'dn-bulk', key: 'bulk' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dn-bulkbtn',
                    disabled: data.notes.length === 0,
                    onClick: () => {
                      setPicked(allPicked ? [] : data.notes.map((note) => note.id));
                    },
                  },
                  allPicked ? tr('clearAll') : tr('selectAll'),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dn-bulkbtn',
                    disabled: picked.length < 2,
                    onClick: mergePicked,
                  },
                  tr('merge'),
                ),
                h(
                  'div',
                  { className: 'dn-bulk-move', key: 'move' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dn-bulkbtn',
                      'data-open': moveOpen ? 'true' : 'false',
                      disabled: picked.length === 0,
                      onClick: () => setMoveOpen((previous) => !previous),
                    },
                    tr('moveTo'),
                    h(IconChevron, { size: 12 }),
                  ),
                  moveOpen
                    ? h(
                        'div',
                        { className: 'dn-menu', role: 'menu' },
                        data.tags.length === 0
                          ? h('div', { className: 'dn-menu-empty', key: 'empty' }, tr('noTags'))
                          : data.tags.map((tag) =>
                              h(
                                'button',
                                {
                                  key: tag.id,
                                  type: 'button',
                                  role: 'menuitem',
                                  className: 'dn-menu-item',
                                  onClick: () => movePickedTo(tag.id),
                                },
                                tag.name,
                              ),
                            ),
                        h(
                          'div',
                          { className: 'dn-menu-new', key: 'new' },
                          h('span', { className: 'dn-menu-label' }, tr('newTag')),
                          h('input', {
                            value: newTagName,
                            maxLength: 20,
                            placeholder: tr('newTagPlaceholder'),
                            'aria-label': tr('newTag'),
                            onChange: (event) => setNewTagName(event.target.value),
                            onKeyDown: (event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                movePickedTo(null, newTagName);
                              }
                            },
                          }),
                          h(
                            'button',
                            {
                              type: 'button',
                              className: 'dn-menu-add',
                              disabled: newTagName.trim() === '',
                              onClick: () => movePickedTo(null, newTagName),
                            },
                            tr('addTag'),
                          ),
                        ),
                      )
                    : null,
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dn-bulkbtn dn-bulk-danger',
                    disabled: picked.length === 0,
                    onClick: deletePicked,
                  },
                  tr('deleteSelected'),
                ),
                h('span', { className: 'dn-bulk-count' }, tr('selectedCount').replace('{n}', String(picked.length))),
              )
            : null,
          detail ? null : h('div', { className: 'dn-body', key: 'body' }, body),
          undo
            ? h(
                'div',
                { className: 'dn-undo', key: 'undo' },
                h('span', { className: 'dn-undo-text' }, undo.message),
                h(
                  'button',
                  { type: 'button', className: 'dn-textbtn', onClick: undoLast },
                  tr('undo'),
                ),
                h(IconUndo, { size: 14 }),
              )
            : null,
        ),
      );
    }

/* ------------------------------------------------------------- quick note */

    /**
     * The right-click sheet: the compose area of the panel, shrunk to half its
     * width and pinned next to the sidebar icon. It talks to the same route and
     * honours the same revision contract, so it can never clobber the panel.
     */
    function QuickNoteSheet(props) {
      const { t, locale, point, onClose } = props;
      const [phase, setPhase] = useState('loading');
      const [data, setData] = useState(EMPTY);
      const [draft, setDraft] = useState('');
      const [selected, setSelected] = useState([]);
      const [tagDraft, setTagDraft] = useState('');
      const [notice, setNotice] = useState('');
      const [revision, setRevision] = useState(0);
      const areaRef = useRef(null);
      const revRef = useRef(null);

      useEffect(() => {
        if (!locale || typeof locale.subscribe !== 'function') return undefined;
        return locale.subscribe(() => setRevision((value) => value + 1));
      }, [locale]);

      const tr = useCallback(
        (key) => {
          let value;
          try {
            value = t(key);
          } catch {
            value = key;
          }
          if (typeof value === 'string' && value !== key) return value;
          return zh[key] !== undefined ? zh[key] : key;
        },
        [t],
      );

      useEffect(() => {
        let alive = true;
        (async () => {
          try {
            const response = await fetch(ROUTE_PATH, { cache: 'no-store', credentials: 'same-origin' });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const body = await response.json();
            if (!body || body.ok !== true) throw new Error((body && body.error) || 'bad response');
            if (!alive) return;
            revRef.current = typeof body.rev === 'string' ? body.rev : null;
            setData(normalize(body.data));
            setPhase('ready');
          } catch (error) {
            if (!alive) return;
            // Nothing usable was read, so there is no revision to guard a write:
            // fail closed instead of guess-overwriting the store.
            revRef.current = null;
            setData(readMirror() || EMPTY());
            setPhase('error');
            console.error('[dsh-notes] quick note load failed', error);
          }
        })();
        return () => {
          alive = false;
        };
      }, []);

      useEffect(() => {
        if (phase !== 'ready') return;
        const node = areaRef.current;
        if (node) node.focus();
      }, [phase]);

      useEffect(() => {
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return;
          event.stopPropagation();
          onClose();
        };
        window.addEventListener('keydown', onKeyDown, true);
        return () => window.removeEventListener('keydown', onKeyDown, true);
      }, [onClose]);

      const toggleTag = useCallback((tagId) => {
        setSelected((previous) =>
          previous.indexOf(tagId) === -1 ? previous.concat([tagId]) : previous.filter((item) => item !== tagId),
        );
      }, []);

      const addTag = useCallback(() => {
        const name = tagDraft.trim();
        if (name === '') return;
        const existing = data.tags.find((tag) => tag.name.toLowerCase() === name.toLowerCase());
        if (existing) {
          setSelected((previous) => (previous.indexOf(existing.id) === -1 ? previous.concat([existing.id]) : previous));
          setTagDraft('');
          return;
        }
        if (data.tags.length >= MAX_TAGS) return;
        const tag = { id: uid(), name: name.slice(0, 20) };
        setData({ notes: data.notes, tags: data.tags.concat([tag]) });
        setSelected((previous) => previous.concat([tag.id]));
        setTagDraft('');
      }, [data, tagDraft]);

      const save = useCallback(async () => {
        if (phase !== 'ready') return;
        const body = draft.trim().slice(0, MAX_NOTE_CHARS);
        if (body === '') return;
        const note = { id: uid(), text: body, createdAt: new Date().toISOString(), tags: selected.slice() };
        const next = { notes: [note].concat(data.notes), tags: data.tags };
        try {
          const payload = { data: next };
          if (revRef.current !== null) payload.ifRev = revRef.current;
          const response = await fetch(ROUTE_PATH, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (response.status === 409) {
            const conflict = await response.json().catch(() => null);
            if (conflict && conflict.data) {
              revRef.current = typeof conflict.rev === 'string' ? conflict.rev : null;
              setData(normalize(conflict.data));
              setNotice(tr('conflict'));
            }
            return;
          }
          if (!response.ok) throw new Error('HTTP ' + response.status);
          const saved = await response.json().catch(() => null);
          if (saved && typeof saved.rev === 'string') revRef.current = saved.rev;
          writeMirror(next);
          window.dispatchEvent(new CustomEvent('dsh-notes:changed'));
          onClose();
        } catch (error) {
          setNotice(tr('offline'));
          console.error('[dsh-notes] quick note save failed', error);
        }
      }, [data, draft, phase, selected, tr, onClose]);

      const over = draft.length > MAX_NOTE_CHARS;
      const width = 380;
      const left = Math.max(
        8,
        Math.min(point && point.x ? point.x - width / 2 : 24, Math.max(8, window.innerWidth - width - 16)),
      );
      const top = Math.max(
        8,
        Math.min(point && point.y ? point.y + 12 : 24, Math.max(8, window.innerHeight - 340)),
      );

      // A portal moves the DOM, not React's event tree: this sheet is a React
      // child of the sidebar entry, which lives inside the sidebar's own panel
      // button. Without stopping propagation here, any click inside the sheet
      // bubbles up to that button and opens the notes panel.
      const keep = (event) => {
        event.stopPropagation();
      };

      const body = h(
        React.Fragment,
        null,
        h('div', {
          className: 'dn-qn-backdrop',
          key: 'backdrop',
          onMouseDown: (event) => {
            event.stopPropagation();
            onClose();
          },
          onClick: keep,
          onPointerDown: keep,
        }),
        h(
          'div',
          {
            className: 'dn-qn',
            key: 'card',
            role: 'dialog',
            'aria-label': tr('title'),
            'data-revision': String(revision),
            style: { left: left + 'px', top: top + 'px' },
            onMouseDown: keep,
            onClick: keep,
            onPointerDown: keep,
            onPointerUp: keep,
            onDoubleClick: keep,
            onContextMenu: (event) => {
              event.preventDefault();
              event.stopPropagation();
            },
          },
          h(
            'div',
            { className: 'dn-qn-head' },
            h(IconNotes, { size: 16 }),
            h('span', { className: 'dn-qn-title' }, tr('title')),
            h(
              'button',
              {
                type: 'button',
                className: 'dn-icon',
                title: tr('close'),
                'aria-label': tr('close'),
                onClick: onClose,
              },
              h(IconClose, { size: 14 }),
            ),
          ),
          phase === 'loading'
            ? h('div', { className: 'dn-qn-loading', key: 'loading' }, tr('loading'))
            : h(
                React.Fragment,
                { key: 'compose' },
                h('textarea', {
                  ref: areaRef,
                  className: 'dn-input dn-qn-input',
                  rows: 3,
                  value: draft,
                  placeholder: tr('placeholder'),
                  'aria-label': tr('placeholder'),
                  onChange: (event) => setDraft(event.target.value),
                  onKeyDown: (event) => {
                    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                      event.preventDefault();
                      save();
                    }
                  },
                }),
                h(
                  'div',
                  { className: 'dn-tagline', key: 'tags' },
                  data.tags.length > 0 ? h('span', { className: 'dn-chiplabel', key: 'label' }, tr('tags')) : null,
                  data.tags.map((tag) =>
                    h(
                      'button',
                      {
                        key: tag.id,
                        type: 'button',
                        className: 'dn-chip',
                        'data-on': selected.indexOf(tag.id) === -1 ? 'false' : 'true',
                        title: tag.name,
                        onClick: () => toggleTag(tag.id),
                      },
                      tag.name,
                    ),
                  ),
                  h(
                    'span',
                    { className: 'dn-newtag', key: 'newtag' },
                    h('input', {
                      value: tagDraft,
                      placeholder: tr('newTagPlaceholder'),
                      maxLength: 20,
                      'aria-label': tr('newTagPlaceholder'),
                      onChange: (event) => setTagDraft(event.target.value),
                      onKeyDown: (event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          addTag();
                        }
                      },
                    }),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'dn-icon',
                        title: tr('addTag'),
                        'aria-label': tr('addTag'),
                        disabled: tagDraft.trim() === '',
                        onClick: addTag,
                      },
                      h(IconPlus, { size: 14 }),
                    ),
                  ),
                ),
                h(
                  'div',
                  { className: 'dn-qn-foot', key: 'foot' },
                  h('span', { className: 'dn-hint' }, notice || tr('hint')),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dn-primary',
                      disabled: draft.trim() === '' || phase !== 'ready',
                      onClick: save,
                    },
                    h(IconCheck, { size: 14 }),
                    tr('save'),
                  ),
                ),
                h(
                  'div',
                  { className: 'dn-limit', key: 'limit', 'data-over': over ? 'true' : 'false' },
                  h('span', { className: 'dn-limit-note' }, tr('limitNote').replace('{n}', String(MAX_NOTE_CHARS))),
                  h(
                    'span',
                    { className: 'dn-limit-count' },
                    draft.length + ' / ' + MAX_NOTE_CHARS + (over ? ' · ' + tr('overLimit') : ''),
                  ),
                ),
              ),
        ),
      );

      if (typeof reactDom.createPortal === 'function') return reactDom.createPortal(body, document.body);
      // No portal available: a fixed-position node still lands over the app.
      return body;
    }

    /**
     * The sidebar entry plus its sheet. Rendering the sheet from inside the
     * icon's own React tree keeps it alive without a second React root, and the
     * window event lets the panel header open the very same sheet.
     */
    function NotesTrigger(props) {
      const { t, locale, size } = props;
      const [open, setOpen] = useState(false);
      const [point, setPoint] = useState({ x: 0, y: 0 });
      const spanRef = useRef(null);

      // The sidebar swallows contextmenu in its own capture listener, so the
      // document-level right-click handler in apply() needs a way in that does
      // not depend on this element's React event props.
      useEffect(() => {
        quickSheet = {
          open: (pt) => {
            setPoint({ x: (pt && pt.x) || 0, y: (pt && pt.y) || 0 });
            setOpen(true);
          },
          // Geometric hit test: works even when the icon itself never receives
          // the event (pointer-events, overlay, or a re-parented DOM node).
          hit: (x, y) => {
            const node = spanRef.current;
            if (!node) return false;
            const box = node.getBoundingClientRect();
            return x >= box.left - 4 && x <= box.right + 4 && y >= box.top - 4 && y <= box.bottom + 4;
          },
        };
        return () => {
          quickSheet = null;
        };
      }, []);

      const close = useCallback(() => setOpen(false), []);

      const requestOpen = useCallback((event) => {
        if (event && typeof event.preventDefault === 'function') {
          event.preventDefault();
          event.stopPropagation();
        }
        setPoint({ x: (event && event.clientX) || 0, y: (event && event.clientY) || 0 });
        setOpen(true);
      }, []);

      return h(
        React.Fragment,
        null,
        h(
          'span',
          {
            ref: spanRef,
            className: 'dn-trigger',
            title: t('quickHint'),
            'data-dsh-notes-trigger': '',
            onContextMenu: requestOpen,
          },
          h(IconNotes, { size: size || 18 }),
        ),
        open ? h(QuickNoteSheet, { t, locale, point, onClose: close }) : null,
      );
    }

    /* ----------------------------------------------------------------- mount */

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        try {
          ctx.effect(() => ctx.locale.register(NS, 'zh', zh), 'dsh-notes: zh dictionary');
          ctx.effect(() => ctx.locale.register(NS, 'en', en), 'dsh-notes: en dictionary');

          const t = ctx.locale.bind(NS);
          const locale = ctx.locale;
          let layout;

          // One stylesheet for the whole package, so the quick-note sheet keeps
          // its look even when the main panel was never opened.
          ctx.effect(() => {
            const sheet = document.createElement('style');
            sheet.setAttribute('data-dsh-notes', '');
            sheet.textContent = CSS;
            document.head.appendChild(sheet);
            return () => sheet.remove();
          }, 'dsh-notes: stylesheet');

          ctx.inject(['layout'], (scoped) => {
            layout = scoped.layout;
          });

          // Right-clicking the sidebar entry must work with the panel closed,
          // and the sidebar intercepts contextmenu before it reaches the icon,
          // so listen for the right button in the capture phase instead.
          const titleText = (() => {
            try {
              const value = t('title');
              return typeof value === 'string' && value ? value : '随手记';
            } catch {
              return '随手记';
            }
          })();

          const isNotesTrigger = (target) => {
            let node = target;
            while (node && node.nodeType === 1) {
              if (node.hasAttribute('data-dsh-notes-trigger')) return true;
              const label = node.getAttribute('aria-label') || node.getAttribute('title') || '';
              if (label && label.indexOf(titleText) !== -1) return true;
              const panelId = node.getAttribute('data-panel-id') || node.getAttribute('data-slot-id') || '';
              if (panelId === PANEL_ID) return true;
              node = node.parentElement;
            }
            return false;
          };

          const insideOwnUi = (target) => {
            let node = target;
            while (node && node.nodeType === 1) {
              const classes = node.classList;
              if (
                classes &&
                (classes.contains('dn-qn') || classes.contains('dn-qn-backdrop') || classes.contains('dn-root'))
              ) {
                return true;
              }
              node = node.parentElement;
            }
            return false;
          };

          ctx.effect(() => {
            let lastOpen = 0;
            const onRightDown = (event) => {
              if (event.button !== 2) return;
              if (!quickSheet || typeof quickSheet.open !== 'function') return;
              // Never re-open from inside the sheet itself (its card carries the
              // same aria-label) or from the panel: only the outside entry counts.
              if (insideOwnUi(event.target)) return;
              const geometric =
                typeof quickSheet.hit === 'function' && quickSheet.hit(event.clientX, event.clientY);
              if (!geometric && !isNotesTrigger(event.target)) return;
              event.preventDefault();
              const now = Date.now();
              if (now - lastOpen < 250) return;
              lastOpen = now;
              quickSheet.open({ x: event.clientX, y: event.clientY });
            };
            const type = typeof window.PointerEvent === 'function' ? 'pointerdown' : 'mousedown';
            // Capture on window as well as document: whichever listener the
            // sidebar installs, ours runs first and can still see the event.
            window.addEventListener(type, onRightDown, true);
            document.addEventListener(type, onRightDown, true);
            return () => {
              window.removeEventListener(type, onRightDown, true);
              document.removeEventListener(type, onRightDown, true);
            };
          }, 'dsh-notes: right click on the sidebar entry');

          const close = () => {
            try {
              if (layout && typeof layout.selectPanel === 'function') layout.selectPanel(null);
            } catch (error) {
              console.error('[dsh-notes] close failed', error);
            }
          };

          ctx.slots.inject('sidebar.panellist', () =>
            ctx.slots.register(
              {
                name: 'sidebar.panellist',
                id: PANEL_ID,
                order: 39,
                label: () => t('title'),
                locale: NS,
              },
              (owner) => h(NotesTrigger, { t, locale, size: (owner && owner.size) || 18 }),
            ),
          );

          ctx.slots.inject('main', () =>
            ctx.slots.register(
              {
                name: 'main',
                key: PANEL_ID,
                locale: NS,
              },
              () => h(NotesPanel, { t, locale, close }),
            ),
          );
        } catch (error) {
          console.error('[dsh-notes] mounting failed, the notebook is missing for this session', error);
        }
      },
    };
  },
});