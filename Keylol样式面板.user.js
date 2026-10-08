// ==UserScript==
// @name         其乐样式助手
// @namespace    https://keylol.com/
// @version      0.9.24
// @description  看到别人帖子里好看的格式，选中就能存成按钮，发帖时一点即用
// @author       Sanmu
// @license      MIT
// @match        *://keylol.com/*
// @match        *://*.keylol.com/*
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      keylol.com
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  'use strict';

  const win = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
  const doc = document;
  const NS = 'klsp';
  const VERSION = '0.9.24';

  /* ============================ 存储（GM / localStorage 双通道） ============================ */

  const store = {
    get(key, def) {
      try {
        if (typeof GM_getValue === 'function') {
          const v = GM_getValue(key, undefined);
          return v === undefined ? def : v;
        }
      } catch (e) { /* 落到 localStorage */ }
      try {
        const raw = localStorage.getItem(NS + ':' + key);
        return raw === null ? def : JSON.parse(raw);
      } catch (e) { return def; }
    },
    set(key, val) {
      try {
        if (typeof GM_setValue === 'function') { GM_setValue(key, val); return; }
      } catch (e) { /* 落到 localStorage */ }
      try { localStorage.setItem(NS + ':' + key, JSON.stringify(val)); } catch (e) {}
    }
  };

  const getStyles = () => {
    const list = store.get('styles', []);
    return Array.isArray(list) ? list : [];
  };
  const setStyles = (list) => store.set('styles', list);

  /* ============================ 可选示例（只在用户点「载入示例样式」时写入，绝不默认出现） ============================ */

  const EXAMPLES = [
    { group: '标题', name: '大标题', open: '[size=5][b]', close: '[/b][/size]', block: true, preview: { bold: true, size: '17px' } },
    { group: '标题', name: '小标题', open: '[size=4][b]', close: '[/b][/size]', block: true, preview: { bold: true, size: '15px' } },
    { group: '强调', name: '加粗', open: '[b]', close: '[/b]', preview: { bold: true } },
    { group: '强调', name: '斜体', open: '[i]', close: '[/i]', preview: { italic: true } },
    { group: '强调', name: '下划线', open: '[u]', close: '[/u]', preview: { underline: true } },
    { group: '强调', name: '删除线', open: '[s]', close: '[/s]', preview: { strike: true } },
    { group: '颜色', name: '红色', open: '[color=#c0392b]', close: '[/color]', preview: { color: '#c0392b' } },
    { group: '颜色', name: '高亮', open: '[backcolor=#ffe58f]', close: '[/backcolor]', preview: { bg: '#ffe58f' } },
    { group: '区块', name: '引用', open: '[quote]', close: '[/quote]', block: true },
    { group: '区块', name: '代码', open: '[code]', close: '[/code]', block: true, preview: { mono: true } },
    { group: '区块', name: '剧透', open: '[hide]', close: '[/hide]', block: true },
    { group: '标题', name: '标题 k0', open: '[k0]', close: '[/k0]', block: true, preview: { title: true } },
    { group: '区块', name: '折叠块', open: '[collapse=标题]', close: '[/collapse]', block: true },
    { group: '区块', name: '列表', open: '[list]\n[*]', close: '[/list]', block: true },
    { group: '区块', name: '居中', open: '[align=center]', close: '[/align]', block: true },
    { group: '区块', name: '分隔线', open: '[hr]', close: '', block: true },
    { group: '工具', name: '清除格式', action: 'clear' }
  ];

  /* ============================ 样式表 ============================ */

  const CSS = `
#klsp-panel{position:fixed;z-index:2147483000;width:172px;background:#fff;border:1px solid #d6dce5;
  border-radius:10px;box-shadow:0 6px 20px rgba(20,40,80,.14);color:#2b3440;
  font:13px/1.5 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;user-select:none}
#klsp-panel *{box-sizing:border-box}
#klsp-panel.klsp-collapsed{width:30px}
.klsp-head{display:flex;align-items:center;gap:4px;padding:6px 8px;background:#f6f9fd;
  border-bottom:1px solid #eceff5;border-radius:9px 9px 0 0;cursor:move}
.klsp-title{flex:1;font-size:12.5px;font-weight:600;color:#2f6fb5;white-space:nowrap;overflow:hidden}
.klsp-icobtn{border:0;background:transparent;color:#7b8798;cursor:pointer;font-size:13px;line-height:1;
  padding:3px 4px;border-radius:4px}
.klsp-icobtn:hover{background:#e6eefb;color:#2f6fb5}
.klsp-collapsed .klsp-head{flex-direction:column;gap:6px;padding:8px 4px;height:100%}
.klsp-collapsed .klsp-title{writing-mode:vertical-rl;letter-spacing:2px;font-size:12px}
.klsp-body{max-height:min(70vh,620px);overflow:auto;padding:6px 7px 9px}
.klsp-collapsed .klsp-body{display:none}
.klsp-tip{margin:2px 0 8px;padding:6px 7px;font-size:11.5px;line-height:1.45;background:#fff8e6;
  border:1px solid #f0d9a0;color:#8a6d1f;border-radius:6px}
.klsp-tip b{display:block;margin-bottom:3px}
.klsp-tip button{margin-top:5px;width:100%;padding:4px 6px;font-size:11.5px;cursor:pointer;
  background:#2f6fb5;color:#fff;border:0;border-radius:5px}
.klsp-group{margin:0 0 9px}
.klsp-gtitle{font-size:11px;color:#98a2b3;padding:4px 3px 5px}
.klsp-item{display:flex;align-items:center;width:100%;padding:5px 7px;margin-bottom:3px;
  border:1px solid transparent;border-radius:6px;background:transparent;cursor:pointer;text-align:left;
  font-size:13px;color:#2b3440}
.klsp-item:hover{background:#eef4fb;border-color:#cadff7}
.klsp-pv{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.klsp-hk{font-size:10px;color:#b6bfcd;font-family:Consolas,monospace;margin-left:4px}
.klsp-empty{padding:10px 6px;font-size:12px;color:#8a94a6;line-height:1.7}
.klsp-empty code{display:block;margin-top:6px;padding:5px 6px;background:#f4f7fb;border-radius:5px;
  font-family:Consolas,monospace;font-size:11px;color:#5b6675;word-break:break-all}
.klsp-foot{border-top:1px solid #eceff5;padding:5px 7px;display:flex;gap:5px}
.klsp-foot button{flex:1;padding:4px 0;font-size:11.5px;cursor:pointer;background:#f4f7fb;
  border:1px solid #dde4ee;border-radius:5px;color:#5b6675}
.klsp-foot button:hover{background:#e8f0fb;color:#2f6fb5}
.klsp-mask{position:fixed;inset:0;z-index:2147483001;background:rgba(20,30,50,.35);
  display:flex;align-items:center;justify-content:center}
.klsp-modal{width:400px;max-width:92vw;max-height:82vh;overflow:auto;background:#fff;border-radius:10px;
  padding:14px 16px;box-shadow:0 10px 30px rgba(0,0,0,.2);
  font:13px/1.6 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;color:#2b3440}
.klsp-modal h3{margin:0 0 10px;font-size:14px;color:#2f6fb5}
.klsp-modal label{display:block;font-size:12px;color:#6b7686;margin:9px 0 3px}
.klsp-modal input[type=text]{width:100%;padding:5px 7px;border:1px solid #d6dce5;border-radius:5px;
  font-size:13px;font-family:inherit}
.klsp-modal input[type=text].klsp-mono{font-family:Consolas,monospace;font-size:12.5px}
.klsp-modal select{width:100%;padding:5px 7px;border:1px solid #d6dce5;border-radius:5px;
  font-size:13px;font-family:inherit;background:#fff;color:inherit}
.klsp-hint{font-size:11.5px;color:#98a2b3;margin-top:3px}
.klsp-row{display:flex;gap:8px;align-items:center;font-size:12px;color:#5b6675;margin-top:8px;flex-wrap:wrap}
.klsp-row + .klsp-row{margin-top:5px}
.klsp-btns{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}
.klsp-btns button{padding:5px 14px;border-radius:5px;cursor:pointer;font-size:13px}
.klsp-primary{background:#2f6fb5;border:0;color:#fff}
.klsp-plain{background:#f4f7fb;border:1px solid #dde4ee;color:#5b6675}
.klsp-list-item{display:flex;align-items:center;gap:6px;padding:6px 2px;border-bottom:1px dashed #eceff5}
.klsp-list-item .klsp-li-name{flex:0 0 92px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.klsp-list-item .klsp-li-code{flex:1;font-family:Consolas,monospace;font-size:11px;color:#98a2b3;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.klsp-mini{padding:2px 7px;font-size:11.5px;border-radius:4px;cursor:pointer;background:#f4f7fb;
  border:1px solid #dde4ee;color:#5b6675}
.klsp-mini:hover{background:#e8f0fb;color:#2f6fb5}
.klsp-mini.klsp-danger:hover{background:#fdecea;color:#c0392b;border-color:#f5c6c2}
.klsp-pick{position:fixed;z-index:2147483000;width:22px;height:22px;padding:0;cursor:move;
  display:none;align-items:center;justify-content:center;
  background:#2f6fb5;color:#fff;border:0;border-radius:50%;
  box-shadow:0 1px 5px rgba(0,0,0,.3);
  font-family:-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;line-height:1;
  user-select:none;touch-action:none;opacity:.92}
.klsp-pick svg{width:13px;height:13px;display:block;pointer-events:none}
.klsp-pick:hover{background:#265d99;opacity:1}
.klsp-pick.klsp-dragging{cursor:grabbing;background:#265d99;opacity:1;box-shadow:0 2px 10px rgba(0,0,0,.4)}
.klsp-swatch{display:inline-block;width:11px;height:11px;border-radius:2px;border:1px solid rgba(0,0,0,.2);
  vertical-align:-1px;margin-right:3px}
.klsp-advtoggle{margin-top:12px;font-size:12px;color:#2f6fb5;cursor:pointer;user-select:none}
.klsp-advtoggle:hover{text-decoration:underline}
.klsp-advbody{padding-left:1px}
.klsp-readline{font-size:12px;color:#5b6675;margin-top:6px;line-height:1.9}
.klsp-readline b{color:#2b3440}
/* 真实渲染的按钮名：站点样式负责形态，这里只做「塞进窄按钮」的尺寸收束。
   注意：不能改颜色/边框/背景 —— 那些正是要看的效果；只压尺寸和留白。 */
.klsp-pv.klsp-real{overflow:hidden;position:relative}
.klsp-pv.klsp-real > div{max-width:100%}
.klsp-pv.klsp-real .t_f{overflow:visible}
.klsp-pv.klsp-real h1,.klsp-pv.klsp-real h2,.klsp-pv.klsp-real h3,
.klsp-pv.klsp-real h4,.klsp-pv.klsp-real h5,.klsp-pv.klsp-real h6{
  margin:0;padding-top:0;padding-bottom:0;line-height:1.3;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  font-size:12px}                      /* 统一小字号，形态/配色仍由站点样式决定 */
.klsp-pv.klsp-real h1{background-size:14px;padding-right:16px}
.klsp-pv.klsp-real blockquote,.klsp-pv.klsp-real .quote,.klsp-pv.klsp-real .blockcode,
.klsp-pv.klsp-real table,.klsp-pv.klsp-real ul{margin:0;padding:1px 4px;font-size:11px}
.klsp-pv.klsp-real img{max-height:14px;max-width:100%}
.klsp-pv.klsp-real marquee{width:auto}
/* 拖拽排序：被拖的按钮淡出，落点用一条蓝线标出 */
.klsp-item.klsp-dragging{opacity:.4}
.klsp-item{cursor:grab}
.klsp-drop-line{height:2px;background:#2f6fb5;border-radius:2px;margin:1px 0 2px;
  box-shadow:0 0 0 2px rgba(47,111,181,.18)}
.klsp-gtitle.klsp-drop-over{color:#2f6fb5}
.klsp-dot{flex:0 0 auto;width:10px;height:10px;border-radius:3px;margin-right:6px;
  border:1px solid rgba(0,0,0,.2);box-shadow:inset 0 0 0 1px rgba(255,255,255,.35)}
/* 预览框：里面是站点真实样式渲染出来的东西，不能压它的尺寸 —— 允许横向溢出滚动 */
.klsp-pvbox{margin-top:6px;padding:9px 11px;border:1px dashed #d6dce5;border-radius:6px;
  background:#fff;min-height:42px;display:block;overflow:auto;max-height:180px;line-height:1.6}
.klsp-pvbox > *{max-width:100%}
.klsp-pvbox .t_f{overflow:visible}
/* 站点样式是给整页宽正文写的（如 h1 28px），预览框窄，压缩一下视觉尺度但不改颜色/形态 */
.klsp-pvbox .t_f h1.KyloStylisedHeader0{font-size:20px;margin:6px 0 0;padding:2px 30px 2px 0;
  background-size:28px}
.klsp-pvbox .t_f h2.KyloStylisedHeader1{font-size:15px;padding:2px 6px}
.klsp-pvbox .t_f h3.KyloStylisedHeader2{font-size:15px}
.klsp-pvbox .t_f .blockcode,.klsp-pvbox .t_f .quote{padding:6px 8px 6px 8px;margin:6px 0}
.klsp-pvbox .klsp-nocss{font-size:11px;color:#b08a2e;background:#fff8e6;border-radius:4px;
  padding:3px 6px;margin-top:6px;width:100%}
`;

  const addStyle = (css) => {
    if (typeof GM_addStyle === 'function') {
      try {
        const node = GM_addStyle(css);
        // 标记：抽站点规则时要把自己的样式表排除掉
        if (node && node.sheet) node.sheet._klspOwn = true;
        if (node) node._klspOwn = true;
        return;
      } catch (e) {}
    }
    const el = doc.createElement('style');
    el.textContent = css;
    el._klspOwn = true;
    doc.head.appendChild(el);
    if (el.sheet) el.sheet._klspOwn = true;
  };

  /* ============================ 页面门禁 ============================ */
  /* 只在发帖 / 编辑 / 回复页出现；浏览帖子（viewthread）的快速回复框不注入 */

  function isPostPage() {
    const q = location.search || '';
    if (/[?&]mod=post(&|=|$)/.test(q)) return true;
    if (/[?&]action=(newthread|reply|edit)(&|=|$)/.test(q)) return true;
    return false;
  }

  /* ============================ 编辑器探测 ============================ */
  /* 其乐 = Discuz：完整发帖页用全局 editorid（textarea id 即 editorid，所见即所得框为 editorid_iframe） */

  const CANDIDATE_IDS = ['e', 'e_textarea', 'posteditor', 'message'];

  function isVisible(el) {
    if (!el) return false;
    if (el.offsetParent !== null) return true;
    return el.style.display !== 'none';
  }

  function findEditor() {
    const found = [];
    const push = (el, kind) => {
      if (el && el.tagName === 'TEXTAREA' && !found.some(f => f.el === el)) found.push({ el: el, kind: kind });
    };

    if (win.textobj && win.textobj.tagName === 'TEXTAREA') push(win.textobj, 'full');
    if (typeof win.editorid === 'string') push(doc.getElementById(win.editorid), 'full');
    CANDIDATE_IDS.forEach(id => push(doc.getElementById(id), 'full'));
    doc.querySelectorAll('#postbox textarea, .tedt textarea, form[name="postform"] textarea')
      .forEach(el => push(el, 'full'));

    const visible = found.filter(f => isVisible(f.el));
    if (visible.length) return visible[0];
    // 所见即所得模式下 textarea 被 iframe 顶掉（display:none），仍要挂面板以便提示切换
    return (found.length && isWysiwyg()) ? found[0] : null;
  }

  function isWysiwyg() {
    if (typeof win.wysiwyg !== 'undefined' && win.wysiwyg !== null) return !!win.wysiwyg;
    if (typeof win.editorid === 'string') {
      const iframe = doc.getElementById(win.editorid + '_iframe');
      if (iframe && isVisible(iframe)) return true;
    }
    return false;
  }

  /* ============================ 文本操作 ============================ */

  function fireInput(ta) {
    try {
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) {}
  }

  /** 用 execCommand 插入以保留浏览器原生撤销栈；不支持时退回直接改 value */
  function insertRaw(ta, text) {
    ta.focus();
    let ok = false;
    try { ok = doc.execCommand('insertText', false, text); } catch (e) { ok = false; }
    if (!ok) {
      const s = ta.selectionStart, e = ta.selectionEnd;
      ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
      ta.selectionStart = ta.selectionEnd = s + text.length;
      fireInput(ta);
    }
  }

  function setSel(ta, start, end) {
    try { ta.setSelectionRange(start, end === undefined ? start : end); } catch (e) {}
  }

  const stripTags = (s) => s.replace(/\[\/?[a-zA-Z*]+(?:=[^\]]*)?\]/g, '');

  /** 行内样式：选中则包裹并保持选中；未选中则插入空标签、光标停在中间 */
  function applyInline(ta, open, close) {
    const s = ta.selectionStart, e = ta.selectionEnd;
    const sel = ta.value.slice(s, e);
    const text = open + sel + close;
    insertRaw(ta, text);
    if (sel.length) setSel(ta, s, s + text.length);
    else setSel(ta, s + open.length);
    ta.focus();
  }

  /** 光标所在整行的起止（空行时 start === end） */
  function currentLineRange(ta) {
    const v = ta.value, s = ta.selectionStart;
    let start = v.lastIndexOf('\n', s - 1) + 1;
    let end = v.indexOf('\n', s);
    if (end === -1) end = v.length;
    return [start, end];
  }

  /** 块级样式：自动补换行，避免和上下文粘连 */
  function applyBlock(ta, open, close) {
    let s = ta.selectionStart, e = ta.selectionEnd;
    let sel = ta.value.slice(s, e);
    let autoLine = false;

    // 没选中文字时，把光标所在的整行套上样式（[hr] 这类无结束标签的不适用）
    if (!sel.length && close && store.get('lineMode', true)) {
      const line = currentLineRange(ta);
      if (line[1] > line[0]) { s = line[0]; e = line[1]; sel = ta.value.slice(s, e); autoLine = true; }
    }
    if (s !== ta.selectionStart || e !== ta.selectionEnd) setSel(ta, s, e);

    const before = ta.value.slice(0, s), after = ta.value.slice(e);
    let text, caret;

    if (sel.length) {
      const lead = (before.length && before.slice(-1) !== '\n') ? '\n' : '';
      const tail = (after.length && after.charAt(0) !== '\n') ? '\n' : '';
      text = lead + open + sel + close + tail;
      caret = s + lead.length + open.length + (autoLine ? sel.length : 0);
    } else {
      const lead = (before.length && before.slice(-1) !== '\n') ? '\n' : '';
      const tail = (after.length && after.charAt(0) !== '\n') ? '\n' : '';
      const inner = close ? '\n\n' : '';
      text = lead + open + inner + close + tail;
      caret = s + lead.length + open.length + (close ? 1 : 0);
    }
    insertRaw(ta, text);
    setSel(ta, caret);
    ta.focus();
  }

  function clearFormat(ta) {
    const s = ta.selectionStart, e = ta.selectionEnd;
    if (s === e) { toast('先选中要清除格式的文字'); return; }
    const cleaned = stripTags(ta.value.slice(s, e));
    insertRaw(ta, cleaned);
    setSel(ta, s, s + cleaned.length);
    ta.focus();
  }

  /* ============================ 轻提示 ============================ */

  let toastTimer = null;
  function toast(msg) {
    let el = doc.getElementById(NS + '-toast');
    if (!el) {
      el = doc.createElement('div');
      el.id = NS + '-toast';
      el.style.cssText = 'position:fixed;left:50%;bottom:40px;transform:translateX(-50%);z-index:2147483002;' +
        'background:rgba(30,40,55,.92);color:#fff;padding:8px 16px;border-radius:6px;font-size:13px;' +
        'font-family:-apple-system,"Microsoft YaHei",sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25)';
      doc.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.style.display = 'none'; }, 1800);
  }

  /* ============================ 通用小工具 ============================ */

  function el(tag, cls, props) {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    Object.assign(n, props || {});
    return n;
  }

  /* ---------- 预览：让样式按钮自己长得像它的效果 ---------- */

  /** 面板当前是不是深色主题（决定预览文字要多亮才看得清） */
  function isDarkTheme() {
    try { return !!(win.matchMedia && win.matchMedia('(prefers-color-scheme: dark)').matches); }
    catch (e) { return false; }
  }

  /** 借浏览器把任意 CSS 颜色（含 red 这类命名色）归一成 #rrggbb */
  function cssColorToHex(c) {
    if (!c) return '';
    try {
      const probe = doc.createElement('span');
      probe.style.color = String(c);
      probe.style.display = 'none';
      doc.body.appendChild(probe);
      const v = win.getComputedStyle(probe).color;
      probe.remove();
      return toHex(v) || toHex(c);
    } catch (e) { return toHex(c); }
  }

  /** 相对亮度 0..1 */
  function luminance(hex) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  }

  const panelBgLum = () => (isDarkTheme() ? 0.16 : 1);

  /** 这个颜色放在面板底色上能不能看清 */
  function readableOn(hex, bgLum) {
    const l = luminance(hex);
    return l === null ? true : Math.abs(l - bgLum) >= 0.3;
  }

  /** 面板里的预览字号：1-7 档压到按钮放得下的范围 */
  const SIZE_PREVIEW_PX = { 1: 12, 2: 13, 3: 14, 4: 15, 5: 16, 6: 17, 7: 18 };

  /** 从 BBCode 标签反推预览效果 */
  function previewFromTags(open) {
    const pv = {};
    const s = String(open || '');
    let m;
    if ((m = /\[size=(\d+)\]/i.exec(s))) {
      const n = Math.min(7, Math.max(1, parseInt(m[1], 10) || 3));
      pv.size = SIZE_PREVIEW_PX[n] + 'px';
    }
    if ((m = /\[font=([^\]]+)\]/i.exec(s))) pv.font = m[1].trim();
    if ((m = /\[color=([^\]]+)\]/i.exec(s))) pv.color = cssColorToHex(m[1].trim());
    if ((m = /\[backcolor=([^\]]+)\]/i.exec(s))) pv.bg = cssColorToHex(m[1].trim());
    if (/\[b\]/i.test(s)) pv.bold = true;
    if (/\[i\]/i.test(s)) pv.italic = true;
    if (/\[u\]/i.test(s)) pv.underline = true;
    if (/\[s\]|\[strike\]/i.test(s)) pv.strike = true;
    if (/\[align=center\]/i.test(s)) pv.align = 'center';
    if (/\[code\]/i.test(s)) pv.mono = true;
    if (/\[quote\]/i.test(s)) pv.quote = true;
    if (/\[hide\]/i.test(s)) pv.hide = true;
    return pv;
  }

  /**
   * 把一段 BBCode 拆成「开始标签 + 结束标签」。
   * 用于「粘贴现成代码自动识别」：用户从帖子里拷一段 [size=4][color=#c0392b]文字[/color][/size] 粘进来，
   * 我们把中间的文字挖掉，留下纯标签对。识别不出来就原样当开始标签。
   */
  function parseBbcodeSnippet(src) {
    const raw = String(src || '').trim();
    if (!raw) return { open: '', close: '' };

    // 收集所有标签（含 [/xxx]），按出现顺序
    // 标签名允许字母+数字（其乐自定义标题是 [k0]~[k5]，纯字母正则会漏掉）
    const tagRe = /\[(\/)?([a-z][a-z0-9]*|\*)(?:=([^\]]*))?\]/gi;
    const tags = [];
    let m;
    while ((m = tagRe.exec(raw))) {
      tags.push({ close: !!m[1], name: m[2].toLowerCase(), attr: m[3] });
    }
    if (!tags.length) return { open: raw, close: '' };

    // 栈式配对：遇到开始标签压栈，遇到结束标签就配一个
    const pairs = [];
    const stack = [];
    tags.forEach(t => {
      if (!t.close) {
        stack.push(t);
      } else {
        // 从栈顶往下找同名开始标签（允许中间有未闭合的）
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].name === t.name) {
            pairs.push({ open: stack[i], close: t });
            stack.splice(i, 1);
            break;
          }
        }
      }
    });

    // 没有任何完整配对 → 整段就是开始标签（用户可能只拷了前半段）
    if (!pairs.length) {
      const openOnly = tags.filter(t => !t.close).map(fmtTag).join('');
      return { open: openOnly || raw, close: '' };
    }

    // 配对的外层→内层顺序，决定标签的嵌套次序
    // 开始标签：按原文出现顺序（先出现的在外层）
    // 结束标签：也按原文出现顺序 —— BBCode 原文里 [/color] 就在 [/size] 前面，
    //   而「内层先闭合」恰好与原文顺序一致，所以两者都用升序即可。
    const starts = pairs.map(p => p.open).sort((a, b) => tags.indexOf(a) - tags.indexOf(b));
    const ends = pairs.map(p => p.close).sort((a, b) => tags.indexOf(a) - tags.indexOf(b));
    return {
      open: starts.map(fmtTag).join(''),
      close: ends.map(fmtTag).join('')
    };
  }

  function fmtTag(t) {
    return '[' + (t.close ? '/' : '') + t.name + (t.attr !== undefined ? '=' + t.attr : '') + ']';
  }

  /** 把一段 BBCode 里的「纯文字」抽出来（去掉所有标签），用来当预览样本 */
  function extractBbcodeText(src) {
    return String(src || '')
      .replace(/\[\/?[a-z][a-z0-9]*(?:=[^\]]*)?\]/gi, '')
      .replace(/\[\*\]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60);
  }

  /** 标签反推 + 手填（手填的非空值优先） */
  function mergedPreview(item) {
    const out = previewFromTags(item.open);
    const manual = item.preview || {};
    Object.keys(manual).forEach(k => {
      const v = manual[k];
      if (v === '' || v === false || v === null || v === undefined) return;
      out[k] = v;
    });
    return out;
  }

  function applyPreview(node, pv) {
    if (!pv) return;
    if (pv.bold) node.style.fontWeight = '700';
    if (pv.italic) node.style.fontStyle = 'italic';
    const deco = [];
    if (pv.underline) deco.push('underline');
    if (pv.strike) deco.push('line-through');
    if (deco.length) node.style.textDecoration = deco.join(' ');
    if (pv.color) node.style.color = pv.color;
    if (pv.bg) node.style.background = pv.bg;
    if (pv.size) node.style.fontSize = pv.size;
    if (pv.font) node.style.fontFamily = pv.font;
    if (pv.mono) node.style.fontFamily = 'Consolas, monospace';
    if (pv.align) node.style.textAlign = pv.align;
    if (pv.quote) { node.style.borderLeft = '3px solid #c8d2e0'; node.style.paddingLeft = '5px'; }
    if (pv.hide) {
      node.style.background = node.style.background || '#e9edf2';
      node.style.color = node.style.color || '#8a94a6';
    }
  }

  /**
   * 把 BBCode 拼成 HTML —— 照其乐官方 bbcode.js（bbcode2html）的规则。
   * 预览走这条路，就等于用**其乐自己的 CSS** 渲染，和帖子页一致。
   */
  function bbcodeToHtml(s) {
    let h = String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    h = h.replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '<b>$1</b>');
    h = h.replace(/\[i\]([\s\S]*?)\[\/i\]/gi, '<i>$1</i>');
    h = h.replace(/\[u\]([\s\S]*?)\[\/u\]/gi, '<u>$1</u>');
    h = h.replace(/\[s\]([\s\S]*?)\[\/s\]/gi, '<strike>$1</strike>');
    h = h.replace(/\[color=([^\]]+)\]([\s\S]*?)\[\/color\]/gi, '<font color="$1">$2</font>');
    h = h.replace(/\[backcolor=([^\]]+)\]([\s\S]*?)\[\/backcolor\]/gi, '<font style="background-color:$1">$2</font>');
    h = h.replace(/\[size=(\d+)\]([\s\S]*?)\[\/size\]/gi, '<font size="$1">$2</font>');
    // 其乐标题 [kN] → <h(N+1) class="KyloStylisedHeaderN">
    // 真站 CSS 是标签与 N 绑定的（h1.KyloStylisedHeader0、h3.KyloStylisedHeader2…），
    // 只写 class 不换标签会匹配不上规则。
    h = h.replace(/\[k(\d+)\]([\s\S]*?)\[\/k\d+\]/gi, function (all, n, body) {
      const lv = Math.min(6, Math.max(1, parseInt(n, 10) + 1));
      return '<h' + lv + ' class="KyloStylisedHeader' + n + '">' + body + '</h' + lv + '>';
    });
    h = h.replace(/\[font=([^\]]+)\]([\s\S]*?)\[\/font\]/gi, '<font face="$1">$2</font>');
    h = h.replace(/\[align=([^\]]+)\]([\s\S]*?)\[\/align\]/gi, '<div align="$1">$2</div>');
    h = h.replace(/\[quote\]([\s\S]*?)\[\/quote\]/gi, '<div class="quote"><blockquote>$1</blockquote></div>');
    h = h.replace(/\[code\]([\s\S]*?)\[\/code\]/gi, '<div class="blockcode"><blockquote>$1</blockquote></div>');
    h = h.replace(/\[indent\]([\s\S]*?)\[\/indent\]/gi, '<blockquote>$1</blockquote>');
    // 真站结构：div.showhide > p（提示+按钮） + div.spoiler（内容，默认 display:none）
    // 预览里内容要可见，否则什么都看不到
    h = h.replace(/\[hide(?:=[^\]]*)?\]([\s\S]*?)\[\/hide\]/gi, function (m, body) {
      return '<div class="showhide"><p>隐藏内容，<span class="showhide-btn">点击显示</span></p>' +
        '<div class="spoiler" style="display:block">' + body + '</div></div>';
    });
    h = h.replace(/\[spoil(?:=([^\]]*))?\]([\s\S]*?)\[\/spoil\]/gi, function (m, title, body) {
      return '<div class="showhide"><p>' + (title || '折叠内容') +
        '，<span class="showhide-btn">点击显示</span></p>' +
        '<div class="spoiler" style="display:block">' + body + '</div></div>';
    });
    // [spoiler] 是**另一种标签**（新版剧透）：真站结构 span.bbcode_spoiler > span.bbcode_spoiler_content
    h = h.replace(/\[spoiler(?:=([^\]]*))?\]([\s\S]*?)\[\/spoiler\]/gi, function (all, title, body) {
      return '<span class="bbcode_spoiler"><span class="bbcode_spoiler_title">' +
        (title || '隐藏内容') + '（点击显示）</span>' +
        '<span class="bbcode_spoiler_content" style="display:inline">' + body + '</span></span>';
    });
    h = h.replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, '<a href="$1">$2</a>');
    h = h.replace(/\[url\]([\s\S]*?)\[\/url\]/gi, '<a href="$1">$1</a>');
    // [fly]（飞行文字）：其乐/Discuz 标准标签，渲染成 <marquee>
    h = h.replace(/\[fly\]([\s\S]*?)\[\/fly\]/gi, '<marquee>$1</marquee>');
    h = h.replace(/\[img\]([\s\S]*?)\[\/img\]/gi, '<img src="$1" style="max-width:100%">');
    h = h.replace(/\[hr\]/gi, '<hr>');
    h = h.replace(/\[list(?:=[^\]]*)?\]([\s\S]*?)\[\/list\]/gi, function (m, body) {
      return '<ul>' + body.replace(/\[\*\]/g, '<li>') + '</ul>';
    });
    h = h.replace(/\[collapse(?:=([^\]]*))?\]/gi, function (m, t) {
      // 预览里默认展开（不加 sff_collapsed），否则内容被 CSS 藏起来看不到
      return '<div class="sff_collapse"><div class="sff_collapse_b">' +
        '<span class="sff_collapse_t">&gt;</span> ' + (t || '折叠内容') + '</div><div class="sff_collapse_d">';
    });
    h = h.replace(/\[\/collapse\]/gi, '</div></div>');
    return h.replace(/\n/g, '<br>');
  }

  /**
   * 弹窗里的效果预览框。
   * 有 probe（原元素的标签+class）就直接造同款元素；
   * 否则把标签拼成 HTML 交给其乐 CSS 渲染 —— 两条路都是真渲染，不靠手写模拟。
   */
  /** 只填了开始标签时，从它推导出结束标签（预览用） */
  function guessClose(open) {
    const tags = [];
    // 标签名要允许字母+数字（[k0]~[k5] 这类），否则收尾标签拼不出来
    const re = /\[([a-z][a-z0-9]*)(?:=[^\]]*)?\]/gi;
    let m;
    while ((m = re.exec(String(open || '')))) tags.push('[/' + m[1].toLowerCase() + ']');
    return tags.reverse().join('');
  }

  /**
   * 开始标签改了 → 把结束标签同步成对应的闭合序列。
   *
   * 关键：开始标签是**外→内**，结束标签顺序**相反**（内→外）。
   *   开始 [size=6][color=#c0392b]  →  结束 [/color][/size]
   * 所以按下标配的时候要**倒着配**：结束标签第 1 个对应开始标签最后一个。
   *
   * 为什么不整段重写：用户手打的顺序/额外内容（比如他自己加的 [/b]）能保留。
   * 只有数量对不上（缺了或多了）才退回 guessClose 整段重写。
   *
   * 为什么要做：用户改了开始标签却忘了改结束标签（典型 [k1] 配 [/k2]），
   * 标签不闭合，其乐解析不了、预览也渲染不出来。用户没义务记这种配对。
   */
  function syncClose(open, close) {
    const openTags = [];
    const re = /\[([a-z][a-z0-9]*)(?:=[^\]]*)?\]/gi;
    let m;
    while ((m = re.exec(String(open || '')))) openTags.push(m[1].toLowerCase());
    if (!openTags.length) return close;

    const closeRe = /\[\/([a-z][a-z0-9]*)\]/gi;
    const closeTags = String(close || '').match(closeRe) || [];

    if (closeTags.length === openTags.length) {
      // 数量对得上 → 逐个别名替换。结束标签是内层先闭，所以要倒序取开始标签
      let i = openTags.length - 1;
      return String(close).replace(closeRe, () => '[/' + openTags[i--] + ']');
    }
    // 数量对不上（用户只填了一半 / 填多了）→ 整段按开始标签重写
    return guessClose(open);
  }

  /* ---------- 站点样式：预览要真实渲染，得有它的 CSS，但发帖页并没有 ---------- */

  /**
   * 全局「真实渲染」总开关（设置里）。
   * 默认开。关掉后处处退回模拟外观 —— 面板按钮、新建表单预览、吸取弹窗都听它。
   */
  function realRenderOn() {
    return store.get('realRender', true) !== false;
  }

  /**
   * 其乐的帖子正文样式（KyloStylisedHeader* 等）只在**浏览帖子页**加载的
   * `data/cache/style_7_forum_viewthread.css` 里定义；发帖页（mod=post）根本不引这张表。
   * 所以预览要真实渲染，必须自带一份。
   *
   * 这份种子是 2026-09 从真站 vt.css 抄的原文（含标题六档 + 引用/代码/剧透/隐藏）。
   * 站点改版后会过时 —— 面板设置里有「刷新站点样式」按钮可重新拉取覆盖。
   */
  const SITE_CSS_SEED = `
h1.KyloStylisedHeader0,h2.KyloStylisedHeader1,h3.KyloStylisedHeader2,
h4.KyloStylisedHeader3,h5.KyloStylisedHeader4,h6.KyloStylisedHeader5{
  font-family:"Segoe UI",SegoeUI,"Helvetica Neue",Helvetica,Tahoma,"Microsoft YaHei UI","Microsoft YaHei",Arial,sans-serif}
h1.KyloStylisedHeader0{background-image:url(https://keylol.com/static/image/common/kywing128_555_padded.png);
  background-size:48px;background-repeat:no-repeat;background-position:right center;color:#444;display:block;
  height:auto;font-size:28px;font-weight:600;padding:3px 46px 3px 0;border-bottom:8px double #555;margin:24px 0 0 0}
h2.KyloStylisedHeader1{background:#6bf;color:#fff;display:inline-block;font-size:18px;font-weight:600;
  padding:3px 8px 3px;border-left:8px solid #069;margin:0 0 4px 0}
h3.KyloStylisedHeader2{background:linear-gradient(180deg,rgba(255,255,255,0) 71%,rgba(102,187,255,1) 71%,
  rgba(102,187,255,1) 95%,rgba(255,255,255,0) 95%);color:#444;display:inline-block;font-size:18px;
  font-weight:600;padding:3px;margin:0}
h4.KyloStylisedHeader3{display:inline-block;color:#555;font-size:14px;font-weight:600;
  padding:1px 6px 1px;border-left:6px solid #555;margin:0 0 2px 0}
h5.KyloStylisedHeader4{display:inline-block;color:#555;font-size:14px;font-weight:400;
  padding:0 6px 0;border-left:6px double #555;margin:0 0 2px 1em}
h6.KyloStylisedHeader5{display:inline-block;color:#888;font-size:14px;font-weight:100;font-style:italic;
  padding:0 6px 0;border-left:1px dashed #888;margin:0 0 2px 2em}
/* 正文结构（原文带 .pl 祖先限定，这里去掉限定以便预览复现） */
.quote{margin:10px 0;padding:10px 10px 10px 36px;background:#fff;color:#666;zoom:1}
.quote blockquote{display:block;margin:0;padding:0 24px 0 0;line-height:1.6}
.blockcode{overflow:hidden;margin:10px 0;padding:10px 0 5px 10px;border:1px solid #f7f7f7;
  background:#f7f7f7;color:#666}
.blockcode code{font-family:Monaco,Consolas,'Lucida Console','Courier New',serif;font-size:12px;line-height:1.8em}
.bbcode_spoiler{background:#000}
.bbcode_spoiler .bbcode_spoiler_content{color:#fff;opacity:.35}
.showhide{overflow:hidden;border:1px dashed #ff9a9a;margin:8px 0;padding:10px;zoom:1}
.showhide h4{margin-bottom:10px;color:#f66;font-size:12px;text-align:center}
.sff_collapse{margin:8px 0;border:1px solid #cfe3f7;border-radius:4px;overflow:hidden}
.sff_collapse_b{background:#eaf4ff;padding:6px 10px;color:#2f6fb5;cursor:pointer}
.sff_collapse_d{padding:8px 10px;border-top:1px solid #cfe3f7}
`;

  const SITE_CSS_KEY = 'siteCss';

  /** 拿到站点样式：优先用用户刷新过的，否则用内置种子 */
  function getSiteCss() {
    const saved = store.get(SITE_CSS_KEY, '');
    return (saved && String(saved).trim()) ? saved : SITE_CSS_SEED;
  }

  /** 把站点样式注入到一个隔离容器上（用 style 标签 + 作用域容器 id） */
  function injectSiteCss(scopeId) {
    if (injectSiteCss._done === scopeId) return;
    injectSiteCss._done = scopeId;
    const css = scopeSiteCss(getSiteCss(), '#' + scopeId);
    const st = doc.createElement('style');
    st.textContent = css;
    st._klspOwn = true;      // 抽规则内联时要跳过自己
    st.setAttribute('data-klsp-sitecss', scopeId);
    doc.head.appendChild(st);
  }

  /**
   * 给站点样式加作用域前缀。内置种子是全局选择器（h3.KyloStylisedHeader2 等），
   * 不加前缀会把其乐的真实样式泼到整个面板/弹窗上。
   */
  function scopeSiteCss(css, prefix) {
    return String(css || '').replace(/(^|\})\s*([^@{}]+?)\s*\{/g, function (all, brace, sel) {
      const scoped = sel.split(',').map(s => {
        const t = s.trim();
        return t ? prefix + ' ' + t : t;
      }).filter(Boolean).join(',');
      return brace + scoped + '{';
    });
  }

  /** 面板里的样式按钮也要真实渲染，给它们注入一份作用在 .klsp-pv.klsp-real 上的站点样式 */
  function injectPanelSiteCss() {
    const css = scopeSiteCss(getSiteCss(), '.klsp-pv.klsp-real');
    let st = doc.getElementById('klsp-sitecss-panel');
    if (!st) {
      st = doc.createElement('style');
      st.id = 'klsp-sitecss-panel';
      st._klspOwn = true;
      doc.head.appendChild(st);
    }
    st.textContent = css;
  }

  /** 换掉已注入的站点样式（刷新后用），并把已渲染的预览重新刷一遍 */
  function resetSiteCss() {
    doc.querySelectorAll('style[data-klsp-sitecss]').forEach(n => n.remove());
    injectSiteCss._done = null;
    injectPanelSiteCss();   // 面板那份立刻更新
  }

  /**
   * 从站点重新拉一份帖子正文样式。
   * 其乐模板 id 会变（现在是 style_7_*），所以把常见的几张表都试一遍，
   * 命中含 KyloStylisedHeader 的那张就抽出来。
   */
  function fetchSiteCss(cb) {
    const urls = [
      '/data/cache/style_7_forum_viewthread.css?ADo',
      '/data/cache/style_7_common.css?ADo'
    ];
    const grab = (url, done) => {
      const onOk = (text) => {
        if (!text || text.indexOf('KyloStylisedHeader') === -1) { done(null); return; }
        // 只留跟正文渲染相关的规则，别把整站 50KB 都塞进去
        const keep = [];
        const re = /([^{}@]+)\{([^{}]*)\}/g;
        let m;
        while ((m = re.exec(text))) {
          const sel = m[1].trim(), body = m[2].trim();
          if (!sel || !body) continue;
          if (/^(\/\*|@)/.test(sel)) continue;
          if (/(KyloStylisedHeader|^\.quote|\.quote |blockquote|blockcode|bbcode_spoiler|showhide|sff_collapse|^\.pl \.t_f|\.t_f )/.test(sel)) {
            keep.push(sel + '{' + body + '}');
          }
        }
        done(keep.length ? keep.join('\n') : null);
      };
      const onErr = () => done(null);
      try {
        if (typeof GM_xmlhttpRequest === 'function') {
          GM_xmlhttpRequest({
            method: 'GET', url: location.origin + url,
            onload: (r) => onOk(r.responseText),
            onerror: onErr, ontimeout: onErr, timeout: 15000
          });
          return;
        }
      } catch (e) {}
      try {
        fetch(location.origin + url)
          .then(r => r.text()).then(onOk).catch(onErr);
      } catch (e) { onErr(); }
    };

    let i = 0, found = null, tried = 0;
    const next = () => {
      if (found || i >= urls.length) {
        if (found) {
          store.set(SITE_CSS_KEY, found);
          resetSiteCss();
          // 已有的预览框重新渲染一次
          doc.querySelectorAll('.klsp-pvbox').forEach(b => {
            if (b._klspRerender) b._klspRerender();
          });
          cb((found.match(/KyloStylisedHeader\d/g) || []).length, null);
        } else if (tried === urls.length) {
          cb(0, '站点样式表里没找到正文规则');
        }
        return;
      }
      const url = urls[i++];
      grab(url, (text) => { tried++; if (text) found = text; next(); });
    };
    next();
  }

  /**
   * 从站点样式表里，把「能匹配到这个元素」的规则抽出来。
   *
   * 为什么要这么做：其乐的标题/引用等 CSS 常写成带祖先限定的组合选择器
   * （比如 .t_f h3.KyloStylisedHeader2）。预览框挂在弹窗里，祖先对不上，
   * 光靠「标签 + class 一样」是吃不到规则的 —— 这就是「真实渲染看着没效果」的根因。
   *
   * 做法：遍历同源样式表，用 el.matches(selector) 反查，命中的规则把声明写成内联。
   * 跨域样式表读取会抛 SecurityError，跳过（拿不到就如实告诉用户）。
   */
  function collectMatchingCss(el, ctx) {
    const out = [];
    let sheets = null;
    try { sheets = doc.styleSheets; } catch (e) { return out; }
    if (!sheets) return out;
    const tests = [el];
    if (ctx) tests.push(ctx);

    for (let i = 0; i < sheets.length; i++) {
      // 跳过脚本自己注入的样式表 —— 那些是给面板/预览框排版用的
      // （比如 .klsp-pv.klsp-real h3 会把标题压成 14px），抽出来内联会让预览失真
      if (isOwnSheet(sheets[i])) continue;
      let rules = null;
      try { rules = sheets[i].cssRules; } catch (e) { continue; }   // 跨域，读不到
      if (!rules) continue;
      for (let j = 0; j < rules.length; j++) {
        const rule = rules[j];
        if (rule.type === 4 && rule.cssRules) {              // @media
          for (let k = 0; k < rule.cssRules.length; k++) {
            const r = rule.cssRules[k];
            if (r.selectorText && r.style && matchesAny(tests, r.selectorText)) out.push(r);
          }
          continue;
        }
        if (!rule.selectorText || !rule.style) continue;
        if (matchesAny(tests, rule.selectorText)) out.push(rule);
      }
    }
    return out;
  }

  /** 这张样式表是不是脚本自己加的（klsp 前缀的规则） */
  function isOwnSheet(sheet) {
    if (sheet._klspOwn) return true;
    let rules = null;
    try { rules = sheet.cssRules; } catch (e) { return false; }
    if (!rules || !rules.length) return false;
    // 抽查开头若干条：命中 klsp 前缀就认定是自己的
    for (let i = 0; i < Math.min(rules.length, 12); i++) {
      const sel = rules[i].selectorText || '';
      if (/\.klsp-|#klsp-panel/.test(sel)) return true;
    }
    return false;
  }

  /**
   * 选择器是否命中测试元素。要逐段拆开试（`a, b` 里命中任一段即可），
   * 并且跳过 :hover/:active/:focus/:before/:after 这些状态/伪元素选择器 ——
   * 它们表达的不是「这块东西长什么样」。
   */
  function matchesAny(els, selectorText) {
    const parts = String(selectorText || '').split(',');
    for (let p = 0; p < parts.length; p++) {
      const sel = parts[p].trim();
      if (!sel) continue;
      if (/:(hover|active|focus|visited|link|target|checked|disabled)\b/i.test(sel)) continue;
      if (/::?(before|after|first-line|first-letter|placeholder|selection)\b/i.test(sel)) continue;
      for (let e = 0; e < els.length; e++) {
        try { if (els[e].matches(sel)) return true; } catch (err) {}
      }
    }
    return false;
  }

  /**
   * 把命中的规则内联到元素（及其子元素）上。
   * 只处理「能安全内联」的声明；返回命中的规则条数，0 表示站点没提供可用样式。
   */
  function inlineMatchedCss(root, ctx) {
    let hit = 0;
    const walk = (node) => {
      if (!node || node.nodeType !== 1) return;
      const rules = collectMatchingCss(node, ctx);
      rules.forEach(r => {
        hit++;
        const decls = r.style;
        for (let i = 0; i < decls.length; i++) {
          const prop = decls[i];
          const val = decls.getPropertyValue(prop);
          const prio = decls.getPropertyPriority(prop);
          // 先按规则原文写，后面的规则（层叠靠后）自然覆盖前面的
          try { node.style.setProperty(prop, val, prio); } catch (e) {}
        }
      });
      for (let c = node.firstElementChild; c; c = c.nextElementSibling) walk(c);
    };
    walk(root);
    return hit;
  }

  let pvScopeSeq = 0;

  /**
   * 预览框。两种模式：
   * - real=true  真实渲染：BBCode → HTML，再套一份「站点正文样式」（内置种子，可用设置里的
   *              按钮从真站刷新）。发帖页本身不加载这套 CSS，不内置就永远渲染不出效果。
   * - real=false 模拟渲染：按标签反推一组内联样式套在文字上（轻量，不依赖站点 CSS）
   */
  function makePreviewBox() {
    const box = el('div', 'klsp-pvbox');
    // 每个预览框一个独立作用域 id：站点样式只作用在它内部，不泼到面板其他地方
    const scopeId = 'klsp-pv-' + (++pvScopeSeq) + '-' + Math.floor(Math.random() * 1e6).toString(36);
    let real = true;
    let lastArgs = null;
    const setReal = (v) => { real = !!v; };

    const update = (pv, text, probe, open, close) => {
      lastArgs = [pv, text, probe, open, close];
      box.innerHTML = '';
      box.style.background = '';
      box.id = scopeId;
      if (real) injectSiteCss(scopeId);

      const t = text || '预览文字 Aa 123';
      // .t_f 是站点的正文容器 class —— 站点样式里凡是带 .t_f 限定的选择器都靠它命中
      const ctx = el('div', 't_f');
      ctx.style.cssText = 'max-width:100%;width:100%';

      if (probe && probe.tag) {
        const node = doc.createElement(probe.tag);
        if (probe.cls) node.className = probe.cls;
        node.textContent = t;
        ctx.appendChild(node);
        box.appendChild(ctx);
        if (real) inlineMatchedCss(node, ctx);
        if (real) revealOpaque(node);
        return;
      }
      const node = el('div', '');
      node.style.cssText = 'max-width:100%;width:100%';
      node.innerHTML = bbcodeToHtml((open || '') + t + (close || guessClose(open)));
      ctx.appendChild(node);
      box.appendChild(ctx);
      if (real) {
        // 站点表里还有的规则（比如 .pl .quote）也一并补上，双保险
        inlineMatchedCss(node, ctx);
        revealOpaque(node);
      } else {
        applyPreview(node, pv || {});
      }
    };
    // 让「刷新站点样式」后能重渲染这个框
    box._klspRerender = () => { if (lastArgs) update.apply(null, lastArgs); };
    return { box: box, update: update, setReal: setReal };
  }

  /**
   * 把「预览里必须展开才看得见」的内容强制显示。
   * 真站的剧透是黑色遮罩 + 文字透明（hover 才显形），发帖页预览里
   * 用户看不到任何东西 —— 那就失去了预览的意义。
   */
  function revealOpaque(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('.bbcode_spoiler_content, .spoiler, .sff_collapse_d, .showhide .spoiler')
      .forEach(n => {
        n.style.opacity = '1';
        n.style.color = n.style.color || '#333';
        if (n.style.display === 'none') n.style.display = 'block';
      });
    root.querySelectorAll('.bbcode_spoiler').forEach(n => { n.style.background = '#f2f4f7'; });
  }

  /* ============================ 样式应用 ============================ */

  let panel = null, editor = null, booted = false;

  function applyItem(item) {
    if (!editor) { toast('没找到发帖输入框'); return; }
    if (isWysiwyg()) { toast('请先切到纯文本模式（面板顶部有按钮）'); return; }
    const ta = editor.el;
    if (item.action === 'clear') { clearFormat(ta); return; }
    if (item.block) applyBlock(ta, item.open || '', item.close || '');
    else applyInline(ta, item.open || '', item.close || '');
  }

  /* ============================ 面板 ============================ */

  function groupStyles(list) {
    const groups = [];
    list.forEach((item, idx) => {
      const name = (item.group || '').trim() || '未分组';
      let g = groups.find(x => x.name === name);
      if (!g) { g = { name: name, items: [] }; groups.push(g); }
      g.items.push({ item: item, idx: idx });   // 带上在总数组里的真实下标
    });
    return groups;
  }

  function styleTooltip(item) {
    if (item.action === 'clear') return '清除选中文字里的 BBCode 标签';
    return (item.open || '') + ' … ' + (item.close || '');
  }

  function buildBody(container) {
    container.innerHTML = '';
    const list = getStyles();

    if (isWysiwyg()) {
      const tip = el('div', 'klsp-tip');
      tip.innerHTML = '<b>当前是「所见即所得」模式</b>样式助手写入的是 BBCode，需要先切到纯文本模式。';
      const btn = el('button', '', { type: 'button' });
      btn.textContent = '切换到纯文本';
      btn.onclick = () => switchToPlain();
      tip.appendChild(btn);
      container.appendChild(tip);
    }

    if (!list.length) {
      const empty = el('div', 'klsp-empty');
      empty.innerHTML = '还没有样式。<br>点下面的「+ 新建样式」，把你常用的 BBCode 存成按钮。' +
        '<code>[size=4][color=#c0392b]&nbsp;…&nbsp;[/color][/size]</code>';
      container.appendChild(empty);
      return;
    }

    groupStyles(list).forEach(group => {
      const g = el('div', 'klsp-group');
      const t = el('div', 'klsp-gtitle');
      t.textContent = group.name;
      g.appendChild(t);
      group.items.forEach(entry => {
        const item = entry.item;
        const b = el('button', 'klsp-item', { type: 'button', title: styleTooltip(item) });
        b.dataset.id = item.id;
        b.dataset.idx = String(entry.idx);        // 在总数组里的绝对下标，拖动排序用
        b.dataset.group = group.name;             // 当前所属分组，拖到别组时用来改写 group 字段
        const pvOpt = mergedPreview(item);

        // 带背景色的样式：按钮本身铺上这个色，文字按背景亮度取深/浅
        if (pvOpt.bg) {
          b.style.background = pvOpt.bg;
          const bl = luminance(pvOpt.bg);
          b.style.color = (bl !== null && bl < 0.5) ? '#ffffff' : '#2b3440';
          b.style.borderColor = 'rgba(0,0,0,.12)';
        }

        // 颜色在面板底色上看不清时改用色块表示，文字回到默认色（否则就会出现「看不见的按钮」）
        if (pvOpt.color && !pvOpt.bg && !readableOn(pvOpt.color, panelBgLum())) {
          const dot = el('span', 'klsp-dot');
          dot.style.background = pvOpt.color;
          b.appendChild(dot);
          pvOpt.color = '';
        }

        const pv = el('div', 'klsp-pv');
        // 真实渲染：用站点 CSS 里命中的规则渲染按钮名（抽规则内联，见 collectMatchingCss）
        // 模拟渲染：按标签反推外观（旧行为）
        if (realRenderOn() && item.realRender !== false && item.open && item.action !== 'clear') {
          pv.classList.add('klsp-real');
          const ctx = el('div', 't_f');
          ctx.style.cssText = 'max-width:100%';
          const inner = el('div', '');
          inner.innerHTML = bbcodeToHtml(
            (item.open || '') + (item.name || '(未命名)') + (item.close || guessClose(item.open))
          );
          ctx.appendChild(inner);
          pv.appendChild(ctx);
          inlineMatchedCss(inner, ctx);
        } else {
          pv.textContent = item.name || '(未命名)';
          applyPreview(pv, pvOpt);
        }
        b.appendChild(pv);
        if (item.hotkey) {
          const hk = el('span', 'klsp-hk');
          hk.textContent = item.hotkey;
          b.appendChild(hk);
        }
        b.onclick = () => applyItem(item);
        g.appendChild(b);
      });
      container.appendChild(g);
    });

    setupListDrag(container);
  }

  /* ---------- 面板列表：拖拽排序（可跨分组） ---------- */

  /**
   * 拖动样式按钮换顺序。
   * 关键点：按钮本身就是「点击即套用」，所以必须把「拖」和「点」分开，
   * 做法与吸管一致 —— 位移阈值 + 吞掉一次 click。
   */
  function setupListDrag(container) {
    // rebuild() 会反复调用本函数，但监听绑在 container 自己身上 —— 只允许绑一次，
    // 否则每重绘一次就多一套监听，拖一次会触发多次排序
    if (container._klspDragBound) return;
    container._klspDragBound = true;

    let src = null, dragging = false, moved = false, line = null;
    let sx = 0, sy = 0;

    const clearLine = () => {
      if (line) { line.remove(); line = null; }
      Array.from(container.querySelectorAll('.klsp-drop-over'))
        .forEach(n => n.classList.remove('klsp-drop-over'));
    };

    /** 找出鼠标当前落在哪个「插入缝隙」，返回插入到总数组的目标下标 */
    const findDropAt = (y) => {
      const items = Array.from(container.querySelectorAll('.klsp-item'));
      if (!items.length) return null;
      let best = null, bestDist = Infinity, afterLast = true;
      items.forEach(el2 => {
        const r = el2.getBoundingClientRect();
        const mid = r.top + r.height / 2;
        const d = Math.abs(y - mid);
        if (d < bestDist) {
          bestDist = d;
          best = el2;
          afterLast = y > mid;         // 落在中线下方 → 插到这个按钮之后
        }
      });
      if (!best) return null;
      const idx = parseInt(best.dataset.idx, 10);
      // 直接插到该按钮前/后。取「之后」时用 idx+1，配合后面「先删后插」的下标修正
      let insertAt = afterLast ? idx + 1 : idx;
      if (insertAt > src.idx) insertAt -= 1;   // 先把自己抽走，后面的下标整体前移一位
      return {
        insertAt: Math.max(0, insertAt),
        refEl: best,
        after: afterLast,
        group: best.dataset.group
      };
    };

    const showLine = (info) => {
      clearLine();
      if (!info) return;
      const items = Array.from(container.querySelectorAll('.klsp-item'));
      const el2 = items.find(n => n.dataset.idx === String(info.insertAt)) || null;
      line = el('div', 'klsp-drop-line');
      if (el2) {
        el2.parentNode.insertBefore(line, el2);
      } else {
        // 插到末尾：贴着最后一个按钮下面
        const last = items[items.length - 1];
        if (last) last.parentNode.insertBefore(line, last.nextSibling);
      }
    };

    const onMove = (ev) => {
      if (!dragging || !src) return;
      if (!moved && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 6) return;
      moved = true;
      src.el.classList.add('klsp-dragging');   // src 是普通对象，元素在 src.el 上
      showLine(findDropAt(ev.clientY));
      ev.preventDefault();
    };

    const onUp = (ev) => {
      if (!dragging) return;
      dragging = false;
      doc.removeEventListener('mousemove', onMove, true);
      doc.removeEventListener('mouseup', onUp, true);
      const wasMoved = moved;
      moved = false;
      if (src) src.el.classList.remove('klsp-dragging');
      const info = wasMoved ? findDropAt(ev.clientY) : null;
      clearLine();
      if (!wasMoved || !info || !src) { src = null; return; }

      const list = getStyles();
      const from = src.idx;
      const target = list[from];
      if (!target) { src = null; return; }
      list.splice(from, 1);
      const to = Math.max(0, Math.min(list.length, info.insertAt));
      list.splice(to, 0, target);
      // 拖到别的分组 → 跟着目标分组的名字走（拖到「未分组」则清空）
      const gname = info.group === '未分组' ? '' : info.group;
      if (gname !== (target.group || '')) target.group = gname;
      setStyles(list);
      // 标记：紧接着那次 click 是拖动收尾，不该当成「套用样式」
      container._klspJustDragged = true;
      setTimeout(() => { container._klspJustDragged = false; }, 300);
      src = null;
      rebuild();
    };

    container.addEventListener('mousedown', (ev) => {
      const btn = ev.target.closest('.klsp-item');
      if (!btn) return;
      if (ev.button !== 0) return;
      src = { id: btn.dataset.id, idx: parseInt(btn.dataset.idx, 10), el: btn };
      dragging = true; moved = false;
      sx = ev.clientX; sy = ev.clientY;
      doc.addEventListener('mousemove', onMove, true);
      doc.addEventListener('mouseup', onUp, true);
    }, true);

    // 拖完那次 click 不该触发「套用样式」
    container.addEventListener('click', (ev) => {
      if (ev.target.closest('.klsp-item')) {
        if (container._klspJustDragged) {
          container._klspJustDragged = false;
          ev.stopPropagation();
          ev.preventDefault();
        }
      }
    }, true);
  }

  function rebuild() {
    if (panel) {
      injectPanelSiteCss();   // 面板按钮的真实渲染靠这份站点样式
      buildBody(panel.querySelector('.klsp-body'));
    }
  }

  function switchToPlain() {
    if (typeof win.switchEditor === 'function') {
      try { win.switchEditor(0); toast('已切换到纯文本模式'); } catch (e) { toast('切换失败，请手动点编辑器上的「纯文本」'); }
    } else {
      toast('请手动点编辑器右上角的「纯文本」');
    }
    setTimeout(rebuild, 300);
  }

  function buildPanel() {
    if (panel) return panel;

    panel = el('div', '');
    panel.id = NS + '-panel';

    const head = el('div', 'klsp-head');
    const title = el('div', 'klsp-title'); title.textContent = '样式助手';
    const toggle = el('button', 'klsp-icobtn', { type: 'button', title: '收起 / 展开' });
    toggle.textContent = '⟨';
    const gear = el('button', 'klsp-icobtn', { type: 'button', title: '设置' });
    gear.textContent = '⚙';
    head.appendChild(title); head.appendChild(gear); head.appendChild(toggle);

    const body = el('div', 'klsp-body');
    const foot = el('div', 'klsp-foot');
    const addBtn = el('button', '', { type: 'button' }); addBtn.textContent = '+ 新建样式';
    addBtn.onclick = () => openStyleForm(null);
    const mgrBtn = el('button', '', { type: 'button' }); mgrBtn.textContent = '管理';
    mgrBtn.onclick = () => openStyleManager();
    foot.appendChild(addBtn); foot.appendChild(mgrBtn);

    panel.appendChild(head); panel.appendChild(body); panel.appendChild(foot);

    toggle.onclick = () => {
      const collapsed = panel.classList.toggle('klsp-collapsed');
      toggle.textContent = collapsed ? '⟩' : '⟨';
      store.set('collapsed', collapsed);
      if (!collapsed) positionPanel(true);
    };
    gear.onclick = () => openSettings();

    // 关键：阻止面板抢走 textarea 焦点，否则选区会丢
    panel.addEventListener('mousedown', ev => ev.preventDefault());

    buildBody(body);
    makeDraggable(panel, head);
    doc.body.appendChild(panel);

    if (store.get('collapsed', false)) {
      panel.classList.add('klsp-collapsed');
      toggle.textContent = '⟩';
    }
    return panel;
  }

  function makeDraggable(panelEl, handle) {
    let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
    const move = (ev) => {
      if (!dragging) return;
      panelEl.style.left = Math.round(ox + ev.clientX - sx) + 'px';
      panelEl.style.top = Math.round(oy + ev.clientY - sy) + 'px';
    };
    const up = () => {
      if (!dragging) return;
      dragging = false;
      store.set('pos', { left: parseInt(panelEl.style.left, 10), top: parseInt(panelEl.style.top, 10) });
      doc.removeEventListener('mousemove', move);
      doc.removeEventListener('mouseup', up);
    };
    handle.addEventListener('mousedown', (ev) => {
      if (ev.target.closest('.klsp-icobtn')) return;
      dragging = true;
      sx = ev.clientX; sy = ev.clientY;
      ox = parseFloat(panelEl.style.left) || 0;
      oy = parseFloat(panelEl.style.top) || 0;
      doc.addEventListener('mousemove', move);
      doc.addEventListener('mouseup', up);
      ev.preventDefault();
    });
  }

  function positionPanel(force) {
    if (!panel || !editor) return;
    const saved = store.get('pos', null);
    if (saved && !force && typeof saved.left === 'number') {
      panel.style.left = saved.left + 'px';
      panel.style.top = saved.top + 'px';
      return;
    }
    const host = editor.el.closest('.tedt, #postbox, form') || editor.el;
    const r = host.getBoundingClientRect();
    const w = panel.offsetWidth || 172;
    let left = r.left - w - 10;
    if (left < 8) left = Math.max(8, Math.min(r.left + 8, win.innerWidth - w - 8));
    panel.style.left = Math.round(left) + 'px';
    panel.style.top = Math.round(Math.max(8, r.top + 4)) + 'px';
  }

  /* ============================ 弹窗 ============================ */

  function modal(builder) {
    const mask = el('div', 'klsp-mask');
    const box = el('div', 'klsp-modal');
    const close = () => mask.remove();
    builder(box, close);
    mask.appendChild(box);
    mask.addEventListener('mousedown', ev => { if (ev.target === mask) mask.remove(); });
    doc.body.appendChild(mask);
    return mask;
  }

  function modalHead(box, text) {
    const h = el('h3');
    h.textContent = text;
    box.appendChild(h);
    return h;
  }

  /* ---------- 样式管理：列表 ---------- */

  function openStyleManager() {
    modal((box, close) => renderStyleList(box, close));
  }

  function renderStyleList(box, close) {
    box.innerHTML = '';
    modalHead(box, '样式管理');

    const list = getStyles();
    if (!list.length) {
      const p = el('div', 'klsp-hint');
      p.textContent = '还没有样式。点下面的「新建样式」添加第一条。';
      box.appendChild(p);
    }

    list.forEach((item, index) => {
      const row = el('div', 'klsp-list-item');
      const name = el('span', 'klsp-li-name');
      name.textContent = (item.group ? '[' + item.group + '] ' : '') + (item.name || '(未命名)');
      const code = el('span', 'klsp-li-code');
      code.textContent = item.action === 'clear' ? '（清除格式）' : (item.open || '') + ' … ' + (item.close || '');
      row.appendChild(name); row.appendChild(code);

      const mkBtn = (text, title, fn, danger) => {
        const b = el('button', 'klsp-mini' + (danger ? ' klsp-danger' : ''), { type: 'button', title: title });
        b.textContent = text;
        b.onclick = fn;
        return b;
      };
      row.appendChild(mkBtn('↑', '上移', () => {
        const l = getStyles();
        if (index === 0) return;
        [l[index - 1], l[index]] = [l[index], l[index - 1]];
        setStyles(l); renderStyleList(box, close); rebuild();
      }));
      row.appendChild(mkBtn('↓', '下移', () => {
        const l = getStyles();
        if (index >= l.length - 1) return;
        [l[index + 1], l[index]] = [l[index], l[index + 1]];
        setStyles(l); renderStyleList(box, close); rebuild();
      }));
      row.appendChild(mkBtn('编辑', '修改这条样式', () => renderStyleForm(box, close, item, () => renderStyleList(box, close))));
      row.appendChild(mkBtn('删除', '删除这条样式', () => {
        setStyles(getStyles().filter(x => x.id !== item.id));
        renderStyleList(box, close); rebuild();
      }, true));
      box.appendChild(row);
    });

    const btns = el('div', 'klsp-btns');
    const add = el('button', 'klsp-primary', { type: 'button' }); add.textContent = '新建样式';
    add.onclick = () => renderStyleForm(box, close, null, () => renderStyleList(box, close));
    const done = el('button', 'klsp-plain', { type: 'button' }); done.textContent = '关闭';
    done.onclick = close;
    btns.appendChild(add); btns.appendChild(done);
    box.appendChild(btns);
  }

  /* ---------- 样式管理：表单 ---------- */

  function renderStyleForm(box, close, item, back) {
    const isNew = !item;
    const data = Object.assign(
      { id: 'k' + Date.now(), group: '', name: '', open: '', close: '', block: false, hotkey: '', action: 'wrap', preview: {} },
      item || {}
    );

    box.innerHTML = '';
    modalHead(box, isNew ? '新建样式' : '编辑样式');

    const field = (labelText, input, hint) => {
      const l = el('label'); l.textContent = labelText;
      box.appendChild(l); box.appendChild(input);
      if (hint) { const h = el('div', 'klsp-hint'); h.textContent = hint; box.appendChild(h); }
    };

    const iGroup = el('input', '', { type: 'text', placeholder: '如：标题 / 强调（可留空）' });
    const iName = el('input', '', { type: 'text', placeholder: '按钮上显示的名字，如：红色警告' });
    const iOpen = el('input', 'klsp-mono', { type: 'text', placeholder: '如 [size=4][color=#c0392b]' });
    const iClose = el('input', 'klsp-mono', { type: 'text', placeholder: '如 [/color][/size]' });
    const iKey = el('input', 'klsp-mono', { type: 'text', placeholder: '可留空，如 alt+1' });
    iGroup.dataset.role = 'group'; iName.dataset.role = 'name';
    iOpen.dataset.role = 'open'; iClose.dataset.role = 'close'; iKey.dataset.role = 'key';
    iGroup.value = data.group; iName.value = data.name;
    iOpen.value = data.open; iClose.value = data.close; iKey.value = data.hotkey || '';

    /* ---- 粘贴现成代码：自动拆成开始/结束标签 ---- */
    const pasteLabel = el('label'); pasteLabel.textContent = '粘贴一段现成代码（可选，自动识别）';
    box.appendChild(pasteLabel);

    const pasteBox = el('textarea', 'klsp-mono');
    pasteBox.rows = 2;
    pasteBox.placeholder = '把帖子里看到的代码整段粘进来，如 [size=4][color=#c0392b]文字[/color][/size]';
    pasteBox.style.cssText = 'width:100%;resize:vertical;box-sizing:border-box';
    box.appendChild(pasteBox);

    const pasteRow = el('div', 'klsp-btns');
    pasteRow.style.cssText = 'justify-content:flex-start;margin:6px 0 2px';

    // 「识别」：从粘贴的代码里拆标签
    const pasteParse = el('button', 'klsp-plain', { type: 'button' });
    pasteParse.textContent = '识别为样式';
    pasteParse.title = '从上面的代码里拆出开始/结束标签，文字部分自动忽略';
    pasteParse.onclick = () => {
      const raw = pasteBox.value.trim();
      if (!raw) { toast('先粘一段代码上来'); return; }
      const p = parseBbcodeSnippet(raw);
      if (!p.open && !p.close) { toast('没识别出标签，请检查代码'); return; }
      iOpen.value = p.open;
      iClose.value = p.close;
      // 把原代码里的文字抽出来当预览样本，这样预览就是这段文字的真实效果
      const inner = extractBbcodeText(raw);
      if (inner) sampleText = inner;
      // 名字还没填就顺手给个建议：取其乐自定义标题的档位，或第一个标签名
      if (!iName.value.trim()) {
        const km = /\[k(\d+)\]/i.exec(p.open);
        if (km) iName.value = '标题 ' + km[1];
        else {
          const nm = /\[([a-z]+)/i.exec(p.open);
          if (nm) iName.value = nm[1] + ' 样式';
        }
      }
      refreshPreview();
      toast('已识别：' + (p.open || '(无)'));
    };

    // 「从选中吸取」已移除：它的选区来源与浏览页吸管重叠，容易让人困惑，
    // 真要用可以直接在帖子页用吸管吸。这里只保留「粘贴代码 → 识别」一条路。
    pasteRow.appendChild(pasteParse);
    box.appendChild(pasteRow);

    const pasteHint = el('div', 'klsp-hint');
    pasteHint.textContent = '识别后仍可在下面手动修改。';
    box.appendChild(pasteHint);

    field('分组', iGroup, '同名的会归到一组，按列表顺序显示。');
    field('名称', iName);
    field('开始标签', iOpen, '想清除格式就填 clear，开始与结束标签留空。');
    field('结束标签', iClose, '像 [hr] 这种没有结束标签的，留空即可。');
    field('快捷键', iKey, '格式如 alt+1、alt+shift+k，留空表示不绑定。');

    const rowBlock = el('div', 'klsp-row');
    const cBlock = el('input', '', { type: 'checkbox' });
    cBlock.checked = !!data.block;
    const lBlock = el('span'); lBlock.textContent = '块级样式（独占一行，未选中文字时套用整行）';
    rowBlock.appendChild(cBlock); rowBlock.appendChild(lBlock);
    box.appendChild(rowBlock);

    // 真实渲染开关：开=用其乐真实 CSS 渲染预览；关=用模拟外观（旧行为）
    const rowReal = el('div', 'klsp-row');
    const cReal = el('input', '', { type: 'checkbox' });
    const lReal = el('span'); lReal.textContent = '真实渲染预览';
    rowReal.title = '开启后用其乐帖子页的真实 CSS 渲染预览，所见即所得；关闭则用简化的模拟外观。';
    lReal.title = rowReal.title;
    rowReal.appendChild(cReal); rowReal.appendChild(lReal);
    box.appendChild(rowReal);

    cReal.checked = data.realRender !== false;   // 默认开启真实渲染

    // 效果预览：改标签 / 粘贴代码 / 切渲染方式时实时更新
    const pvTitle = el('label'); pvTitle.textContent = '效果预览';
    const pvb = makePreviewBox();
    box.appendChild(pvTitle); box.appendChild(pvb.box);

    // 预览要显示的真实文字：优先用「粘贴代码里带的那段文字」，让效果一眼可辨
    let sampleText = '预览文字 Aa 123';

    const refreshPreview = () => {
      const real = cReal.checked && realRenderOn();
      pvb.setReal(real);
      if (real) {
        // 真实渲染：其乐自己的 CSS 负责出效果，不再需要手填外观
        pvb.update(null, sampleText, null, iOpen.value, iClose.value);
      } else {
        // 模拟渲染：按标签反推外观，套在文字上
        pvb.update(mergedPreview({ open: iOpen.value }), sampleText, null, iOpen.value, iClose.value);
      }
    };
    // 开始标签改了 → 结束标签跟着同步（[k1] 不能再配 [/k2]）
    iOpen.addEventListener('input', () => {
      const next = syncClose(iOpen.value, iClose.value);
      if (next !== iClose.value) iClose.value = next;
      refreshPreview();
    });
    [iClose, iName].forEach(n => n.addEventListener('input', refreshPreview));
    cReal.addEventListener('change', refreshPreview);
    pasteBox.addEventListener('input', refreshPreview);
    refreshPreview();

    const btns = el('div', 'klsp-btns');
    const save = el('button', 'klsp-primary', { type: 'button' }); save.textContent = '保存';
    const cancel = el('button', 'klsp-plain', { type: 'button' }); cancel.textContent = '取消';
    save.onclick = () => {
      const open = iOpen.value.trim();
      const isClear = open.toLowerCase() === 'clear';
      const name = iName.value.trim() || (isClear ? '清除格式' : '');
      if (!name) { toast('请填写名称'); return; }
      if (!isClear && !open) { toast('请填写开始标签（或用 clear）'); return; }

      const next = Object.assign({}, data, {
        group: iGroup.value.trim(),
        name: name,
        action: isClear ? 'clear' : 'wrap',
        open: isClear ? '' : open,
        close: isClear ? '' : iClose.value.trim(),
        block: isClear ? false : cBlock.checked,
        hotkey: iKey.value.trim(),
        realRender: cReal.checked,      // 是否用真实渲染（面板按钮与预览都跟着走）
        preview: {}                     // 手填外观已取消，保留空对象兼容旧数据
      });
      const list = getStyles();
      const idx = list.findIndex(x => x.id === next.id);
      if (idx === -1) list.push(next); else list[idx] = next;
      setStyles(list);
      rebuild();
      back();
    };
    cancel.onclick = () => back();
    btns.appendChild(cancel); btns.appendChild(save);
    box.appendChild(btns);

    setTimeout(() => iName.focus(), 30);
  }

  /** 面板底部「+ 新建样式」直接用表单（不经过列表） */
  function openStyleForm(item) {
    modal((box, close) => renderStyleForm(box, close, item, close));
  }

  /* ---------- 设置 ---------- */

  function openSettings() {
    modal((box, close) => {
      modalHead(box, '样式助手设置');
      const mk = (key, label, def, tip) => {
        const row = el('div', 'klsp-row');
        if (tip) row.title = tip;
        const c = el('input', '', { type: 'checkbox' });
        c.checked = !!store.get(key, def);
        c.onchange = () => {
          store.set(key, c.checked);
          if (key === 'realRender') rebuild();   // 面板按钮立刻跟着换渲染方式
        };
        const s = el('span'); s.textContent = label;
        if (tip) s.title = tip;
        row.appendChild(c); row.appendChild(s);
        return row;
      };
      box.appendChild(mk('autoPlain', '自动切纯文本模式', true,
        '打开其乐发帖页时，如果编辑器是「所见即所得」模式，自动帮你切到纯文本模式（脚本写入的是 BBCode，只有纯文本模式才能用）。'));
      box.appendChild(mk('lineMode', '块级样式套用整行', true,
        '没选中文字时直接点块级样式按钮，会把光标所在的整行套上标签（类似 Word 的行操作）。关掉则只插入空标签。'));
      box.appendChild(mk('pickerOn', '选中后显示吸取吸管', true,
        '浏览帖子时，选中带格式的文字，选区右下角冒出一个吸管小图标，点它就能吸取样式。按住吸管拖动可以临时挪开（松手后不会误触，下次选中文字它仍回到选区旁）。关掉则完全不出现。'));
      box.appendChild(mk('realRender', '真实渲染', true,
        '用其乐的帖子样式渲染预览和按钮，所见即所得（[k0] 大字双横线、[k2] 渐变下划线等）。关掉则改用简化的模拟外观。'));

      const tools = el('div', 'klsp-btns');
      tools.style.cssText = 'justify-content:flex-start;flex-wrap:wrap';
      const loadEx = el('button', 'klsp-plain', { type: 'button' });
      loadEx.textContent = '载入示例样式';
      loadEx.title = '可选：写入一套常用样式做参考，之后随便改删';
      loadEx.onclick = () => {
        const list = getStyles();
        EXAMPLES.forEach((e, i) => {
          if (list.some(x => x.name === e.name && (x.group || '') === (e.group || ''))) return;
          list.push(Object.assign({ id: 'ex' + Date.now() + '_' + i, hotkey: '', action: 'wrap', preview: {} }, e));
        });
        setStyles(list); rebuild(); close();
        toast('已载入示例样式，可在「管理」里改删');
      };
      const clearAll = el('button', 'klsp-plain', { type: 'button' });
      clearAll.textContent = '清空全部样式';
      clearAll.onclick = () => { setStyles([]); rebuild(); close(); toast('已清空'); };
      const diag = el('button', 'klsp-plain', { type: 'button' });
      diag.textContent = '诊断信息';
      diag.onclick = () => openDiagnostics();
      const refreshCss = el('button', 'klsp-plain', { type: 'button' });
      refreshCss.textContent = '刷新站点样式';
      refreshCss.title = '预览要靠其乐帖子页的 CSS 才能真实渲染，但发帖页不加载它。' +
        '点这里从站点重新拉取一份（内置的种子可能因改版而过时）。';
      refreshCss.onclick = () => {
        refreshCss.disabled = true;
        refreshCss.textContent = '拉取中…';
        fetchSiteCss((okCount, err) => {
          refreshCss.disabled = false;
          refreshCss.textContent = '刷新站点样式';
          if (err) toast('拉取失败：' + err);
          else toast('已更新站点样式（' + okCount + ' 条标题规则）');
        });
      };
      tools.appendChild(loadEx); tools.appendChild(clearAll);
      tools.appendChild(refreshCss); tools.appendChild(diag);
      box.appendChild(tools);

      // 已记住的元素（吸取时教过的结构），教错了可以在这里删
      const smap = getStructMap();
      const skeys = Object.keys(smap);
      if (skeys.length) {
        const mt = el('label'); mt.textContent = '已记住的元素（' + skeys.length + '）';
        box.appendChild(mt);
        skeys.forEach(k => {
          const row = el('div', 'klsp-list-item');
          const nm = el('span', 'klsp-li-name');
          nm.textContent = k;
          const cd = el('span', 'klsp-li-code');
          cd.textContent = smap[k].open + ' … ' + (smap[k].close || '');
          const del = el('button', 'klsp-mini klsp-danger', { type: 'button' });
          del.textContent = '删除';
          del.onclick = () => {
            const m = getStructMap();
            delete m[k];
            store.set(STRUCT_MAP_KEY, m);
            close();
            openSettings();
          };
          row.appendChild(nm); row.appendChild(cd); row.appendChild(del);
          box.appendChild(row);
        });
      }

      const btns = el('div', 'klsp-btns');
      const done = el('button', 'klsp-plain', { type: 'button' }); done.textContent = '关闭';
      done.onclick = close;
      btns.appendChild(done);
      box.appendChild(btns);
    });
  }

  /** 面板没出现或行为异常时，用它看清脚本看到了什么 */
  function openDiagnostics() {
    let env = {};
    try {
      const ta = editor && editor.el;
      env = {
        version: VERSION,
        url: location.href,
        isPostPage: isPostPage(),
        editorFound: !!editor,
        textareaId: ta ? (ta.id || '(无 id)') : null,
        textareaName: ta ? ta.name : null,
        textareaVisible: ta ? isVisible(ta) : null,
        editorid: typeof win.editorid === 'string' ? win.editorid : null,
        wysiwyg: isWysiwyg(),
        hasSwitchEditor: typeof win.switchEditor === 'function',
        hasTextobj: !!(win.textobj && win.textobj.tagName === 'TEXTAREA'),
        textareaCount: doc.querySelectorAll('textarea').length,
        styleCount: getStyles().length,
        structMapCount: Object.keys(getStructMap()).length,
        userAgent: navigator.userAgent
      };
    } catch (e) { env = { error: String(e) }; }
    const text = JSON.stringify(env, null, 2);
    try { console.log('[其乐样式助手] 诊断信息', env); } catch (e) {}

    modal((box, close) => {
      modalHead(box, '诊断信息');
      const tip = el('div', 'klsp-hint');
      tip.textContent = '脚本没出现时，把这段贴给开发者即可（也已打印到浏览器控制台）。';
      const area = el('textarea', '', { readOnly: true });
      area.style.cssText = 'width:100%;height:200px;font:12px/1.5 Consolas,monospace;padding:8px;' +
        'border:1px solid #d6dce5;border-radius:5px;resize:vertical;background:#f8fafc';
      area.value = text;
      box.appendChild(tip); box.appendChild(area);

      const btns = el('div', 'klsp-btns');
      const copy = el('button', 'klsp-primary', { type: 'button' }); copy.textContent = '复制';
      const cancel = el('button', 'klsp-plain', { type: 'button' }); cancel.textContent = '关闭';
      copy.onclick = () => {
        area.select();
        let done = false;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text); done = true; }
        } catch (e) {}
        if (!done) { try { done = doc.execCommand('copy'); } catch (e) {} }
        toast(done ? '已复制' : '已选中，请按 Ctrl+C');
      };
      cancel.onclick = close;
      btns.appendChild(cancel); btns.appendChild(copy);
      box.appendChild(btns);
      setTimeout(() => area.select(), 30);
    });
  }

  /* ============================ 格式刷（从别人的帖子里吸取样式） ============================ */
  /* 帖子页只有渲染后的 HTML，所以只能反推：优先读 Discuz 保留的 <font size/color> 属性，
     读不到再用计算样式兜底。字号档位是近似值，弹窗里会摆出来让用户确认。 */

  const POST_BODY_SEL = '.t_f, [id^="postmessage_"], .pcb, .pcbcontent, .postmessage';
  const SIZE_PX = { 1: 10, 2: 13, 3: 16, 4: 18, 5: 24, 6: 32, 7: 48 };  // 浏览器对 <font size> 的默认映射

  const toHex = (v) => {
    if (!v) return '';
    const s = String(v).trim();
    if (/^#[0-9a-f]{3,8}$/i.test(s)) return s;
    const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/i.exec(s);
    if (!m) return '';
    if (m[4] !== undefined && parseFloat(m[4]) === 0) return '';        // 完全透明
    return '#' + [m[1], m[2], m[3]].map(n => ('0' + parseInt(n, 10).toString(16)).slice(-2)).join('');
  };

  const nearestSize = (px) => {
    let best = 0, diff = Infinity;
    Object.keys(SIZE_PX).forEach(n => {
      const d = Math.abs(SIZE_PX[n] - px);
      if (d < diff) { diff = d; best = parseInt(n, 10); }
    });
    return best;
  };

  /** 下划线 / 删除线：computed style 在部分环境不可靠，连祖先的 inline 声明与标签名一起看 */
  function decoFlags(pe) {
    let underline = false, strike = false;
    let cur = pe, depth = 0;
    while (cur && cur !== doc.body && depth++ < 6) {
      const tag = cur.tagName;
      if (tag === 'U' || tag === 'INS') underline = true;
      if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') strike = true;
      const inline = cur.style ? String(cur.style.textDecoration || cur.style.textDecorationLine || '') : '';
      if (inline.indexOf('underline') !== -1) underline = true;
      if (inline.indexOf('line-through') !== -1) strike = true;
      const cs = win.getComputedStyle(cur);
      const d = String((cs && (cs.textDecorationLine || cs.textDecoration)) || '');
      if (d.indexOf('underline') !== -1) underline = true;
      if (d.indexOf('line-through') !== -1) strike = true;
      cur = cur.parentElement;
    }
    return { underline: underline, strike: strike };
  }

  function textNodesIn(range) {
    const root = range.commonAncestorContainer;
    if (root && root.nodeType === 3) return root.nodeValue && root.nodeValue.trim() ? [root] : [];
    const out = [];
    if (!root || !root.childNodes) return out;
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let n;
    while ((n = walker.nextNode())) {
      if (!n.nodeValue || !n.nodeValue.trim()) continue;
      let hit = true;
      try { hit = range.intersectsNode(n); } catch (e) { hit = true; }
      if (hit) out.push(n);
    }
    return out;
  }

  /** 用户教过的「元素签名 → 标签」映射，存在设置里 */
  const STRUCT_MAP_KEY = 'structMap';
  const getStructMap = () => {
    const m = store.get(STRUCT_MAP_KEY, {});
    return (m && typeof m === 'object') ? m : {};
  };

  /** 元素签名：tagName + 头两个 class（没有 class 就往上找块级元素），用来认「同一类元素」 */
  function elementKey(node) {
    let pe = node && (node.nodeType === 1 ? node : node.parentElement);
    let n = 0;
    while (pe && pe !== doc.body && n++ < 4) {
      const c = pe.className;
      if (typeof c === 'string' && c.trim()) {
        return pe.tagName.toLowerCase() + '.' + c.trim().split(/\s+/).slice(0, 2).join('.');
      }
      if (pe.id) return pe.tagName.toLowerCase() + '#' + pe.id;
      if (/^(DIV|P|H[1-6]|BLOCKQUOTE|PRE|LI|TD|SECTION|ARTICLE)$/.test(pe.tagName)) {
        return pe.tagName.toLowerCase();
      }
      pe = pe.parentElement;
    }
    return '';
  }

  /** 兜底：按其乐的 class 命名习惯猜标签（sff_collapse → collapse，k0 → k0） */
  function guessTag(pe) {
    let cur = pe, n = 0;
    while (cur && cur !== doc.body && n++ < 3) {
      const cls = typeof cur.className === 'string' ? cur.className : '';
      const km = /KyloStylisedHeader(\d+)/i.exec(cls);      // 其乐标题：KyloStylisedHeader0 → [k0]
      if (km) return 'k' + km[1];
      const words = cls.split(/\s+/).filter(Boolean);
      for (const w of words) {
        let bare = '';
        if (/^sff[_-]/i.test(w)) bare = w.replace(/^sff[_-]/i, '');
        else if (/^[a-z]{1,3}\d$/i.test(w)) bare = w;      // 形如 k0 / h1 这种短标签名
        if (bare && /^[a-z][a-z0-9]{0,11}$/i.test(bare)) return bare.toLowerCase();
      }
      cur = cur.parentElement;
    }
    return '';
  }

  /**
   * 选区所在的结构容器 —— 规则照抄其乐官方的 static/js/bbcode.js（html2bbcode）：
   *   div.blockcode → [code]、div.quote → [quote]、裸 blockquote → [indent]
   *   h1~h6 → [size=(7-n)]、ul → [list]、ol → [list=1]、table → [table]
   * 其乐自定义的折叠块是 .sff_collapse（官方 collapse 代码）。
   * 剩下认不出的：先查用户教过的映射，再按 class 命名猜。
   */
  function structureOf(node) {
    const pe = node && (node.nodeType === 1 ? node : node.parentElement);
    if (!pe) return null;

    let n = null;
    // 其乐自定义：折叠块
    try { n = pe.closest('.sff_collapse'); } catch (e) { n = null; }
    if (n) {
      const t = n.querySelector('.sff_collapse_b');
      let title = t ? String(t.textContent || '') : '';
      title = title.replace(/^\s*[>»›]\s*/, '').trim();
      if (title === '折叠内容') title = '';            // 无标题时其乐填的默认文案
      return { kind: 'collapse', label: '折叠块 [collapse]' + (title ? '（' + title + '）' : ''), title: title };
    }
    // 官方规则：div.blockcode → [code]
    try { n = pe.closest('div.blockcode'); } catch (e) { n = null; }
    if (n) return { kind: 'code', label: '代码块 [code]' };
    // 官方规则：div.quote → [quote]
    try { n = pe.closest('div.quote'); } catch (e) { n = null; }
    if (n) return { kind: 'quote', label: '引用 [quote]' };
    try { n = pe.closest('pre'); } catch (e) { n = null; }
    if (n) return { kind: 'code', label: '代码块 [code]' };
    // [spoiler] / [spoil] / 海苔文本：真站 class 是 .bbcode_spoiler（含 .bbcode_spoiler_content）
    try { n = pe.closest('.bbcode_spoiler'); } catch (e) { n = null; }
    if (n) {
      // 其乐两种写法：.bbcode_spoiler_content（诗透内容）/ .bbcode_spoiler（外壳）
      const inner = n.querySelector('.bbcode_spoiler_content');
      const t = inner || n;
      let title = '';
      const head = n.querySelector('.bbcode_spoiler_title, .showhide-btn');
      if (head) title = String(head.textContent || '').replace(/点击显示|点击隐藏/g, '').trim();
      return { kind: 'spoiler', label: '剧透 [spoiler]' + (title ? '（' + title + '）' : ''), title: title };
    }
    // 隐藏类（真站实测结构，两者常嵌套：div.showhide > div.spoiler）
    //   [hide]  → div.showhide          （旁边有 <a class="showhide-btn">点击显示)
    //   [spoil] → div.spoiler           （老版折叠；新版 [spoiler] 是 span.bbcode_spoiler）
    // 先判内层 .spoiler（spoil），再判外层 .showhide（hide）
    try { n = pe.closest('div.spoiler'); } catch (e) { n = null; }
    if (n) return { kind: 'spoil', label: '折叠 [spoil]' };
    try { n = pe.closest('div.showhide'); } catch (e) { n = null; }
    if (n) return { kind: 'hide', label: '隐藏内容 [hide]' };
    try { n = pe.closest('.sff_hide, .hidecontent, .locked'); } catch (e) { n = null; }
    if (n) return { kind: 'hide', label: '隐藏内容 [hide]' };
    // [fly]（飞行文字）：其乐/Discuz 标准标签，渲染成 <marquee>
    try { n = pe.closest('marquee, .marquee, [class*="fly"]'); } catch (e) { n = null; }
    if (n) return { kind: 'fly', label: '飞行代码 [fly]' };
    // 官方规则：h1~h6 → [size=(7-n)]
    let hd = null;
    try { hd = pe.closest('h1, h2, h3, h4, h5, h6'); } catch (e) { hd = null; }
    if (hd) {
      // 其乐的标题类：KyloStylisedHeader0 / KyloStylisedHeader2 … → [k0] / [k2]
      const hcls = typeof hd.className === 'string' ? hd.className : '';
      const km = /KyloStylisedHeader(\d+)/i.exec(hcls);
      if (km) {
        // probe：预览时用同标签同 class 造一个元素，让它被其乐自己的 CSS 渲染
        return { kind: 'custom', label: '其乐标题 [k' + km[1] + ']',
          open: '[k' + km[1] + ']', close: '[/k' + km[1] + ']', key: elementKey(hd),
          probe: { tag: hd.tagName.toLowerCase(), cls: hcls } };
      }
      const lv = parseInt(hd.tagName.charAt(1), 10);
      const sz = Math.max(1, 7 - lv);
      return { kind: 'title', label: '标题 [size=' + sz + ']', size: sz };
    }
    // 官方规则：ul → [list]，ol → [list=1]
    let ls = null;
    try { ls = pe.closest('ul, ol'); } catch (e) { ls = null; }
    if (ls) {
      const ordered = ls.tagName === 'OL';
      return { kind: 'list', label: '列表 [' + (ordered ? 'list=1' : 'list') + ']', ordered: ordered };
    }
    // 官方规则：裸 blockquote → [indent]
    let bq = null;
    try { bq = pe.closest('blockquote'); } catch (e) { bq = null; }
    if (bq) return { kind: 'indent', label: '缩进 [indent]' };
    // 表格不识别 —— 表格结构复杂，统一让用户手动选或忽略；以后专门做表格工具

    // 用户教过的映射
    const key = elementKey(pe);
    const mapped = key ? getStructMap()[key] : null;
    if (mapped && mapped.open) {
      return { kind: 'custom', label: '已记住「' + key + '」→ ' + mapped.open, open: mapped.open, close: mapped.close || '', key: key };
    }
    // 兜底：按 class 命名猜（其乐自定义标签）
    const g = guessTag(pe);
    if (g) {
      return { kind: 'custom', label: '按 class 猜：[' + g + ']', open: '[' + g + ']', close: '[/' + g + ']', key: key, guessed: true };
    }
    return null;
  }

  /** 选中文字所在的元素链，识别不到结构时用来排查（形如 "span.klsp-x < div.t_f"） */
  function nodePath(node, depth) {
    let pe = node && (node.nodeType === 1 ? node : node.parentElement);
    const out = [];
    let n = 0;
    while (pe && pe !== doc.body && n++ < (depth || 4)) {
      let cls = '';
      const c = pe.className;
      if (typeof c === 'string' && c.trim()) cls = '.' + c.trim().split(/\s+/).slice(0, 3).join('.');
      else if (pe.id) cls = '#' + pe.id;
      out.push(pe.tagName.toLowerCase() + cls);
      pe = pe.parentElement;
    }
    return out.join(' < ');
  }

  /** 结构标签 → BBCode */
  function structureTags(st) {
    if (!st) return null;
    if (st.kind === 'collapse') return { open: '[collapse' + (st.title ? '=' + st.title : '') + ']', close: '[/collapse]' };
    if (st.kind === 'quote') return { open: '[quote]', close: '[/quote]' };
    if (st.kind === 'code') return { open: '[code]', close: '[/code]' };
    if (st.kind === 'hide') return { open: '[hide]', close: '[/hide]' };
    if (st.kind === 'indent') return { open: '[indent]', close: '[/indent]' };
    if (st.kind === 'table') return { open: '', close: '' };        // 不识别表格，存为空
    if (st.kind === 'spoiler') return { open: '[spoiler]', close: '[/spoiler]' };
    if (st.kind === 'spoil') return { open: '[spoil]', close: '[/spoil]' };
    if (st.kind === 'fly') return { open: '[fly]', close: '[/fly]' };
    if (st.kind === 'list') return { open: st.ordered ? '[list=1]\n' : '[list]\n', close: '\n[/list]' };
    // 官方规则：h1~h6 对应 [size=(7-n)]
    if (st.kind === 'title') return { open: '[size=' + (st.size || 5) + ']', close: '[/size]' };
    if (st.kind === 'custom') return { open: st.open || '', close: st.close || '' };
    return null;
  }

  /** 读选区的公共格式 → { open, close, desc, preview, align, sizeN, color, bg, bold, structure } */
  function readFormat(range) {
    const nodes = textNodesIn(range);
    if (!nodes.length) return null;

    let bold = true, italic = true, underline = true, strike = true;
    let color = null, bg = null, sizeN = null, px = null, basePx = null, align = null, fontName = null;
    let colorMixed = false, bgMixed = false, alignMixed = false, fontMixed = false;

    // 正文基准：跟正文一样的颜色/字号不算「格式」，否则每个字都会被读成带颜色
    const firstPe = nodes[0].parentElement;
    const bodyHolder = (firstPe && firstPe.closest(POST_BODY_SEL)) || doc.body;
    const baseColor = toHex(win.getComputedStyle(bodyHolder).color);
    const baseBodyPx = parseFloat(win.getComputedStyle(bodyHolder).fontSize) || 0;   // 正文真实字号
    const baseFont = String(win.getComputedStyle(bodyHolder).fontFamily || '')
      .split(',')[0].replace(/["']/g, '').trim().toLowerCase();                      // 正文基准字体
    const st = structureOf(nodes[0]);          // 折叠块 / 引用 / 代码 / 隐藏 这类结构
    const path = nodePath(nodes[0]);           // 诊断用：识别不到时至少能看出它是什么元素
    const key = elementKey(nodes[0]);          // 元素签名，用来「记住这类元素」

    nodes.forEach((node, i) => {
      const pe = node.parentElement;
      if (!pe) { bold = italic = underline = strike = false; return; }
      const cs = win.getComputedStyle(pe);
      const fontEl = pe.closest('font');

      const weight = parseInt(cs.fontWeight, 10) || 400;
      if (!(weight >= 600 || pe.closest('b,strong'))) bold = false;
      if (cs.fontStyle !== 'italic' && !pe.closest('i,em')) italic = false;

      // 下划线 / 删除线：计算样式不一定给，得连祖先的 inline 声明和标签名一起看
      const deco = decoFlags(pe);
      if (!deco.underline) underline = false;
      if (!deco.strike) strike = false;

      // 颜色：<font color> 优先；和正文同色视为无颜色
      let c = fontEl && fontEl.getAttribute('color') ? toHex(fontEl.getAttribute('color')) : toHex(cs.color);
      if (c && baseColor && c.toLowerCase() === baseColor.toLowerCase()) c = '';
      if (i === 0) color = c; else if (c !== color) colorMixed = true;

      let b = toHex(cs.backgroundColor);
      if (i === 0) bg = b; else if (b !== bg) bgMixed = true;

      // 字体：跟正文基准不同才写（官方 parsestyle 的 font-family → [font=]）
      const ff = String(cs.fontFamily || '').split(',')[0].replace(/["']/g, '').trim();
      const ffUse = (ff && ff.toLowerCase() !== baseFont) ? ff : '';
      if (i === 0) fontName = ffUse; else if (ffUse !== fontName) fontMixed = true;

      // 字号：<font size> 优先，否则拿 px 跟正文基准比
      const sizeEl = pe.closest('font[size]');
      if (sizeEl) {
        const n = parseInt(sizeEl.getAttribute('size'), 10);
        if (sizeN === null) sizeN = n; else if (sizeN !== n) sizeN = 0;
      }
      const holder = sizeEl ? sizeEl.parentElement : pe;
      const curPx = parseFloat(cs.fontSize) || 0;
      if (i === 0) { basePx = parseFloat(win.getComputedStyle(holder).fontSize) || 0; px = curPx; }
      else if (Math.abs(px - curPx) > 0.5) px = -1;

      // 对齐：从最近的块级祖先取
      let a = 'left';
      let anc = pe;
      while (anc && anc !== doc.body) {
        const ta = win.getComputedStyle(anc).textAlign;
        if (ta && ta !== 'start' && ta !== 'left' && ta !== 'inherit') { a = ta; break; }
        if (/^(P|DIV|TD|LI|BLOCKQUOTE|H[1-6])$/.test(anc.tagName)) break;
        anc = anc.parentElement;
      }
      if (i === 0) align = a === 'left' ? null : a; else if ((a === 'left' ? null : a) !== align) alignMixed = true;
    });

    if (colorMixed) color = null;
    if (bgMixed) bg = null;
    if (alignMixed) align = null;
    if (fontMixed) fontName = null;
    if (sizeN === 0) sizeN = null;
    if (sizeN === null && px > 0 && basePx && Math.abs(px - basePx) > 0.5) sizeN = nearestSize(px);

    // 没命中已知结构、也不是靠 [size] 放大，但字号明显比正文大 —— 十有八九是标题
    let stUse = st;
    if (!stUse && sizeN === null && px > 0 && baseBodyPx && px >= baseBodyPx * 1.25) {
      stUse = { kind: 'title', label: '标题（字号 ' + Math.round(px) + 'px，比正文大）' };
    }
    const stTags = structureTags(stUse);

    const open = [], close = [];
    const wrap = (o, c) => { open.push(o); close.unshift(c); };
    // 其乐标题 [kN] 里**不能再套别的标签**（套了标题代码就失效），
    // 而且颜色/加粗这些本来就是它自带的 —— 所以这类结构只输出标签本身。
    // 剧透/折叠类同理：内容处于隐藏态，读到的是其乐给的占位颜色，报出来只会误导。
    const kTitle = !!(stUse && stUse.open && /^\[k\d+\]$/i.test(stUse.open));
    const opaque = !!(stUse && (stUse.kind === 'spoiler' || stUse.kind === 'spoil' || stUse.kind === 'hide'));
    const bare = kTitle || opaque;
    if (!bare) {
      if (align) wrap('[align=' + align + ']', '[/align]');
      if (sizeN) wrap('[size=' + sizeN + ']', '[/size]');
      if (fontName) wrap('[font=' + fontName + ']', '[/font]');
      if (color) wrap('[color=' + color + ']', '[/color]');
      if (bg) wrap('[backcolor=' + bg + ']', '[/backcolor]');
      if (bold) wrap('[b]', '[/b]');
      if (italic) wrap('[i]', '[/i]');
      if (underline) wrap('[u]', '[/u]');
      if (strike) wrap('[s]', '[/s]');    // 官方是 [s]，不是 [strike]
    }

    const bits = [];
    if (stUse) bits.push(stUse.label);
    if (!bare) {          // [kN] / 剧透类只输出标签本身，就别报内层样式了
      if (align) bits.push('对齐 ' + align);
      if (sizeN) bits.push('字号 ' + (px > 0 ? px + 'px' : '') + ' → [size=' + sizeN + ']');
      if (fontName) bits.push('字体 ' + fontName);
      if (color) bits.push('文字色 ' + color);
      if (bg) bits.push('背景色 ' + bg);
      if (bold) bits.push('加粗');
      if (italic) bits.push('斜体');
      if (underline) bits.push('下划线');
      if (strike) bits.push('删除线');
    }

    return {
      open: open.join(''), close: close.join(''),
      align: align, sizeN: sizeN, color: color, bg: bg,
      bold: bold, italic: italic, underline: underline, strike: strike,
      structure: stUse, structureTags: stTags, path: path, elementKey: key, kNested: kTitle,
      text: (st && st.kind === 'collapse'
        ? String(range.toString() || '').replace(/^\s*[>»›]\s*/, '')
        : String(range.toString() || '')).trim(),
      desc: bits.join('、') || '（这段文字没有特殊格式）'
    };
  }

  function copyText(text) {
    let done = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text); done = true; }
    } catch (e) {}
    if (!done) {
      try {
        const ta = el('textarea', '', {});
        ta.style.cssText = 'position:fixed;left:-9999px;top:0';
        ta.value = text;
        doc.body.appendChild(ta);
        ta.select();
        done = doc.execCommand('copy');
        ta.remove();
      } catch (e) {}
    }
    toast(done ? '已复制' : '复制失败，请手动选中复制');
    return done;
  }

  function openFormatPicker(fmt) {
    modal((box, close) => {
      modalHead(box, '吸取样式');
      const line = el('div', 'klsp-readline');
      line.innerHTML = '读到：<b></b>';
      line.querySelector('b').textContent = fmt.desc;
      box.appendChild(line);
      // 只有没认出结构时才给元素链（平时不占地方）
      if (fmt.path && !fmt.structure) {
        const pl = el('div', 'klsp-hint');
        pl.textContent = '没认出结构，所在元素：' + fmt.path;
        box.appendChild(pl);
      }
      if (fmt.color || fmt.bg) {
        const sw = el('div', 'klsp-readline');
        if (fmt.color) sw.innerHTML += '<span class="klsp-swatch" style="background:' + fmt.color + '"></span>文字 ' + fmt.color + '　';
        if (fmt.bg) sw.innerHTML += '<span class="klsp-swatch" style="background:' + fmt.bg + '"></span>背景 ' + fmt.bg;
        box.appendChild(sw);
      }

      const fieldTo = (parent, labelText, input, hint) => {
        const l = el('label'); l.textContent = labelText;
        parent.appendChild(l); parent.appendChild(input);
        if (hint) { const h = el('div', 'klsp-hint'); h.textContent = hint; parent.appendChild(h); }
      };
      const field = (labelText, input, hint) => fieldTo(box, labelText, input, hint);

      const iOpen = el('input', 'klsp-mono', { type: 'text' });
      const iClose = el('input', 'klsp-mono', { type: 'text' });
      const iName = el('input', '', { type: 'text', placeholder: '给这个样式起个名，如：蓝色小标题' });
      const iGroup = el('input', '', { type: 'text', placeholder: '分组，可留空' });
      iOpen.dataset.role = 'open';
      iClose.dataset.role = 'close';
      iName.dataset.role = 'name';
      iGroup.dataset.role = 'group';
      iGroup.value = fmt.align ? '段落' : '吸取';

      // 结构容器：自动识别到的会选中，识别不到也能自己挑
      const iStruct = el('select', '');
      [['不套', [['', '只套文字样式']]],
       ['标题', [['kN', '标题 [kN]']]],
       ['字号', [['title', '字号 [size=N]']]],
       ['区块', [['collapse', '折叠块 [collapse]'], ['quote', '引用 [quote]'], ['code', '代码 [code]'],
                 ['hide', '隐藏内容 [hide]'], ['spoiler', '剧透 [spoiler]'], ['spoil', '折叠 [spoil]'], ['indent', '缩进 [indent]'], ['list', '列表 [list]']]],
       ['自定义', [['custom', '用下面的标签']]]
      ].forEach(pair => {
        const g = doc.createElement('optgroup');
        g.label = pair[0];
        pair[1].forEach(opt => {
          const op = doc.createElement('option');
          op.value = opt[0]; op.textContent = opt[1];
          g.appendChild(op);
        });
        iStruct.appendChild(g);
      });
      const textOpen = fmt.open, textClose = fmt.close;
      const applyStruct = (kind) => {
        let tags = null;
        if (kind === 'custom') {
          tags = (fmt.structure && fmt.structure.open)
            ? { open: fmt.structure.open, close: fmt.structure.close || '' } : null;
        } else if (kind === 'kN') {
          // 从已识别到的结构里抠出 N（structureOf 在 KyloStylisedHeaderN 时 open = '[kN]'）
          let n = '0';
          if (fmt.structure && fmt.structure.open) {
            const m = /\[k(\d+)\]/i.exec(fmt.structure.open);
            if (m) n = m[1];
          }
          tags = { open: '[k' + n + ']', close: '[/k' + n + ']' };
        } else if (kind) {
          tags = structureTags({
            kind: kind,
            title: fmt.structure ? fmt.structure.title : '',
            size: (fmt.structure && fmt.structure.size) ? fmt.structure.size : 5,
            ordered: fmt.structure ? !!fmt.structure.ordered : false
          });
        }
        iOpen.value = (tags ? tags.open : '') + textOpen;
        iClose.value = textClose + (tags ? tags.close : '');
      };
      iStruct.value = fmt.structure ? fmt.structure.kind : '';
      iStruct.onchange = () => { applyStruct(iStruct.value); refreshPreview(); };
      applyStruct(iStruct.value);

      // 主区：预览 + 名字，代码相关全部收进「高级」——不懂代码的人不用看到
      const pvTitle = el('label'); pvTitle.textContent = '效果预览';
      const pvb = makePreviewBox();
      box.appendChild(pvTitle); box.appendChild(pvb.box);
      field('名称', iName);
      field('分组', iGroup);

      const advTitle = el('div', 'klsp-advtoggle');
      advTitle.textContent = '▸ 手动修改';
      const advBody = el('div', 'klsp-advbody');
      advBody.style.display = 'none';
      advTitle.onclick = () => {
        const opening = advBody.style.display === 'none';
        advBody.style.display = opening ? 'block' : 'none';
        advTitle.textContent = (opening ? '▾' : '▸') + ' 手动修改';
      };
      box.appendChild(advTitle); box.appendChild(advBody);

      const sLabel = el('label'); sLabel.textContent = '脚本判断的代码类型';
      const sLine = el('div', 'klsp-row');
      const sVal = el('span', '');
      sVal.textContent = fmt.structure ? fmt.structure.label : '（没识别到特殊结构，只套文字样式）';
      const sEdit = el('button', 'klsp-mini', { type: 'button' });
      sEdit.textContent = '改';
      sLine.appendChild(sVal); sLine.appendChild(sEdit);
      advBody.appendChild(sLabel); advBody.appendChild(sLine);
      iStruct.style.display = 'none';
      advBody.appendChild(iStruct);
      sEdit.onclick = () => {
        sLine.style.display = 'none';
        iStruct.style.display = 'block';
        iStruct.focus();
      };
      fieldTo(advBody, '开始标签', iOpen, '读出来的结果，不对就直接改。');
      fieldTo(advBody, '结束标签', iClose);

      // 教一次，以后同类元素自动认出来
      const keyNow = fmt.elementKey || '';
      let cRemember = null;
      if (keyNow) {
        const row = el('div', 'klsp-row');
        cRemember = el('input', '', { type: 'checkbox' });
        const s = el('span');
        s.textContent = '记住「' + keyNow + '」这类元素 → 用上面的标签';
        row.appendChild(cRemember); row.appendChild(s);
        advBody.appendChild(row);
      }

      const refreshPreview = () => {
        // 全局关掉真实渲染 → 一律走模拟外观
        if (!realRenderOn()) {
          pvb.setReal(false);
          pvb.update(mergedPreview({ open: iOpen.value }), iName.value.trim() || fmt.text || '预览文字 Aa 123',
            null, iOpen.value, iClose.value);
          return;
        }
        pvb.setReal(true);
        // 标签里是 [kN] 时走 probe（真站 CSS 渲染）。
        // 真站规则是「标签与 N 严格绑定」：h1.KyloStylisedHeader0 / h2.KyloStylisedHeader1 / h3.KyloStylisedHeader2 …
        // 即 tag 必须是 h(N+1)，只换 class 不换标签的话 CSS 匹配不上。
        let probe = null;
        const m = /\[k(\d+)\]/i.exec(iOpen.value);
        if (m) {
          const n = parseInt(m[1], 10);
          probe = { tag: 'h' + Math.min(6, Math.max(1, n + 1)), cls: 'KyloStylisedHeader' + n };
        }
        pvb.update(null, iName.value.trim() || fmt.text || '预览文字 Aa 123', probe, iOpen.value, iClose.value);
      };
      // 开始标签改了，自动同步结束标签（否则 [k2]…[/k0] 不闭合，其乐解析不了）
      iOpen.addEventListener('input', () => {
        const next = syncClose(iOpen.value, iClose.value);
        if (next !== iClose.value) iClose.value = next;
        refreshPreview();
      });
      iName.addEventListener('input', refreshPreview);
      refreshPreview();

      const btns = el('div', 'klsp-btns');
      btns.style.cssText = 'flex-wrap:wrap;justify-content:flex-end';
      const copyBtn = el('button', 'klsp-plain', { type: 'button' });
      copyBtn.textContent = '复制这段文字';
      copyBtn.title = '把选中的文字连同格式一起复制，可直接粘进发帖框';
      copyBtn.onclick = () => copyText(iOpen.value + fmt.text + iClose.value);
      const saveBtn = el('button', 'klsp-primary', { type: 'button' });
      saveBtn.textContent = '存成样式';
      saveBtn.onclick = () => {
        const open = iOpen.value.trim();
        if (!open) { toast('开始标签是空的，没什么可存'); return; }
        const list = getStyles();
        list.push({
          id: 'p' + Date.now(),
          group: iGroup.value.trim(),
          name: iName.value.trim() || '吸取的样式',
          open: open,
          close: iClose.value.trim(),
          block: !!fmt.align,
          hotkey: '',
          action: 'wrap',
          preview: {
            bold: fmt.bold, italic: fmt.italic, underline: fmt.underline, strike: fmt.strike,
            color: fmt.color || '', bg: fmt.bg || ''
          }
        });
        setStyles(list);
        if (cRemember && cRemember.checked && keyNow) {
          const m = getStructMap();
          m[keyNow] = { open: open, close: iClose.value.trim() };
          store.set(STRUCT_MAP_KEY, m);
        }
        rebuild();
        close();
        toast(cRemember && cRemember.checked ? '已存成样式，并记住了这类元素' : '已存成样式，发帖页就能用了');
      };
      const cancel = el('button', 'klsp-plain', { type: 'button' });
      cancel.textContent = '取消';
      cancel.onclick = close;
      btns.appendChild(copyBtn); btns.appendChild(cancel); btns.appendChild(saveBtn);
      box.appendChild(btns);

      setTimeout(() => iName.focus(), 30);
    });
  }

  /* ---------- 选中文字后的吸管小图标（跟随选区 / 可临时拖开） ---------- */

  let pickBtn = null, savedRange = null;
  let swallowClick = false;  // 刚拖完 → 吞掉紧接着那一次 click，别误弹吸取窗

  const PICK_SIZE = 22;    // 吸管直径，和 CSS 里 .klsp-pick 的宽高保持一致
  const PICK_MARGIN = 2;   // 距视口边缘多少 px 算「吸附到边」
  const DRAG_SLOP = 4;     // 位移超过这么多 px 才算「拖动」，否则算点击
  const PICK_DEF_DX = 6;   // 吸管默认偏移：选区右下角再让开一点，别压住文字
  const PICK_DEF_DY = 6;

  // 吸管图标：一段斜向滴管。用 inline SVG，免得再挂图床或字体
  const PICK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M19 3l2 2-3.5 3.5"/>' +
    '<path d="M17.5 5.5L9 14l-1.5 3.5L11 16l8.5-8.5z"/>' +
    '<path d="M6.5 17.5L4 20"/>' +
    '</svg>';

  function hidePicker() {
    if (pickBtn) pickBtn.style.display = 'none';
  }

  function inPostBody(node) {
    const pe = node && (node.nodeType === 1 ? node : node.parentElement);
    if (!pe) return false;
    try { return !!pe.closest(POST_BODY_SEL); } catch (e) { return false; }
  }

  /** 把坐标夹在视口内，别让吸管跑出屏幕 */
  function clampPickPos(x, y) {
    const maxX = Math.max(0, win.innerWidth - PICK_SIZE - 2);
    const maxY = Math.max(0, win.innerHeight - PICK_SIZE - 2);
    return {
      x: Math.min(Math.max(2, Math.round(x)), maxX),
      y: Math.min(Math.max(2, Math.round(y)), maxY)
    };
  }

  function setPickPos(left, top) {
    pickBtn.style.left = Math.round(left) + 'px';
    pickBtn.style.top = Math.round(top) + 'px';
  }

  /**
   * 记住吸管位置。**必须连视口尺寸一起记** —— 否则换了显示器或改了窗口大小，
   * 旧坐标可能落在屏幕外，用户就「找不着吸管」了。
   */
  /**
   * 记住吸管相对选区的偏移量（不是绝对坐标）。
   * 拖动只是把吸管从默认的「选区右下角」挪开一点点，之后每次选中仍有同样的相对位置，
   * 这样它才会跟着新选区跑 —— 存绝对坐标会让吸管钉死在一个地方。
   */
  function savePickOffset(dx, dy) {
    try { store.set('pickOff', { dx: Math.round(dx), dy: Math.round(dy) }); } catch (e) {}
  }

  function getPickOffset() {
    const p = store.get('pickOff', null);
    if (p && typeof p.dx === 'number' && typeof p.dy === 'number') return p;
    return null;
  }

  function clearPickOffset() {
    try { store.set('pickOff', null); } catch (e) {}
  }

  // 本轮拖拽的真实位移量。用它（而不是布尔 moved）判断「是拖还是点」
  let dragMoved = 0;

  /** 拖拽：按住吸管挪动。松手记住的是「相对选区的偏移」，之后一直沿用这个偏移 */
  function makePickDraggable() {
    let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
    // 本次拖动开始时，吸管相对当前选区的偏移。拖完就是新偏移。
    let baseDx = 0, baseDy = 0;
    const move = (ev) => {
      if (!dragging) return;
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (dragMoved === 0 && Math.abs(dx) + Math.abs(dy) < DRAG_SLOP) return;
      dragMoved = Math.abs(dx) + Math.abs(dy);
      pickBtn.classList.add('klsp-dragging');
      setPickPos(ox + dx, oy + dy);
      ev.preventDefault();
    };
    const up = () => {
      if (!dragging) return;
      dragging = false;
      pickBtn.classList.remove('klsp-dragging');
      doc.removeEventListener('mousemove', move);
      doc.removeEventListener('mouseup', up);
      // 位移太小 → 当作一次点击，交给 click 判断，不吞
      if (dragMoved < DRAG_SLOP) { dragMoved = 0; return; }
      // 真拖过 → 标记吞掉紧接着的 click，避免松手瞬间弹出吸取窗
      swallowClick = true;
      setTimeout(() => { swallowClick = false; }, 300);
      // 新偏移 = 基准偏移 + 本次位移
      savePickOffset(baseDx + (parseFloat(pickBtn.style.left) || 0) - ox,
                     baseDy + (parseFloat(pickBtn.style.top) || 0) - oy);
      dragMoved = 0;
    };
    pickBtn.addEventListener('mousedown', (ev) => {
      ev.preventDefault();   // 保住选区
      dragging = true; dragMoved = 0;
      sx = ev.clientX; sy = ev.clientY;
      ox = parseFloat(pickBtn.style.left) || 0;
      oy = parseFloat(pickBtn.style.top) || 0;
      const off = getPickOffset() || { dx: PICK_DEF_DX, dy: PICK_DEF_DY };
      baseDx = off.dx; baseDy = off.dy;
      doc.addEventListener('mousemove', move);
      doc.addEventListener('mouseup', up);
    });
    // 双击 = 忘掉自定义偏移，回到「选区右下角」
    pickBtn.addEventListener('dblclick', (ev) => {
      ev.preventDefault();
      clearPickOffset();
      onSelectionEnd();
      toast('已回到选区右下角');
    });
  }

  function onSelectionEnd() {
    if (!store.get('pickerOn', true)) return;
    setTimeout(() => {
      try {
        const sel = win.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount) { hidePicker(); return; }
        const range = sel.getRangeAt(0);
        if (!range.toString().trim()) { hidePicker(); return; }
        if (!inPostBody(range.commonAncestorContainer)) { hidePicker(); return; }

        const fmt = readFormat(range);
        // 只有文字样式或结构（折叠/引用等）至少占一样，才值得打扰
        if (!fmt || (!fmt.open && !fmt.structure)) { hidePicker(); return; }

        savedRange = range.cloneRange();
        if (!pickBtn) {
          pickBtn = el('button', 'klsp-pick', { type: 'button' });
          pickBtn.innerHTML = PICK_SVG;
          pickBtn.title = '吸取样式（拖动可换相对选区的位置，双击回到默认）';
          pickBtn.setAttribute('aria-label', '吸取样式');
          pickBtn.addEventListener('click', (ev) => {
            ev.preventDefault();
            // 刚拖完 / 正在拖 → 不弹窗。用独立标记，不依赖拖拽变量的时序
            if (swallowClick || dragMoved > 0 ||
                pickBtn.classList.contains('klsp-dragging')) return;
            const f = savedRange ? readFormat(savedRange) : null;
            hidePicker();
            if (f && (f.open || f.structure)) openFormatPicker(f);
            else toast('没读到可用格式');
          });
          makePickDraggable();
          doc.body.appendChild(pickBtn);
        }

        pickBtn.style.display = 'flex';

        // 始终以「选区」为锚点定位，只是把默认偏移换成用户拖出来的偏移。
        // 这样换一段文字，吸管自然跟着新选区走（而不是钉在某组绝对坐标上）。
        let rect = null;
        try { rect = range.getBoundingClientRect(); } catch (e) { rect = null; }
        if (!rect) rect = { right: 0, bottom: 0 };
        const off = getPickOffset() || { dx: PICK_DEF_DX, dy: PICK_DEF_DY };
        const p = clampPickPos(rect.right + off.dx, rect.bottom + off.dy);
        setPickPos(p.x, p.y);
      } catch (e) { hidePicker(); }
    }, 10);
  }

  function setupPicker() {
    doc.addEventListener('mouseup', onSelectionEnd, true);
    doc.addEventListener('keyup', (ev) => { if (ev.shiftKey || ev.key === 'a') onSelectionEnd(); }, true);
    // 滚动或改窗口大小后，吸管相对选区的位置就失效了，藏起来等下次选中重新定位
    doc.addEventListener('scroll', hidePicker, true);
    win.addEventListener('resize', hidePicker);
  }

  /* ============================ 快捷键（跟样式走） ============================ */

  function parseHotkey(str) {
    if (!str) return null;
    const parts = String(str).toLowerCase().split('+').map(s => s.trim()).filter(Boolean);
    const mods = { alt: false, ctrl: false, shift: false, meta: false };
    let key = '';
    parts.forEach(p => {
      if (p === 'alt' || p === 'ctrl' || p === 'shift' || p === 'meta') mods[p] = true;
      else if (p === 'cmd' || p === 'win') mods.meta = true;
      else key = p;
    });
    if (!key) return null;
    return { mods: mods, key: key };
  }

  function matchHotkey(ev, hk) {
    if (ev.altKey !== hk.mods.alt || ev.ctrlKey !== hk.mods.ctrl ||
        ev.shiftKey !== hk.mods.shift || ev.metaKey !== hk.mods.meta) return false;
    const k = (ev.key || '').toLowerCase();
    if (k === hk.key) return true;
    if (/^[0-9]$/.test(hk.key) && ev.code === 'Digit' + hk.key) return true;  // shift+数字 时 key 会变成符号
    return false;
  }

  function onKeyDown(ev) {
    if (!booted || !editor) return;
    const active = doc.activeElement;
    if (active && /INPUT|TEXTAREA/.test(active.tagName) && active !== editor.el) return;
    for (const item of getStyles()) {
      const hk = parseHotkey(item.hotkey);
      if (hk && matchHotkey(ev, hk)) {
        if (isWysiwyg()) { toast('请先切到纯文本模式'); return; }
        ev.preventDefault();
        editor.el.focus();
        applyItem(item);
        return;
      }
    }
  }

  /* ============================ 启动 ============================ */

  function tryAutoPlain() {
    if (!store.get('autoPlain', true)) return;
    const run = () => {
      if (!isWysiwyg() || typeof win.switchEditor !== 'function') return;
      try { win.switchEditor(0); } catch (e) {}
      setTimeout(rebuild, 200);
    };
    run();
    setTimeout(run, 900);
  }

  function watchModeSwitch() {
    const ids = [];
    if (typeof win.editorid === 'string') ids.push(win.editorid + '_switcher');
    ids.push('e_switcher');
    ids.forEach(id => {
      const node = doc.getElementById(id);
      if (node && !node.dataset.klspWatched) {
        node.dataset.klspWatched = '1';
        node.addEventListener('click', () => setTimeout(rebuild, 250));
      }
    });
  }

  function boot() {
    if (booted) return true;
    if (!isPostPage()) return false;          // 浏览帖子等页面不注入
    editor = findEditor();
    if (!editor) return false;
    booted = true;

    if (isWysiwyg()) tryAutoPlain();
    buildPanel();
    positionPanel(false);
    doc.addEventListener('keydown', onKeyDown, true);
    watchModeSwitch();
    return true;
  }

  function init() {
    addStyle(CSS);
    setupPicker();                            // 选中文字后的吸管：所有页面都可能用（只在帖子正文区出现）
    if (boot()) return;
    if (!isPostPage()) return;                // 非发帖页不注入面板，也不轮询
    let tries = 0;
    const timer = setInterval(() => {
      if (boot() || ++tries > 20) clearInterval(timer);
    }, 500);
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();

  /* ============================ 页面抓取探针 ============================ */
  /* 有些帖子要登录才看得到。在 URL 后面加 #klsp-probe（或指定帖子号）打开页面，
     脚本会把正文存进 Tampermonkey 存储，外部就能读到——用来核对其乐的代码写法。 */

  const PROBE_IDS = ['t307370'];
  (function () {
    try {
      const hit = location.hash.indexOf('klsp-probe') !== -1 ||
        PROBE_IDS.some(id => location.href.indexOf(id) !== -1);
      if (!hit) return;
      const grab = () => {
        const el = doc.querySelector('.t_f, [id^="postmessage_"]') || doc.querySelector('#postlist') || doc.body;
        return { text: String(el.innerText || el.textContent || ''), html: String(el.innerHTML || '') };
      };
      const save = () => {
        try {
          const d = grab();
          if (!d.text.trim()) return;
          if (typeof GM_setValue === 'function') {
            GM_setValue('probe_url', location.href);
            GM_setValue('probe_text', d.text.slice(0, 300000));
            GM_setValue('probe_html', d.html.slice(0, 300000));
            GM_setValue('probe_time', Date.now());
          }
          try { console.log('[KLSP probe] 已抓取 ' + d.text.length + ' 字'); } catch (e) {}
        } catch (e) {}
      };
      save();
      setTimeout(save, 2000);
      setTimeout(save, 5000);
    } catch (e) {}
  })();

  // 调试入口（控制台可用）：KLSP.rebuild() / KLSP.findEditor() / KLSP.isPostPage()
  win.KLSP = {
    boot: boot, rebuild: rebuild, findEditor: findEditor, isWysiwyg: isWysiwyg, isPostPage: isPostPage,
    applyInline: applyInline, applyBlock: applyBlock, currentLineRange: currentLineRange,
    stripTags: stripTags, getStyles: getStyles, setStyles: setStyles,
    readFormat: readFormat, toHex: toHex, nearestSize: nearestSize,
    previewFromTags: previewFromTags, mergedPreview: mergedPreview, luminance: luminance,
    syncClose: syncClose, guessClose: guessClose, parseBbcodeSnippet: parseBbcodeSnippet,
    structureOf: structureOf, structureTags: structureTags, bbcodeToHtml: bbcodeToHtml,
    collectMatchingCss: collectMatchingCss, inlineMatchedCss: inlineMatchedCss,
    elementKey: elementKey, getStructMap: getStructMap, nodePath: nodePath,
    checkSelection: onSelectionEnd, hidePicker: hidePicker, version: VERSION,
    pickOffset: getPickOffset, clearPickOffset: clearPickOffset
  };
})();
