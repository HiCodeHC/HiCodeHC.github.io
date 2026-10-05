/* bro 前端逻辑
 * ---------------------------------------------------------------------------
 * 页面本身不做任何跨域请求，所有“静默访问目标站点”的动作都交给运行在本机的服务，
 * 前端只与本机服务通信。这样即使浏览器限制了直接访问目标站点，本机服务仍可访问。
 */
(() => {
  'use strict';

  const DEFAULT_BASE = 'http://127.0.0.1:8787';

  /* ----------------------------- 基础工具 ----------------------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    (Array.isArray(children) ? children : [children]).forEach((c) => c && node.appendChild(c));
    return node;
  }

  // 本机服务地址：由本机服务托管时用同源地址，否则用默认/已保存的地址
  function resolveBase() {
    const saved = localStorage.getItem('bro.base');
    if (saved) return saved.replace(/\/$/, '');
    const { origin, protocol } = location;
    if (protocol.startsWith('http') && /(127\.0\.0\.1|localhost)/.test(origin)) return origin;
    return DEFAULT_BASE;
  }
  let BASE = resolveBase();

  async function api(path, options = {}) {
    const res = await fetch(BASE + path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`);
    return data;
  }

  async function ping() {
    const dot = $('#connDot');
    const text = $('#connText');
    try {
      await api('/api/health', { method: 'GET' });
      dot.classList.add('on');
      dot.classList.remove('off');
      text.textContent = '已连接本机服务';
      return true;
    } catch {
      dot.classList.add('off');
      dot.classList.remove('on');
      text.textContent = '未连接本机服务';
      return false;
    }
  }

  /* ------------------------------- 视图切换 ------------------------------- */
  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach((t) => t.classList.toggle('active', t === tab));
      const view = tab.dataset.view;
      $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
      if (view === 'kimi' || view === 'deepseek') AI[view].onEnter();
    });
  });

  /* ------------------------------- 设置弹层 ------------------------------- */
  $('#settingsBtn').addEventListener('click', () => {
    $('#baseInput').value = BASE;
    $('#settingsModal').classList.remove('hidden');
  });
  $('#baseCancel').addEventListener('click', () => $('#settingsModal').classList.add('hidden'));
  $('#baseSave').addEventListener('click', async () => {
    BASE = ($('#baseInput').value || DEFAULT_BASE).trim().replace(/\/$/, '');
    localStorage.setItem('bro.base', BASE);
    $('#settingsModal').classList.add('hidden');
    await ping();
    loadEngines();
  });

  /* ------------------------------- 搜索引擎 ------------------------------- */
  const FALLBACK_ENGINES = [
    { id: 'bing', label: 'Bing', supportsWeb: true, supportsImage: true },
    { id: 'baidu', label: '百度', supportsWeb: true, supportsImage: true },
    { id: 'sogou', label: '搜狗', supportsWeb: true, supportsImage: false },
    { id: 'google', label: 'Google', supportsWeb: true, supportsImage: false },
    { id: 'duckduckgo', label: 'DuckDuckGo', supportsWeb: true, supportsImage: false },
  ];
  let engines = FALLBACK_ENGINES;
  let engine = localStorage.getItem('bro.engine') || 'bing';
  let mode = localStorage.getItem('bro.mode') || 'web';

  const engineIconUrl = (id) => {
    const hosts = { bing: 'bing.com', baidu: 'baidu.com', sogou: 'sogou.com', google: 'google.com', duckduckgo: 'duckduckgo.com' };
    return hosts[id] ? `https://${hosts[id]}/favicon.ico` : '';
  };

  async function loadEngines() {
    try {
      const data = await api('/api/engines');
      if (data.engines?.length) engines = data.engines;
    } catch {
      engines = FALLBACK_ENGINES;
    }
    renderEngineMenu();
    renderEngineButton();
  }

  function currentEngine() {
    return engines.find((e) => e.id === engine) || engines[0];
  }

  function renderEngineButton() {
    const e = currentEngine();
    $('#engineLabel').textContent = e?.label || engine;
    const icon = $('#engineIcon');
    icon.src = engineIconUrl(e?.id);
    icon.onerror = () => { icon.style.visibility = 'hidden'; };
  }

  function renderEngineMenu() {
    const menu = $('#engineMenu');
    menu.innerHTML = '';
    engines.forEach((e) => {
      const disabled = mode === 'image' && !e.supportsImage;
      menu.appendChild(
        el('button', {
          class: `engine-item${e.id === engine ? ' active' : ''}`,
          type: 'button',
          disabled: disabled ? 'disabled' : null,
          onclick: () => {
            if (disabled) return;
            engine = e.id;
            localStorage.setItem('bro.engine', engine);
            renderEngineButton();
            renderEngineMenu();
            $('#engineMenu').classList.remove('open');
          },
        }, [
          el('span', { text: e.label }),
          disabled ? el('span', { class: 'muted', text: '（不支持图片）' }) : null,
        ])
      );
    });
  }

  $('#engineBtn').addEventListener('click', (ev) => {
    ev.stopPropagation();
    $('#engineMenu').classList.toggle('open');
  });
  document.addEventListener('click', () => $('#engineMenu').classList.remove('open'));

  $$('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      mode = btn.dataset.mode;
      localStorage.setItem('bro.mode', mode);
      $$('.mode-btn').forEach((b) => b.classList.toggle('active', b === btn));
      if (mode === 'image' && !currentEngine()?.supportsImage) {
        const first = engines.find((e) => e.supportsImage);
        if (first) { engine = first.id; localStorage.setItem('bro.engine', engine); }
      }
      renderEngineButton();
      renderEngineMenu();
    });
  });

  /* ------------------------------- 收藏夹 ------------------------------- */
  // 说明：使用 localStorage 保存（比 cookie 容量更大、不会随请求自动发送）；本质同样是“保存在本地”。
  const FAV_KEY = 'bro.favorites';
  const loadFavs = () => { try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch { return []; } };
  const saveFavs = (list) => localStorage.setItem(FAV_KEY, JSON.stringify(list));

  function favGrid() {
    let box = $('#favs');
    if (!box) {
      box = el('div', { class: 'favs', id: 'favs' }, [
        el('div', { class: 'favs-head' }, [el('h2', { text: '收藏夹' })]),
        el('div', { class: 'fav-grid', id: 'favGrid' }),
      ]);
      $('#view-search').appendChild(box);
    }
    return $('#favGrid');
  }

  function renderFavs() {
    const grid = favGrid();
    grid.innerHTML = '';
    loadFavs().forEach((fav, idx) => {
      const host = (() => { try { return new URL(fav.url).host; } catch { return ''; } })();
      const letter = el('span', { class: 'letter', text: (fav.name || host || '?')[0].toUpperCase() });
      const img = host ? el('img', { src: `https://${host}/favicon.ico`, alt: '' }) : null;
      if (img) img.onerror = () => { img.remove(); };
      const node = el('a', { class: 'fav', href: fav.url, target: '_blank', rel: 'noopener' }, [
        ...(img ? [img] : []), letter,
        el('span', { class: 'name', text: fav.name || host || fav.url }),
        el('button', {
          class: 'del', type: 'button', text: '×', title: '删除',
          onclick: (ev) => { ev.preventDefault(); ev.stopPropagation(); const l = loadFavs(); l.splice(idx, 1); saveFavs(l); renderFavs(); },
        }),
      ]);
      grid.appendChild(node);
    });
    grid.appendChild(
      el('button', { class: 'fav add', type: 'button', onclick: addFav }, [
        el('span', { class: 'letter', text: '+' }),
        el('span', { class: 'name', text: '添加收藏' }),
      ])
    );
  }

  function addFav() {
    const url = prompt('网址（如 https://example.com）');
    if (!url) return;
    const name = prompt('名称', (() => { try { return new URL(url).host; } catch { return url; } })()) || url;
    const list = loadFavs();
    list.push({ name: name.trim(), url: url.trim() });
    saveFavs(list);
    renderFavs();
  }

  /* ------------------------------- 搜索 ------------------------------- */
  let lastQuery = '';
  let lastPage = 1;

  $('#searchForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    lastPage = 1;
    doSearch($('#searchInput').value.trim(), 1);
  });

  async function doSearch(query, page) {
    const status = $('#searchStatus');
    const results = $('#results');
    const pager = $('#pager');
    if (!query) { status.textContent = '请输入搜索内容'; return; }
    lastQuery = query;

    status.textContent = `正在通过本机服务访问「${currentEngine()?.label}」...`;
    results.innerHTML = '';
    pager.innerHTML = '';

    try {
      const data = await api(`/api/search?engine=${encodeURIComponent(engine)}&type=${mode}&q=${encodeURIComponent(query)}&page=${page}`);
      if (!data.results?.length) {
        status.textContent = `没有解析到结果（${currentEngine()?.label}）。可能是目标站点改版或被临时限制，可换一个引擎再试。`;
        return;
      }
      status.textContent = `来自「${currentEngine()?.label}」的 ${data.count} 条结果（本机静默抓取）`;
      renderResults(data.results, mode);
      renderPager(page);
    } catch (err) {
      status.textContent = `抓取失败：${err.message}。请确认本机服务已启动，或更换引擎。`;
    }
  }

  function renderResults(list, type) {
    const box = $('#results');
    box.innerHTML = '';
    if (type === 'image') {
      const grid = el('div', { class: 'img-grid' });
      list.forEach((r) => {
        grid.appendChild(
          el('a', { class: 'img-cell', href: r.page || r.image, target: '_blank', rel: 'noopener' }, [
            el('img', { src: r.thumbnail || r.image, alt: r.title || '', loading: 'lazy' }),
            el('div', { class: 'cap', text: r.title || r.page || '' }),
          ])
        );
      });
      box.appendChild(grid);
      return;
    }
    list.forEach((r) => {
      box.appendChild(
        el('a', { class: 'res-card', href: r.url, target: '_blank', rel: 'noopener' }, [
          el('h3', { class: 'res-title', text: r.title || r.url }),
          el('div', { class: 'res-url', text: r.url }),
          el('p', { class: 'res-snippet', text: r.snippet || '' }),
        ])
      );
    });
  }

  function renderPager(page) {
    const pager = $('#pager');
    pager.innerHTML = '';
    if (page > 1) pager.appendChild(el('button', { class: 'ghost', text: '上一页', type: 'button', onclick: () => doSearch(lastQuery, page - 1) }));
    pager.appendChild(el('span', { class: 'muted', text: `第 ${page} 页` }));
    pager.appendChild(el('button', { class: 'ghost', text: '下一页', type: 'button', onclick: () => doSearch(lastQuery, page + 1) }));
  }

  /* ------------------------------- AI 面板 ------------------------------- */
  const SITES = {
    kimi: { label: 'Kimi', path: '/api/kimi', model: 'K2.6 普通（不推理）' },
    deepseek: { label: 'DeepSeek', path: '/api/deepseek', model: 'DeepSeek 默认模型' },
  };

  const AI = {};

  function buildPanel(site) {
    const cfg = SITES[site];
    const view = $(`#view-${site}`);
    view.innerHTML = '';

    const panel = el('div', { class: 'panel' });
    const head = el('div', { class: 'panel-head' }, [
      el('h2', { text: cfg.label }),
      el('span', { class: 'badge', text: cfg.model }),
      el('div', { class: 'right' }, [
        el('button', { class: 'icon-btn', type: 'button', text: '打开登录', onclick: () => ctrl.start() }),
        el('button', { class: 'icon-btn', type: 'button', text: '断开', onclick: () => ctrl.reset() }),
      ]),
    ]);
    const notice = el('div', { class: 'notice', text:
      `${cfg.label} 由本机服务在后台静默访问；本站不显示官方页面，登录信息只在本机使用。若目标站点近期改版，需要在 server/ai 中调整选择器。` });

    // 登录区
    const loginBox = el('div', { class: 'login-box' });
    const uInput = el('input', { type: 'text', placeholder: '账号 / 手机号 / 邮箱' });
    const pInput = el('input', { type: 'password', placeholder: '密码（如站点要求短信验证码，可填在此处）' });
    const cInput = el('input', { type: 'text', placeholder: '验证码（如有）' });
    const captchaImg = el('img', { alt: '验证码', title: '点击刷新验证码' });
    captchaImg.style.display = 'none';
    const loginMsg = el('div', { class: 'muted' });
    const loginBtn = el('button', { class: 'primary', type: 'button', text: '登录', onclick: () => ctrl.login(uInput.value, pInput.value, cInput.value) });
    loginBox.append(
      el('div', { class: 'form-row' }, [el('label', { text: '账号' }), uInput]),
      el('div', { class: 'form-row' }, [el('label', { text: '密码' }), pInput]),
      el('div', { class: 'form-row' }, [el('label', { text: '验证码' }), el('div', { class: 'captcha-row' }, [cInput, captchaImg])]),
      el('div', { class: 'form-row' }, [el('label', {}), loginBtn]),
      loginMsg
    );
    captchaImg.addEventListener('click', () => ctrl.refresh());

    // 对话区
    const chatLog = el('div', { class: 'chat-log' });
    const attached = el('div', { class: 'attached' });
    const fileInput = el('input', { type: 'file', accept: 'image/*', multiple: 'multiple' });
    fileInput.style.display = 'none';
    const textInput = el('textarea', { placeholder: '输入提问，Enter 发送，Shift+Enter 换行' });
    const sendBtn = el('button', { class: 'primary', type: 'button', text: '发送', onclick: () => ctrl.send() });
    const chatBox = el('div', { class: 'chat hidden' }, [
      chatLog,
      el('div', { class: 'chat-input' }, [
        attached,
        el('div', { class: 'chat-bar' }, [
          el('button', { class: 'icon-btn', type: 'button', text: '图片', onclick: () => fileInput.click() }),
          fileInput,
          textInput,
          sendBtn,
        ]),
      ]),
    ]);

    panel.append(head, notice, loginBox, chatBox);
    view.appendChild(panel);

    let pending = [];
    fileInput.addEventListener('change', () => { pending = pending.concat(Array.from(fileInput.files || [])); fileInput.value = ''; renderAttached(); });
    function renderAttached() {
      attached.innerHTML = '';
      pending.forEach((f, i) => {
        const url = URL.createObjectURL(f);
        attached.appendChild(el('div', { class: 'thumb' }, [
          el('img', { src: url }),
          el('button', { class: 'x', type: 'button', text: '×', onclick: () => { pending.splice(i, 1); renderAttached(); } }),
        ]));
      });
    }
    textInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); ctrl.send(); }
    });

    return { panel, loginBox, chatBox, loginMsg, captchaImg, uInput, pInput, cInput, chatLog, textInput, sendBtn, loginBtn,
      getPending: () => pending, clearPending: () => { pending = []; renderAttached(); } };
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  ['kimi', 'deepseek'].forEach((site) => {
    const cfg = SITES[site];
    const dom = buildPanel(site);
    let entered = false;

    const ctrl = {
      async onEnter() { if (!entered) { entered = true; await ping(); } await this.refresh(); },
      async refresh() {
        try {
          const st = await api(`${cfg.path}/state`);
          applyState(st);
        } catch {
          dom.loginBox.innerHTML = '';
          dom.loginBox.appendChild(el('div', { class: 'muted', text: '未连接本机服务，请先启动 server 并确认地址。' }));
        }
      },
      async start() {
        dom.loginMsg.textContent = '正在通过本机服务打开目标站点...';
        try {
          const st = await api(`${cfg.path}/start`, { method: 'POST', body: '{}' });
          applyState(st);
        } catch (err) {
          dom.loginMsg.textContent = `打开失败：${err.message}（若尚未安装 puppeteer，请先在 server 目录执行 npm install）`;
        }
      },
      async login(username, password, captcha) {
        dom.loginMsg.textContent = '正在提交登录...';
        dom.loginBtn.disabled = true;
        try {
          const st = await api(`${cfg.path}/login`, { method: 'POST', body: JSON.stringify({ username, password, captcha }) });
          applyState(st);
          if (!st.loggedIn) dom.loginMsg.textContent = '仍未登录成功，可能需要短信验证码或验证码有误，请重试。';
        } catch (err) {
          dom.loginMsg.textContent = `登录失败：${err.message}`;
        } finally {
          dom.loginBtn.disabled = false;
        }
      },
      async reset() {
        await api(`${cfg.path}/reset`, { method: 'POST', body: '{}' }).catch(() => {});
        dom.chatBox.classList.add('hidden');
        dom.loginBox.classList.remove('hidden');
        dom.loginMsg.textContent = '已断开本机会话。';
      },
      async send() {
        const text = dom.textInput.value.trim();
        const files = dom.getPending();
        if (!text && !files.length) return;
        const dataUrls = await Promise.all(files.map(fileToDataUrl));
        addMessage('user', text, dataUrls);
        dom.textInput.value = '';
        dom.clearPending();
        const bot = addMessage('bot', '正在等待回复...');
        dom.sendBtn.disabled = true;
        try {
          const data = await api(`${cfg.path}/chat`, { method: 'POST', body: JSON.stringify({ text, images: dataUrls }) });
          bot.textContent = data.reply || '（未读取到回复内容，可能站点结构已变化）';
        } catch (err) {
          bot.textContent = `发送失败：${err.message}`;
        } finally {
          dom.sendBtn.disabled = false;
        }
      },
    };

    function addMessage(role, text, images = []) {
      const bubble = el('div', { class: `msg ${role}` });
      if (images.length) {
        const box = el('div', { class: 'imgs' });
        images.forEach((src) => box.appendChild(el('img', { src })));
        bubble.appendChild(box);
      }
      bubble.appendChild(el('span', { text: text || '' }));
      dom.chatLog.appendChild(bubble);
      dom.chatLog.scrollTop = dom.chatLog.scrollHeight;
      return bubble.querySelector('span');
    }

    function applyState(st) {
      if (!st.ready) {
        dom.chatBox.classList.add('hidden');
        dom.loginBox.classList.remove('hidden');
        dom.loginMsg.textContent = '点击右上角「打开登录」，由本机服务静默打开目标站点。';
        return;
      }
      if (st.loggedIn) {
        dom.loginBox.classList.add('hidden');
        dom.chatBox.classList.remove('hidden');
        return;
      }
      dom.chatBox.classList.add('hidden');
      dom.loginBox.classList.remove('hidden');
      dom.loginMsg.textContent = '请输入账号信息完成登录（验证码由本机服务读取后显示在下方）。';
      if (st.captcha) {
        dom.captchaImg.src = st.captcha;
        dom.captchaImg.style.display = 'block';
      } else {
        dom.captchaImg.style.display = 'none';
      }
    }

    AI[site] = ctrl;
  });

  /* ------------------------------- 初始化 ------------------------------- */
  // 恢复上次的引擎与模式
  $$('.mode-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  renderFavs();
  (async () => {
    await ping();
    await loadEngines();
  })();
})();