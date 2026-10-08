/* 冒烟测试：用 jsdom 加载 demo.html + 脚本，验证门禁、面板注入、样式增删改与各类插入逻辑
   运行：NODE_PATH=<workspace>/node_modules node demo/smoke-test.js  */
const path = require('path');
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const html = fs.readFileSync(path.resolve(__dirname, 'demo.html'), 'utf8')
  .replace(/<script src="[^"]*Keylol[^"]*"><\/script>/,
    '<script>' + fs.readFileSync(path.resolve(__dirname, '..', 'Keylol样式面板.user.js'), 'utf8') + '</script>');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const vc = new VirtualConsole();
vc.on('jsdomError', (e) => {
  if (/Not implemented/.test(e.message)) return;          // execCommand 等未实现，属预期
  console.log('  [jsdomError] ' + (e.detail ? (e.detail.stack || e.detail) : e.message));
});
['log', 'warn', 'error'].forEach(k => vc.on(k, (...a) => {
  if (String(a[0] || '').indexOf('[其乐样式助手]') !== -1) return;   // 诊断信息打印
  console.log('  [page:' + k + ']', ...a);
}));

function makeDom(url) {
  const dom = new JSDOM(html, { runScripts: 'dangerously', virtualConsole: vc, url: url });
  return new Promise(res => {
    if (dom.window.document.readyState === 'complete') res(dom);
    else dom.window.addEventListener('load', () => res(dom));
  });
}

const POST_URL = 'https://keylol.com/forum.php?mod=post&action=newthread&fid=234';
const VIEW_URL = 'https://keylol.com/t1050802-1-1';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async function () {
  /* ============ 场景一：浏览帖子页 —— 不该注入 ============ */
  console.log('浏览帖子页（不该出现面板）');
  {
    const dom = await makeDom(VIEW_URL);
    const { window } = dom;
    const doc = window.document;
    const clickIn = (node) => node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const findBtn = (root, text) => Array.from(root.querySelectorAll('button')).find(b => b.textContent === text);
    ok('URL 判定为非发帖页', window.KLSP.isPostPage() === false);
    ok('没有注入面板', !doc.getElementById('klsp-panel'));
    ok('手动 boot() 也不注入', window.KLSP.boot() === false && !doc.getElementById('klsp-panel'));
    ok('快速回复框还在页面上（脚本没碰它）', !!doc.getElementById('fastpostmessage'));

    console.log('格式刷：颜色/档位换算');
    ok('rgb 转 hex', window.KLSP.toHex('rgb(192, 57, 43)') === '#c0392b', window.KLSP.toHex('rgb(192, 57, 43)'));
    ok('hex 原样返回', window.KLSP.toHex('#2980b9') === '#2980b9');
    ok('全透明视为无背景', window.KLSP.toHex('rgba(0, 0, 0, 0)') === '');
    ok('18px 归到 [size=4]', window.KLSP.nearestSize(18) === 4, window.KLSP.nearestSize(18));
    ok('24px 归到 [size=5]', window.KLSP.nearestSize(24) === 5);

    console.log('格式刷：从别人帖子里读格式');
    const body = doc.getElementById('postmessage_1001');
    const readOf = (selector) => {
      const el = body.querySelector(selector);
      const range = doc.createRange();
      range.selectNodeContents(el);
      return window.KLSP.readFormat(range);
    };

    const red = readOf('font[color]');
    ok('读出颜色标签', red.open.indexOf('[color=#c0392b]') !== -1, red.open);

    const big = readOf('font[size="5"]');
    ok('读出字号档位', big.open.indexOf('[size=5]') !== -1, big.open);
    ok('字号与加粗一起读出', big.open.indexOf('[b]') !== -1, big.open);
    ok('结束标签逆序闭合', big.close === '[/b][/size]', big.close);

    const hl = readOf('span[style*="background-color"]');
    ok('读出高亮背景', hl.open.indexOf('[backcolor=#ffe58f]') !== -1, hl.open);

    const deco = readOf('span[style*="text-decoration"]');
    ok('读出下划线', deco.open.indexOf('[u]') !== -1, deco.open);

    const both = readOf('span[style*="font-weight:700"]');
    ok('同时读出颜色与加粗', both.open.indexOf('[color=#2980b9]') !== -1 && both.open.indexOf('[b]') !== -1, both.open);

    // 字体（官方 parsestyle 的 font-family → [font=]）
    const ffProbe = doc.createElement('span');
    ffProbe.style.fontFamily = 'SimSun';
    ffProbe.textContent = '字体样本';
    body.appendChild(ffProbe);
    const ffFmt = window.KLSP.readFormat((() => { const r = doc.createRange(); r.selectNodeContents(ffProbe); return r; })());
    ffProbe.remove();
    ok('读出 [font=字体]', ffFmt.open.indexOf('[font=SimSun]') !== -1, ffFmt.open);

    const plain = readOf('.plain-sample');
    ok('纯文本段落不产生标签', plain.open === '' && /没有特殊格式/.test(plain.desc), JSON.stringify(plain.open));

    console.log('格式刷：结构识别（折叠块 / 引用）');
    const readEl = (selector) => {
      const el2 = body.querySelector(selector);
      const range2 = doc.createRange();
      range2.selectNodeContents(el2);
      return window.KLSP.readFormat(range2);
    };
    const colTitle = readEl('.sff_collapse_b');
    ok('识别出折叠块', colTitle.structure && colTitle.structure.kind === 'collapse',
      JSON.stringify(colTitle.structure));
    ok('折叠块标题去掉了箭头符号', colTitle.structure.title === '大型限时福利的具体定义',
      colTitle.structure && colTitle.structure.title);
    ok('折叠块生成 [collapse=标题]', (() => {
      const t = window.KLSP.structureTags(colTitle.structure);
      return t.open === '[collapse=大型限时福利的具体定义]' && t.close === '[/collapse]';
    })(), JSON.stringify(window.KLSP.structureTags(colTitle.structure)));
    ok('结构描述进 desc', /折叠块/.test(colTitle.desc), colTitle.desc);

    ok('输出所在元素链（诊断用）', /div/.test(colTitle.path || ''), colTitle.path);

    const bigTitle = readEl('.demo-title');
    ok('字号明显大于正文 → 建议按标题处理',
      bigTitle.structure && bigTitle.structure.kind === 'title', JSON.stringify(bigTitle.structure));
    ok('标题建议里带上字号', /字号 22px/.test(bigTitle.structure.label), bigTitle.structure.label);
    ok('大字标题生成 [size=N]', (() => {
      const t = window.KLSP.structureTags(bigTitle.structure);
      return t && t.open === '[size=5]' && t.close === '[/size]';
    })(), JSON.stringify(window.KLSP.structureTags(bigTitle.structure)));
    ok('输出元素签名', window.KLSP.elementKey(body.querySelector('.demo-title')) === 'div.demo-title',
      window.KLSP.elementKey(body.querySelector('.demo-title')));

    console.log('格式刷：照官方 bbcode.js 的规则识别');
    const k0 = readEl('.k0');
    ok('class 形如 k0 → 认出 [k0]', k0.structure && k0.structure.open === '[k0]',
      JSON.stringify(k0.structure));
    ok('k0 生成闭合标签', window.KLSP.structureTags(k0.structure).close === '[/k0]');
    // 其乐真实标题：h1.KyloStylisedHeader0
    const kylo = readEl('h1.KyloStylisedHeader0');
    ok('KyloStylisedHeader0 → [k0]', kylo.structure && kylo.structure.open === '[k0]',
      JSON.stringify(kylo.structure));
    ok('Kylo 标题标签闭合', window.KLSP.structureTags(kylo.structure).close === '[/k0]');
    ok('Kylo 标题不被当成 [size]', kylo.open.indexOf('[size') === -1, kylo.open);
    ok('Kylo 标题不夹带内层标签（夹了会失效）', kylo.open === '' && kylo.close === '',
      JSON.stringify(kylo.open) + ' | ' + JSON.stringify(kylo.close));
    ok('标记了内层已省略', kylo.kNested === true);
    ok('描述里只有读到的内容，没有多余解释', kylo.desc === '其乐标题 [k0]', kylo.desc);
    console.log('预览：BBCode → HTML（交给其乐 CSS 渲染）');
    const b2h = window.KLSP.bbcodeToHtml;
    ok('[b] → <b>', b2h('[b]x[/b]') === '<b>x</b>', b2h('[b]x[/b]'));
    ok('[size=5] → <font size="5">', b2h('[size=5]x[/size]') === '<font size="5">x</font>', b2h('[size=5]x[/size]'));
    // 真站 CSS 是标签与 N 绑定：h1.KyloStylisedHeader0 / h2.KyloStylisedHeader1 / h3.KyloStylisedHeader2 …
    ok('[k0] → h1.KyloStylisedHeader0', b2h('[k0]x[/k0]') === '<h1 class="KyloStylisedHeader0">x</h1>', b2h('[k0]x[/k0]'));
    ok('[k2] → h3.KyloStylisedHeader2', b2h('[k2]x[/k2]') === '<h3 class="KyloStylisedHeader2">x</h3>', b2h('[k2]x[/k2]'));
    ok('[k1] → h2.KyloStylisedHeader1', b2h('[k1]x[/k1]') === '<h2 class="KyloStylisedHeader1">x</h2>', b2h('[k1]x[/k1]'));
    ok('[k5] → h6.KyloStylisedHeader5', b2h('[k5]x[/k5]') === '<h6 class="KyloStylisedHeader5">x</h6>', b2h('[k5]x[/k5]'));
    ok('[color] → <font color>', b2h('[color=#f00]x[/color]').indexOf('<font color="#f00">') === 0);
    ok('[quote] → div.quote', b2h('[quote]x[/quote]').indexOf('class="quote"') !== -1, b2h('[quote]x[/quote]'));
    ok('[code] → div.blockcode', b2h('[code]x[/code]').indexOf('class="blockcode"') !== -1);
    ok('[collapse=T] → sff_collapse', b2h('[collapse=T]x[/collapse]').indexOf('sff_collapse') !== -1);
    ok('[collapse] 预览默认展开（不带 sff_collapsed）', b2h('[collapse=T]x[/collapse]').indexOf('sff_collapsed') === -1,
      b2h('[collapse=T]x[/collapse]'));
    // 真站 class 是 bbcode_spoiler / bbcode_spoiler_content，内容要可见才看得到
    ok('[spoiler] → bbcode_spoiler + 内容可见', (() => {
      const s = b2h('[spoiler]x[/spoiler]');
      return s.indexOf('bbcode_spoiler_content') !== -1 && s.indexOf('display:inline') !== -1 && s.indexOf('>x<') !== -1;
    })(), b2h('[spoiler]x[/spoiler]'));
    ok('[spoil] → showhide + spoiler（真站结构，内容可见）', (() => {
      const s = b2h('[spoil]x[/spoil]');
      return s.indexOf('showhide') !== -1 && s.indexOf('class="spoiler"') !== -1 &&
        s.indexOf('display:block') !== -1 && s.indexOf('>x<') !== -1;
    })(), b2h('[spoil]x[/spoil]'));
    ok('[hide] → showhide + spoiler（真站结构，内容可见）', (() => {
      const s = b2h('[hide]x[/hide]');
      return s.indexOf('showhide') !== -1 && s.indexOf('class="spoiler"') !== -1 &&
        s.indexOf('display:block') !== -1 && s.indexOf('>x<') !== -1;
    })(), b2h('[hide]x[/hide]'));
    ok('[fly] → marquee', b2h('[fly]x[/fly]') === '<marquee>x</marquee>', b2h('[fly]x[/fly]'));
    ok('组合标签正常', b2h('[size=4][color=#c0392b][b]x[/b][/color][/size]')
      === '<font size="4"><font color="#c0392b"><b>x</b></font></font>',
      b2h('[size=4][color=#c0392b][b]x[/b][/color][/size]'));
    ok('尖括号被转义（不会注入 HTML）', b2h('<img onerror=alert(1)>').indexOf('&lt;img') === 0,
      b2h('<img onerror=alert(1)>'));

    ok('带上了预览用的标签+class（保证预览与真站一致）',
      kylo.structure.probe && kylo.structure.probe.tag === 'h1' && kylo.structure.probe.cls === 'KyloStylisedHeader0',
      JSON.stringify(kylo.structure.probe));
    const ul = readEl('ul');
    ok('ul → [list]', ul.structure && ul.structure.kind === 'list' && ul.structure.ordered === false,
      JSON.stringify(ul.structure));
    ok('列表标签带换行', window.KLSP.structureTags(ul.structure).open === '[list]\n',
      JSON.stringify(window.KLSP.structureTags(ul.structure).open));
    const strike = readEl('.demo-title');
    ok('删除线用官方的 [s]', (() => {
      const range2 = doc.createRange();
      const probe = doc.createElement('span');
      probe.style.textDecoration = 'line-through';
      probe.textContent = 'x';
      body.appendChild(probe);
      range2.selectNodeContents(probe);
      const f = window.KLSP.readFormat(range2);
      probe.remove();
      return f && f.open.indexOf('[s]') !== -1;
    })());

    console.log('格式刷：教会脚本认新元素');
    const taught = body.querySelector('.demo-title');
    window.KLSP.setStyles([]);      // 只留映射，避免干扰
    window.localStorage.setItem('klsp:structMap', JSON.stringify({ 'div.demo-title': { open: '[k0]', close: '[/k0]' } }));
    ok('教过之后同类元素能自动认出',
      (window.KLSP.structureOf(taught) || {}).kind === 'custom',
      JSON.stringify(window.KLSP.structureOf(taught)));
    ok('认出的标签就是教的那个',
      window.KLSP.structureTags(window.KLSP.structureOf(taught)).open === '[k0]');
    window.localStorage.removeItem('klsp:structMap');

    const quoted = readEl('blockquote');
    ok('识别出引用块', quoted.structure && quoted.structure.kind === 'quote', JSON.stringify(quoted.structure));
    ok('引用块生成 [quote]', window.KLSP.structureTags(quoted.structure).open === '[quote]');

    console.log('格式刷：浮标 → 存成样式');
    const sel = window.getSelection();
    sel.removeAllRanges();
    const r = doc.createRange();
    r.selectNodeContents(body.querySelector('font[color]'));
    sel.addRange(r);
    doc.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
    await sleep(40);
    const pick = doc.querySelector('.klsp-pick');
    ok('选中带格式文字后浮标出现', !!pick && pick.style.display !== 'none');

    pick.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const modal = Array.from(doc.querySelectorAll('.klsp-modal')).pop();
    ok('弹出吸取样式弹窗', !!modal && /吸取样式/.test(modal.querySelector('h3').textContent));
    const roleIn = (m, role) => m.querySelector('input[data-role=' + role + ']');
    ok('开始标签已填好', roleIn(modal, 'open').value.indexOf('[color=#c0392b]') !== -1, roleIn(modal, 'open').value);
    roleIn(modal, 'name').value = '吸取的红字';
    roleIn(modal, 'group').value = '吸取';
    const saveBtn = Array.from(modal.querySelectorAll('button')).find(b => b.textContent === '存成样式');
    saveBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const saved = window.KLSP.getStyles();
    ok('存进样式库', saved.length === 1 && saved[0].name === '吸取的红字', JSON.stringify(saved.map(s => s.name)));
    ok('存的是标签对而不是整段文字', saved[0].open === '[color=#c0392b]' && saved[0].close === '[/color]',
      saved[0].open + '|' + saved[0].close);

    console.log('格式刷：只有结构没有文字样式也要能吸');
    sel.removeAllRanges();
    const rc = doc.createRange();
    rc.selectNodeContents(body.querySelector('.sff_collapse_b'));
    sel.addRange(rc);
    doc.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
    await sleep(40);
    ok('折叠块标题也冒浮标', doc.querySelector('.klsp-pick').style.display !== 'none');
    doc.querySelector('.klsp-pick').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const cm = Array.from(doc.querySelectorAll('.klsp-modal')).pop();
    const csel = cm.querySelector('select');
    ok('弹窗自动选中折叠块', !!csel && csel.value === 'collapse', csel && csel.value);
    const cOpen = cm.querySelector('input[data-role=open]');
    const cClose = cm.querySelector('input[data-role=close]');
    ok('开始标签带 [collapse=标题]', cOpen.value.indexOf('[collapse=大型限时福利的具体定义]') === 0, cOpen.value);
    ok('结束标签闭合折叠块', cClose.value.indexOf('[/collapse]') !== -1, cClose.value);
    csel.value = '';
    csel.dispatchEvent(new window.Event('change', { bubbles: true }));
    ok('下拉改回「无」后去掉折叠标签', cOpen.value.indexOf('[collapse') === -1, cOpen.value);
    ok('代码相关的输入框默认藏在「高级」里',
      !!cm.querySelector('.klsp-advtoggle') &&
      cm.querySelector('.klsp-advbody').style.display === 'none');
    clickIn(findBtn(cm, '取消'));

    console.log('格式刷：普通文字不打扰');
    sel.removeAllRanges();
    const r2 = doc.createRange();
    r2.selectNodeContents(body.querySelector('.plain-sample'));
    sel.addRange(r2);
    doc.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
    await sleep(40);
    ok('无格式文字不弹浮标', doc.querySelector('.klsp-pick').style.display === 'none');

    // 读取脚本写在 localStorage 里的键（脚本无 GM 环境时走 localStorage 通道）
    const store_get = (k) => {
      const raw = window.localStorage.getItem('klsp:' + k);
      return raw === null ? null : JSON.parse(raw);
    };

    console.log('吸管：图标化 / 跟随选区 / 拖动不误触 / 拖动后不固定');
    const pk = doc.querySelector('.klsp-pick');
    ok('吸管是图标而不是文字', !!pk.querySelector('svg') && pk.textContent.trim() === '',
      'text=' + JSON.stringify(pk.textContent));
    ok('吸管有可访问名称', pk.getAttribute('aria-label') === '吸取样式');
    ok('吸管提示里说明可拖动', /拖动/.test(pk.title), pk.title);
    ok('不再有「钉住」这套概念', !pk.classList.contains('klsp-pinned'));

    // 重新选中一段带格式文字，把吸管唤出来
    sel.removeAllRanges();
    const r3 = doc.createRange();
    r3.selectNodeContents(body.querySelector('font[color]'));
    sel.addRange(r3);
    doc.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
    await sleep(40);
    ok('重选后吸管再次出现', pk.style.display !== 'none');

    // 默认跟随选区：位置应被夹在视口内（jsdom 宽高为 0，故应夹到左上角附近）
    const l0 = parseFloat(pk.style.left) || 0;
    const t0 = parseFloat(pk.style.top) || 0;
    ok('默认位置夹在视口内', l0 >= 0 && t0 >= 0, l0 + ',' + t0);

    const md = (x, y) => new window.MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y });
    const mm = (x, y) => new window.MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y });
    const mu = () => doc.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));

    console.log('吸管：拖一下记住的是「相对选区的偏移」');
    pk.dispatchEvent(md(300, 300));
    doc.dispatchEvent(mm(280, 290));   // 位移 -20,-10
    mu();
    ok('拖完没有被「固定」成绿色态', !pk.classList.contains('klsp-pinned'));
    const savedOff = store_get('pickOff');
    // 默认偏移 6,6；本次位移 -20,-10 → 新偏移 -14,-4
    ok('拖动后记住的是偏移（不是绝对坐标）',
      !!savedOff && savedOff.dx === -14 && savedOff.dy === -4,
      JSON.stringify(savedOff));
    ok('不再往存储里写绝对坐标', store_get('pickPos') === null);

    console.log('吸管：拖拽松手不该弹出吸取窗（核心修复）');
    ok('拖后紧接着的 click 被吞掉', (() => {
      pk.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      return !Array.from(doc.querySelectorAll('.klsp-modal')).some(m => m.style.display !== 'none');
    })());

    console.log('吸管：换一段文字 → 吸管仍跟着新选区走（核心修复）');
    sel.removeAllRanges();
    const r4 = doc.createRange();
    r4.selectNodeContents(body.querySelector('font[color]'));
    sel.addRange(r4);
    doc.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    doc.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
    await sleep(40);
    // jsdom 无布局，rect 全 0 → 位置 = 0 + 偏移(-14,-4) 夹到视口内 = 2,2
    ok('用的是偏移后的位置（0+(-14)夹到 2）',
      (parseFloat(pk.style.left) === 2 && parseFloat(pk.style.top) === 2),
      pk.style.left + ',' + pk.style.top);

    console.log('吸管：双击回到默认偏移');
    pk.style.display = 'flex';
    pk.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
    await sleep(40);
    ok('双击后自定义偏移被清空',
      window.KLSP.pickOffset() === null, JSON.stringify(window.KLSP.pickOffset()));
    ok('恢复后回到默认偏移（6,6）',
      (parseFloat(pk.style.left) === 6 && parseFloat(pk.style.top) === 6),
      pk.style.left + ',' + pk.style.top);

    console.log('吸管：滚动页面时隐藏，等下次选中再定位');
    pk.style.display = 'flex';
    doc.dispatchEvent(new window.Event('scroll', { bubbles: true }));
    ok('滚动后吸管隐藏', pk.style.display === 'none');

    console.log('吸管：点一下仍然正常弹吸取窗');
    await sleep(320);   // 等「吞掉一次 click」的标记过期，模拟真实的再次点击
    pk.style.display = 'flex';
    pk.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    ok('点击弹出吸取样式弹窗', Array.from(doc.querySelectorAll('.klsp-modal'))
      .some(m => m.style.display !== 'none' && /吸取样式/.test(m.textContent)));
  }

  /* ============ 场景二：发帖页 ============ */
  const dom = await makeDom(POST_URL);
  const { window } = dom;
  const doc = window.document;
  const ta = doc.getElementById('e');
  const LS = window.localStorage;

  const click = (sel) => {
    const el = typeof sel === 'string' ? doc.querySelector(sel) : sel;
    if (!el) throw new Error('找不到元素: ' + sel);
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    return el;
  };
  const setSel = (s, e) => { ta.focus(); ta.setSelectionRange(s, e === undefined ? s : e); };
  const reset = (v) => { ta.value = v; setSel(0, 0); };
  const writeStyles = (list) => { LS.setItem('klsp:styles', JSON.stringify(list)); window.KLSP.rebuild(); };
  const items = () => Array.from(doc.querySelectorAll('#klsp-panel .klsp-item'));
  const lastModal = () => Array.from(doc.querySelectorAll('.klsp-modal')).pop();
  const btnByText = (root, text) => Array.from(root.querySelectorAll('button')).find(b => b.textContent === text);

  console.log('发帖页：注入与零预设');
  ok('URL 判定为发帖页', window.KLSP.isPostPage() === true);
  ok('面板已注入', !!doc.getElementById('klsp-panel'));
  ok('默认没有任何预设样式', window.KLSP.getStyles().length === 0);
  ok('空状态有引导文案', /还没有样式/.test(doc.querySelector('#klsp-panel .klsp-empty').textContent));

  console.log('自定义样式：渲染 / 套用');
  writeStyles([
    { id: 'a1', group: '标题', name: '大标题', open: '[size=5][b]', close: '[/b][/size]', block: true, hotkey: 'alt+1', preview: { bold: true } },
    { id: 'a2', group: '强调', name: '加粗', open: '[b]', close: '[/b]', preview: { bold: true } },
    { id: 'a3', group: '工具', name: '清除格式', action: 'clear' }
  ]);
  ok('按自定义渲染出 3 个按钮', items().length === 3, items().length);
  ok('分组标题按定义显示',
    Array.from(doc.querySelectorAll('#klsp-panel .klsp-gtitle')).map(n => n.textContent).join('/') === '标题/强调/工具');
  ok('快捷键角标显示', !!doc.querySelector('#klsp-panel .klsp-hk'));

  reset('Hello');
  setSel(0, 5);
  click('#klsp-panel .klsp-item[data-id=a2]');
  ok('行内样式包裹选中文本', ta.value === '[b]Hello[/b]', ta.value);
  ok('包裹后仍保持选中', ta.selectionStart === 0 && ta.selectionEnd === 12, ta.selectionStart + '-' + ta.selectionEnd);

  reset('');
  setSel(0, 0);
  click('#klsp-panel .klsp-item[data-id=a2]');
  ok('未选中时插入空标签', ta.value === '[b][/b]', ta.value);

  reset('我的标题');
  setSel(2, 2);
  click('#klsp-panel .klsp-item[data-id=a1]');
  ok('块级样式整行套用', ta.value === '[size=5][b]我的标题[/b][/size]', ta.value);

  reset('看看[b]标签[/b]还在不在');
  setSel(0, ta.value.length);
  click('#klsp-panel .klsp-item[data-id=a3]');
  ok('清除格式去掉 BBCode', ta.value === '看看标签还在不在', ta.value);

  console.log('快捷键');
  reset('快捷键测试');
  setSel(0, 5);
  doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: '1', altKey: true, bubbles: true, cancelable: true }));
  ok('alt+1 触发对应样式', ta.value === '[size=5][b]快捷键测试[/b][/size]', ta.value);

  console.log('拖拽排序：拖动按钮换顺序');
  {
    // 当前顺序：大标题 / 加粗 / 清除格式
    writeStyles([
      { id: 'd1', group: 'G1', name: '一号', open: '[b]', close: '[/b]' },
      { id: 'd2', group: 'G1', name: '二号', open: '[i]', close: '[/i]' },
      { id: 'd3', group: 'G2', name: '三号', open: '[u]', close: '[/u]' }
    ]);
    ok('初始顺序 d1,d2,d3', window.KLSP.getStyles().map(s => s.id).join(',') === 'd1,d2,d3');

    const it = doc.querySelector('#klsp-panel .klsp-item[data-id=d3]');
    const dmd = (x, y) => new window.MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y });
    const dmm = (x, y) => new window.MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y });
    // jsdom 里所有元素 rect 都是 0，落点判定必然落在「第一个元素的中线上方」
    // → 等价于「插到最前」，用它验证排序链路是通的
    it.dispatchEvent(dmd(10, 10));
    doc.dispatchEvent(dmm(10, 12));
    doc.dispatchEvent(dmm(12, 40));
    doc.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true, clientX: 12, clientY: 40 }));
    const afterIds = window.KLSP.getStyles().map(s => s.id).join(',');
    ok('拖动后顺序发生变化', afterIds !== 'd1,d2,d3', afterIds);
    ok('没有丢样式、也没有复制', afterIds.split(',').sort().join(',') === 'd1,d2,d3', afterIds);
    ok('拖动后落点有蓝线样式表', /klsp-drop-line/.test(
      fs.readFileSync(path.resolve(__dirname, '..', 'Keylol样式面板.user.js'), 'utf8')));

    // 拖动收尾那次 click 不该当成「套用样式」
    reset('不该被动');
    setSel(0, 4);
    doc.querySelector('#klsp-panel .klsp-item[data-id=d3]')
      .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    ok('拖动后紧接着的 click 不套用样式', ta.value === '不该被动', ta.value);
    window.KLSP.clearPickOffset();
  }

  console.log('新建样式：粘贴代码自动识别');
  {
    click(doc.querySelector('#klsp-panel .klsp-foot button:nth-child(1)'));   // + 新建样式
    const form = lastModal();
    const paste = form.querySelector('textarea');
    ok('表单里有粘贴代码的输入框', !!paste);

    paste.value = '[size=4][color=#c0392b]红色警告[/color][/size]';
    click(btnByText(form, '识别为样式'));
    const texts = Array.from(form.querySelectorAll('input[type=text]'));
    const openV = texts.find(i => /\[size=4\]/.test(i.value));
    const closeV = texts.find(i => /\[\/size\]/.test(i.value));
    ok('开始标签拆出来了', !!openV && openV.value === '[size=4][color=#c0392b]', openV && openV.value);
    ok('结束标签拆出来了', !!closeV && closeV.value === '[/color][/size]', closeV && closeV.value);
    ok('识别后自动建议了名字', texts.some(i => /size 样式|标题/.test(i.value)), texts.map(i => i.value).join('|'));
    ok('预览用了代码里的真实文字', /红色警告/.test(form.querySelector('.klsp-pvbox').textContent),
      form.querySelector('.klsp-pvbox').textContent);

    // 识别之后仍可手动改
    openV.value = '[color=#2f6fb5]';
    openV.dispatchEvent(new window.Event('input', { bubbles: true }));
    ok('识别后仍能手动改标签', openV.value === '[color=#2f6fb5]');

    click(btnByText(form, '取消'));
  }

  console.log('新建样式：粘贴只带开始标签的残缺代码也能识别');
  {
    click(doc.querySelector('#klsp-panel .klsp-foot button:nth-child(1)'));
    const form = lastModal();
    form.querySelector('textarea').value = '[quote]';
    click(btnByText(form, '识别为样式'));
    const texts = Array.from(form.querySelectorAll('input[type=text]'));
    ok('残缺代码当作开始标签', texts.some(i => i.value === '[quote]'), texts.map(i => i.value).join('|'));
    click(btnByText(form, '取消'));
  }

  console.log('新建样式：带数字的标签（[k2]）也要能识别');
  {
    click(doc.querySelector('#klsp-panel .klsp-foot button:nth-child(1)'));
    const form = lastModal();
    form.querySelector('textarea').value = '[k2]坏神4[/k2]';
    click(btnByText(form, '识别为样式'));
    const texts = Array.from(form.querySelectorAll('input[type=text]'));
    ok('开始标签 = [k2]（不是整段代码）', texts.some(i => i.value === '[k2]'), texts.map(i => i.value).join('|'));
    ok('结束标签 = [/k2]', texts.some(i => i.value === '[/k2]'), texts.map(i => i.value).join('|'));
    ok('没有混入上一个样式的标签', !texts.some(i => /color|size/.test(i.value)), texts.map(i => i.value).join('|'));
    click(btnByText(form, '取消'));
  }

  console.log('新建样式：嵌套标签拆分顺序（内层先闭合）');
  {
    click(doc.querySelector('#klsp-panel .klsp-foot button:nth-child(1)'));
    const form = lastModal();
    form.querySelector('textarea').value = '[size=4][color=#c0392b]红色警告[/color][/size]';
    click(btnByText(form, '识别为样式'));
    const texts = Array.from(form.querySelectorAll('input[type=text]'));
    const openV = texts.find(i => /^\[size=4\]\[color/.test(i.value));
    const closeV = texts.find(i => /\[\/color\]\[\/size\]/.test(i.value));
    ok('开始标签由外到内', !!openV, texts.map(i => i.value).join('|'));
    ok('结束标签由内到外（[/color] 在前）', !!closeV,
      (texts.find(i => /\[\/size\]/.test(i.value)) || {}).value);
    click(btnByText(form, '取消'));
  }

  console.log('标签同步：改开始标签，结束标签要跟着改（新建表单）');
  {
    click(doc.querySelector('#klsp-panel .klsp-foot button:nth-child(1)'));
    const form = lastModal();
    const texts = () => Array.from(form.querySelectorAll('input[type=text]'));
    const openI = texts().find(i => i.dataset.role === 'open');
    const closeI = texts().find(i => i.dataset.role === 'close');
    ok('找到开始/结束标签输入框', !!openI && !!closeI);

    // 模拟用户：开始 [k1]、结束还是 [/k2]，改开始标签后结束标签应自动跟到 [/k1]
    openI.value = '[k1]';
    closeI.value = '[/k2]';
    openI.dispatchEvent(new window.Event('input', { bubbles: true }));
    ok('开始改 k1 → 结束自动变 [/k1]', closeI.value === '[/k1]', closeI.value);

    // 多层标签改组名，按倒序配（结束标签内层先闭）
    openI.value = '[size=6][color=#c0392b]';
    closeI.value = '[/color][/size]';
    openI.dispatchEvent(new window.Event('input', { bubbles: true }));
    ok('多层标签本来就对 → 保持 [/color][/size]', closeI.value === '[/color][/size]', closeI.value);

    openI.value = '[k2][color=#333]';
    closeI.value = '[/color][/k1]';
    openI.dispatchEvent(new window.Event('input', { bubbles: true }));
    ok('多层标签名字错 → 修正为 [/color][/k2]', closeI.value === '[/color][/k2]', closeI.value);

    click(btnByText(form, '取消'));
  }

  console.log('标签同步：syncClose 单元行为');
  {
    const S = window.KLSP.syncClose;
    ok('导出可测', typeof S === 'function');
    ok('单个标签：k1 配 k2 → 改 k1', S('[k1]', '[/k2]') === '[/k1]');
    ok('数量不符 → 整段重写', S('[k1]', '[/k2][/b]') === '[/k1]');
    ok('结束标签为空 → 补齐', S('[b][i]', '') === '[/i][/b]');
    ok('开始标签为空 → 不动结束标签', S('', '[/k1]') === '[/k1]');
    ok('三层嵌套倒序配', S('[b][i][u]', '[/u][/i][/b]') === '[/u][/i][/b]');
  }

  console.log('设置：真实渲染总开关');
  {
    click(btnByText(doc.getElementById('klsp-panel'), '⚙')
      || doc.querySelector('#klsp-panel .klsp-head button:nth-child(1)'));
    let sbox = null;
    for (const m of doc.querySelectorAll('.klsp-mask')) {
      if (/样式助手设置/.test(m.textContent)) sbox = m.querySelector('.klsp-modal');
    }
    ok('设置里有「真实渲染」总开关', !!sbox && /真实渲染/.test(sbox.textContent));
    const cb = sbox ? Array.from(sbox.querySelectorAll('input[type=checkbox]'))
      .find(c => /真实渲染/.test(c.parentNode.textContent)) : null;
    ok('真实渲染默认开启', !!cb && cb.checked);

    if (cb) {
      const readReal = () => {
        const raw = window.localStorage.getItem('klsp:realRender');
        return raw === null ? null : JSON.parse(raw);
      };
      cb.checked = false;
      cb.dispatchEvent(new window.Event('change', { bubbles: true }));
      ok('关掉后写入存储', readReal() === false, String(readReal()));
      const pv = doc.querySelector('#klsp-panel .klsp-item .klsp-pv');
      ok('面板按钮退回模拟外观（不再带 klsp-real）',
        !!pv && !pv.classList.contains('klsp-real'), pv ? pv.className : '(无)');
      cb.checked = true;
      cb.dispatchEvent(new window.Event('change', { bubbles: true }));
      ok('重新打开 → 存储为 true', readReal() === true, String(readReal()));
    }
    const closeBtn = sbox ? Array.from(sbox.querySelectorAll('button')).find(b => /取消|关闭/.test(b.textContent)) : null;
    if (closeBtn) click(closeBtn);
    else doc.querySelectorAll('.klsp-mask').forEach(m => m.remove());
  }

  console.log('样式管理：新建 / 上移 / 删除');
  click(doc.querySelector('#klsp-panel .klsp-foot button:nth-child(2)'));
  ok('管理弹窗列出 3 条', lastModal().querySelectorAll('.klsp-list-item').length === 3);

  click(btnByText(lastModal(), '新建样式'));
  const form = lastModal();
  const inputs = Array.from(form.querySelectorAll('input[type=text]'));
  inputs[0].value = '测试组'; inputs[1].value = '紫色'; inputs[2].value = '[color=#8e44ad]'; inputs[3].value = '[/color]';
  click(btnByText(form, '保存'));
  ok('表单保存后样式数 +1', window.KLSP.getStyles().length === 4, window.KLSP.getStyles().length);
  ok('新样式出现在面板', items().length === 4);
  ok('新分组名生效', Array.from(doc.querySelectorAll('#klsp-panel .klsp-gtitle')).some(n => n.textContent === '测试组'));

  click(doc.querySelector('#klsp-panel .klsp-foot button:nth-child(2)'));
  const beforeOrder = window.KLSP.getStyles().map(s => s.id).join(',');
  click(lastModal().querySelectorAll('.klsp-list-item')[1].querySelector('button[title="上移"]'));
  ok('上移改变了顺序', window.KLSP.getStyles().map(s => s.id).join(',') !== beforeOrder,
    beforeOrder + ' → ' + window.KLSP.getStyles().map(s => s.id).join(','));

  click(lastModal().querySelectorAll('.klsp-list-item')[0].querySelector('button[title="删除这条样式"]'));
  ok('删除后样式数 -1', window.KLSP.getStyles().length === 3, window.KLSP.getStyles().length);

  console.log('效果预览（所见即所得）');
  const colorish = (v, hex) => {
    const s = String(v || '');
    if (s.toLowerCase().indexOf(hex.toLowerCase()) !== -1) return true;
    const m = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!m) return false;
    const n = parseInt(m[1], 16);
    const rgb = 'rgb(' + ((n >> 16) & 255) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255) + ')';
    return s.indexOf(rgb) !== -1;
  };
  ok('从标签解析字号', window.KLSP.previewFromTags('[size=5][b]').size === '16px',
    window.KLSP.previewFromTags('[size=5][b]').size);
  ok('从标签解析颜色', colorish(window.KLSP.previewFromTags('[color=#c0392b]').color, '#c0392b'));
  ok('命名色也能解析', colorish(window.KLSP.previewFromTags('[color=red]').color, '#ff0000') ||
    window.KLSP.previewFromTags('[color=red]').color !== '', window.KLSP.previewFromTags('[color=red]').color);
  ok('解析背景色与粗体', (() => {
    const p = window.KLSP.previewFromTags('[backcolor=#ffe58f][b]');
    return colorish(p.bg, '#ffe58f') && p.bold === true;
  })());
  ok('解析下划线与居中', (() => {
    const p = window.KLSP.previewFromTags('[u][align=center]');
    return p.underline === true && p.align === 'center';
  })());
  ok('手填覆盖标签', colorish(window.KLSP.mergedPreview({ open: '[color=#c0392b]', preview: { color: '#2980b9' } }).color, '#2980b9'));
  ok('手填留空不覆盖标签', colorish(window.KLSP.mergedPreview({ open: '[color=#c0392b]', preview: { color: '' } }).color, '#c0392b'));
  ok('亮度计算正确', window.KLSP.luminance('#ffffff') === 1 && window.KLSP.luminance('#000000') === 0);

  writeStyles([
    { id: 'v1', group: '预览', name: '红字标题', open: '[size=5][color=#c0392b][b]', close: '[/b][/color][/size]', preview: {}, realRender: false },
    { id: 'v2', group: '预览', name: '高亮条', open: '[backcolor=#ffe58f]', close: '[/backcolor]', preview: {}, realRender: false },
    { id: 'v3', group: '预览', name: '浅色字', open: '[color=#ffffff]', close: '[/color]', preview: {}, realRender: false }
  ]);
  const btnOf = (id) => doc.querySelector('#klsp-panel .klsp-item[data-id=' + id + ']');
  const pvOf = (id) => btnOf(id).querySelector('.klsp-pv');
  ok('关掉真实渲染时，按钮按标签反推出模拟外观',
    pvOf('v1').style.fontSize === '16px' && pvOf('v1').style.fontWeight === '700' && colorish(pvOf('v1').style.color, '#c0392b'),
    pvOf('v1').style.cssText);
  ok('带背景色的样式按钮自身铺底色', colorish(btnOf('v2').style.background, '#ffe58f'), btnOf('v2').style.background);
  ok('面板底色上看不清的颜色改用色块', !!btnOf('v3').querySelector('.klsp-dot'), btnOf('v3').innerHTML);
  ok('看得清的颜色不加色块', !btnOf('v1').querySelector('.klsp-dot'));

  console.log('面板按钮：默认真实渲染');
  writeStyles([
    { id: 'r1', group: 'R', name: '红字', open: '[color=#c0392b]', close: '[/color]' },
    { id: 'r2', group: 'R', name: '坏神4', open: '[k2]', close: '[/k2]' }
  ]);
  ok('默认走真实渲染（.klsp-pv 带 klsp-real）',
    btnOf('r1').querySelector('.klsp-pv').classList.contains('klsp-real'));
  ok('真实渲染的按钮名用其乐 CSS（转成 font color 标签）',
    /<font color="#c0392b">红字<\/font>/.test(btnOf('r1').querySelector('.klsp-pv').innerHTML),
    btnOf('r1').querySelector('.klsp-pv').innerHTML);

  console.log('面板按钮：抽站点规则内联（带祖先限定的 CSS 也能命中）');
  {
    // demo 里有一条 .t_f h3.KyloStylisedHeader2 的规则 —— 预览框不在 .t_f 正文里，
    // 只有「抽规则内联」才能让它生效
    const h3 = btnOf('r2').querySelector('h3.KyloStylisedHeader2');
    ok('真实渲染造出了 h3.KyloStylisedHeader2', !!h3,
      btnOf('r2').querySelector('.klsp-pv').innerHTML);
    ok('命中站点规则并内联（字号/红色/下边框）',
      !!h3 && h3.style.fontSize === '20px' && colorish(h3.style.color, '#c0392b') &&
      /2px solid/.test(h3.style.borderBottom),
      h3 ? h3.getAttribute('style') : '(无元素)');
  }

  console.log('内置站点样式：发帖页不加载 KyloStylisedHeader* 的 CSS，脚本必须自带');
  {
    // 真站的标题样式只在 style_7_forum_viewthread.css 里，发帖页（mod=post）根本不引它。
    // 所以脚本内置了一份种子，注入到面板按钮 / 预览框的作用域里。
    const st = doc.getElementById('klsp-sitecss-panel');
    ok('面板注入了站点样式表', !!st);
    const txt = st ? st.textContent : '';
    ok('含六档标题规则', /KyloStylisedHeader0/.test(txt) && /KyloStylisedHeader5/.test(txt));
    ok('带上真站的 h1 规则（双横线 + 翅膀图标）',
      /h1\.KyloStylisedHeader0/.test(txt) && /double/.test(txt));
    ok('选择器加了作用域前缀，没污染全站',
      /\.klsp-pv\.klsp-real h3\.KyloStylisedHeader2/.test(txt) &&
      !/(^|\})\s*h3\.KyloStylisedHeader2\s*\{/.test(txt),
      txt.slice(0, 120));
    ok('自带引用/代码/剧透结构样式',
      /blockcode/.test(txt) && /bbcode_spoiler/.test(txt));
  }

  click(doc.querySelector('#klsp-panel .klsp-foot button:nth-child(1)'));
  const formBox = lastModal();
  ok('新建表单里有预览框', !!formBox.querySelector('.klsp-pvbox'));
  const fIns = Array.from(formBox.querySelectorAll('input[type=text]'));
  fIns[1].value = '蓝色大字';
  fIns[2].value = '[size=6][color=#c0392b]';
  fIns[2].dispatchEvent(new window.Event('input', { bubbles: true }));
  const pvHtml = formBox.querySelector('.klsp-pvbox').innerHTML;
  ok('预览随输入实时更新（转成 HTML 交给其乐 CSS）',
    pvHtml.indexOf('size="6"') !== -1 && pvHtml.indexOf('#c0392b') !== -1, pvHtml);
  ok('预览用示例文字渲染真实效果（而不是样式名）',
    /预览文字/.test(pvHtml) && !/蓝色大字/.test(pvHtml), pvHtml);

  ok('新建表单：预览框有独立作用域 id', /^klsp-pv-/.test(formBox.querySelector('.klsp-pvbox').id),
    formBox.querySelector('.klsp-pvbox').id);
  ok('新建表单：预览框注入了站点样式',
    !!doc.querySelector('style[data-klsp-sitecss="' + formBox.querySelector('.klsp-pvbox').id + '"]'));

  console.log('新建表单：已去掉「从选中吸取」与「按钮外观」');
  ok('没有「从选中文字吸取」按钮', !btnByText(formBox, '从选中文字吸取'));
  ok('没有「按钮外观」这块', !/按钮外观/.test(formBox.textContent), formBox.textContent.slice(0, 200));
  ok('有「真实渲染预览」开关', /真实渲染预览/.test(formBox.textContent));

  console.log('新建表单：真实渲染开关切换');
  {
    const realCb = Array.from(formBox.querySelectorAll('input[type=checkbox]'))
      .find(c => /真实渲染/.test(c.parentNode.textContent));
    ok('真实渲染默认开启', !!realCb && realCb.checked);
    ok('真实渲染时不加「模拟外观」的内联样式',
      !/<font[^>]*style=/.test(formBox.querySelector('.klsp-pvbox').innerHTML),
      formBox.querySelector('.klsp-pvbox').innerHTML);

    realCb.checked = false;
    realCb.dispatchEvent(new window.Event('change', { bubbles: true }));
    ok('关掉真实渲染后，预览转为模拟外观（会加内联样式）',
      formBox.querySelector('.klsp-pvbox').innerHTML.indexOf('font-size') !== -1 ||
      formBox.querySelector('.klsp-pvbox').innerHTML.indexOf('color:') !== -1,
      formBox.querySelector('.klsp-pvbox').innerHTML);
    ok('关掉真实渲染时不留「取不到规则」提示',
      !formBox.querySelector('.klsp-pvbox .klsp-nocss'));

    realCb.checked = true;
    realCb.dispatchEvent(new window.Event('change', { bubbles: true }));
  }
  click(btnByText(formBox, '取消'));

  console.log('设置：管理已记住的元素');
  window.localStorage.setItem('klsp:structMap', JSON.stringify({ 'div.k0': { open: '[k0]', close: '[/k0]' } }));
  click(doc.querySelector('#klsp-panel .klsp-icobtn[title=设置]'));
  ok('设置里列出已记住的元素', /已记住的元素（1）/.test(lastModal().textContent),
    lastModal().textContent.replace(/\s+/g, ' ').slice(0, 90));
  click(Array.from(lastModal().querySelectorAll('button')).find(b => b.textContent === '删除'));
  ok('删掉后映射清空', Object.keys(window.KLSP.getStructMap()).length === 0);
  window.localStorage.removeItem('klsp:structMap');

  console.log('设置与诊断');
  writeStyles([]);
  ok('清空后回到空状态', !!doc.querySelector('#klsp-panel .klsp-empty'));
  click(doc.querySelector('#klsp-panel .klsp-icobtn[title=设置]'));
  click(btnByText(lastModal(), '诊断信息'));
  const diagText = lastModal().querySelector('textarea').value;
  ok('诊断输出含 isPostPage', /"isPostPage": true/.test(diagText), diagText.slice(0, 60));
  ok('诊断识别出 demo 的 textarea', /"textareaId": "e"/.test(diagText));

  console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试异常:', e); process.exit(1); });
