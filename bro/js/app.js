/* bro 前端逻辑（纯浏览器原生）
 * ---------------------------------------------------------------------------
 * 页面自身不发任何跨域请求。所有“静默访问目标站点”的动作都通过 window.postMessage
 * 交给浏览器扩展（bro bridge）完成，扩展用其特权接口抓取并回传内容。
 * 因此不依赖 Node / npm / Chromium 等任何外部运行时。
 */
(() => {
  'use strict';

  const CHANNEL = 'bro-bridge-v1';

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

  /* --------------------------- 与扩展的通信桥 --------------------------- */
  let bridgeReady = false;
  let seq = 0;
  const pending = new Map();

  window.addEventListener('message', (ev) => {
    if (ev.source !== window) return;
    const msg = ev.data;
    if (!msg || msg.channel !== CHANNEL) return;

    if (msg.dir === 'ready') { bridgeReady = true; setConn(true); return; }
    if (msg.dir !== 'res' || !pending.has(msg.id)) return;

    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.ok) p.resolve(msg.data);
    else p.reject(new Error(msg.error || '扩展返回错误'));
  });

  function bridgeCall(method, params = {}, timeout = 30000) {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('扩展未响应，请确认已安装并启用 bro bridge 扩展'));
      }, timeout);
      pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      window.postMessage({ channel: CHANNEL, dir: 'req', id, method, params }, location.origin);
    });
  }

  function setConn(ok) {
    const dot = $('#connDot');
    const text = $('#connText');
    dot.classList.toggle('on', ok);
    dot.classList.toggle('off', !ok);
    text.textContent = ok ? '扩展已连接' : '未检测到扩展';
    const banner = $('#bridgeBanner');
    if (banner) banner.classList.toggle('hidden', ok);
  }

  async function checkBridge() {
    try {
      await bridgeCall('ping', {}, 2500);
      bridgeReady = true;
      setConn(true);
    } catch {
      bridgeReady = false;
      setConn(false);
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
    $('#guide .state').textContent = bridgeReady ? '扩展已连接，功能可用。' : '尚未检测到扩展。';
    $('#settingsModal').classList.remove('hidden');
  });
  $('#baseCancel').addEventListener('click', () => $('#settingsModal').classList.add('hidden'));
  $('#baseSave').addEventListener('click', async () => {
    $('#settingsModal').classList.add('hidden');
    await checkBridge();
  });

  /* ------------------------------- 搜索引擎 ------------------------------- */
  let engines = window.BRO_ENGINES.list();
  let engine = localStorage.getItem('bro.engine') || 'bing';
  let mode = localStorage.getItem('bro.mode') || 'web';

  const engineHost = { bing: 'bing.com', baidu: 'baidu.com', sogou: 'sogou.com', google: 'google.com', duckduckgo: 'duckduckgo.com' };

  const currentEngine = () => engines.find((e) => e.id === engine) || engines[0];

  function renderEngineButton() {
    const e = currentEngine();
    $('#engineLabel').textContent = e?.label || engine;
    const icon = $('#engineIcon');
    icon.src = engineHost[e?.id] ? `https://${engineHost[e.id]}/favicon.ico` : '';
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
            menu.classList.remove('open');
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
      const img = host ? el('img', { src: `https://${host}/favicon.ico`, alt: '' }) : null;
      if (img) img.onerror = () => img.remove();
      grid.appendChild(
        el('a', { class: 'fav', href: fav.url, target: '_blank', rel: 'noopener' }, [
          ...(img ? [img] : []),
          el('span', { class: 'letter', text: (fav.name || host || '?')[0].toUpperCase() }),
          el('span', { class: 'name', text: fav.name || host || fav.url }),
          el('button', {
            class: 'del', type: 'button', text: '×', title: '删除',
            onclick: (ev) => { ev.preventDefault(); ev.stopPropagation(); const l = loadFavs(); l.splice(idx, 1); saveFavs(l); renderFavs(); },
          }),
        ])
      );
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
  const LAST_KEY = 'bro.lastResults';

  $('#searchForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    doSearch($('#searchInput').value.trim(), 1);
  });

  async function doSearch(query, page) {
    const status = $('#searchStatus');
    const results = $('#results');
    if (!query) { status.textContent = '请输入搜索内容'; return; }
    lastQuery = query;

    status.textContent = `正在通过扩展静默访问「${currentEngine()?.label}」...`;
    results.innerHTML = '';
    $('#pager').innerHTML = '';

    try {
      const url = window.BRO_ENGINES.url(engine, query, mode, page);
      // 用后台标签页真实加载目标结果页，避免裸 fetch 被搜索引擎防爬校验拦截
      const data = await bridgeCall('fetchPage', { url }, 45000);
      const list = window.BRO_ENGINES.parse(engine, mode, data.text);
      if (!list.length) {
        if (/wappass\.baidu|安全验证|请输入验证码|verify|unusual traffic/i.test(data.text || '')) {
          status.textContent = `「${currentEngine()?.label}」返回了安全验证页。请先在浏览器中正常打开一次该引擎并完成验证后重试，或更换其它引擎。`;
        } else {
          status.textContent = `没有解析到结果（${currentEngine()?.label}）。目标站点可能改版或被限制，换一个引擎再试。`;
        }
        return;
      }
      status.textContent = `来自「${currentEngine()?.label}」的 ${list.length} 条结果（扩展静默抓取）`;
      renderResults(list, mode);
      renderPager(page);
      // 记住最后一次结果，便于从其它视图返回时恢复
      try { sessionStorage.setItem(LAST_KEY, JSON.stringify({ query, page, mode, engine, list })); } catch {}
    } catch (err) {
      status.textContent = `${err.message} 若持续失败：确认扩展已启用，或更换引擎。`;
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
    kimi: { label: 'Kimi', model: 'K2.6 普通（不推理）' },
    deepseek: { label: 'DeepSeek', model: 'DeepSeek 默认模型' },
  };

  const AI = {};

  function buildPanel(site, ref) {
    const cfg = SITES[site];
    const view = $(`#view-${site}`);
    view.innerHTML = '';

    const loginMsg = el('div', { class: 'muted' });
    const uInput = el('input', { type: 'text', placeholder: '账号 / 手机号 / 邮箱' });
    const pInput = el('input', { type: 'password', placeholder: '密码（如仅需短信验证码，可填在验证码栏）' });
    const cInput = el('input', { type: 'text', placeholder: '验证码（如有）' });
    const captchaImg = el('img', { alt: '验证码', title: '点击刷新验证码' });
    captchaImg.style.display = 'none';
    const loginBtn = el('button', { class: 'primary', type: 'button', text: '登录', onclick: () => ref.ctrl.login(uInput.value, pInput.value, cInput.value) });
    loginBtn.disabled = true;
    const loginBox = el('div', { class: 'login-box' }, [
      el('div', { class: 'form-row' }, [el('label', { text: '账号' }), uInput]),
      el('div', { class: 'form-row' }, [el('label', { text: '密码' }), pInput]),
      el('div', { class: 'form-row' }, [el('label', { text: '验证码' }), el('div', { class: 'captcha-row' }, [cInput, captchaImg])]),
      el('div', { class: 'form-row' }, [el('label', {}), loginBtn]),
      loginMsg,
    ]);
    captchaImg.addEventListener('click', () => ref.ctrl.refresh());

    const chatLog = el('div', { class: 'chat-log' });
    const attached = el('div', { class: 'attached' });
    const fileInput = el('input', { type: 'file', accept: 'image/*', multiple: 'multiple' });
    fileInput.style.display = 'none';
    const textInput = el('textarea', { placeholder: '输入提问，Enter 发送，Shift+Enter 换行' });
    const sendBtn = el('button', { class: 'primary', type: 'button', text: '发送', onclick: () => ref.ctrl.send() });
    const chatBox = el('div', { class: 'chat hidden' }, [
      chatLog,
      el('div', { class: 'chat-input' }, [
        attached,
        el('div', { class: 'chat-bar' }, [
          el('button', { class: 'icon-btn', type: 'button', text: '图片', onclick: () => fileInput.click() }),
          fileInput, textInput, sendBtn,
        ]),
      ]),
    ]);

    const panel = el('div', { class: 'panel' }, [
      el('div', { class: 'panel-head' }, [
        el('h2', { text: cfg.label }),
        el('span', { class: 'badge', text: cfg.model }),
        el('div', { class: 'right' }, [
          el('button', { class: 'icon-btn', type: 'button', text: '打开登录', onclick: () => ref.ctrl.start() }),
          el('button', { class: 'icon-btn', type: 'button', text: '断开', onclick: () => ref.ctrl.reset() }),
        ]),
      ]),
      el('div', { class: 'notice', text:
        `${cfg.label} 由扩展在后台标签页中静默访问；页面本身不显示官方登录界面。登录信息只在你的浏览器内、通过扩展填入目标站点，不会发往任何第三方服务器。若站点近期改版，需调整 extension/site-agent.js 中的选择器。` }),
      loginBox, chatBox,
    ]);
    view.appendChild(panel);

    let pendingImgs = [];
    fileInput.addEventListener('change', () => { pendingImgs = pendingImgs.concat(Array.from(fileInput.files || [])); fileInput.value = ''; renderAttached(); });
    function renderAttached() {
      attached.innerHTML = '';
      pendingImgs.forEach((f, i) => {
        attached.appendChild(el('div', { class: 'thumb' }, [
          el('img', { src: URL.createObjectURL(f) }),
          el('button', { class: 'x', type: 'button', text: '×', onclick: () => { pendingImgs.splice(i, 1); renderAttached(); } }),
        ]));
      });
    }
    textInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); ref.ctrl.send(); }
    });

    return { loginBox, chatBox, loginMsg, captchaImg, uInput, pInput, cInput, chatLog, textInput, sendBtn, loginBtn,
      getPending: () => pendingImgs, clearPending: () => { pendingImgs = []; renderAttached(); } };
  }

  const fileToDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  function addMessage(dom, role, text, images = []) {
    const bubble = el('div', { class: `msg ${role}` });
    if (images.length) {
      const box = el('div', { class: 'imgs' });
      images.forEach((src) => box.appendChild(el('img', { src })));
      bubble.appendChild(box);
    }
    const span = el('span', { text: text || '' });
    bubble.appendChild(span);
    dom.chatLog.appendChild(bubble);
    dom.chatLog.scrollTop = dom.chatLog.scrollHeight;
    return span;
  }

  ['kimi', 'deepseek'].forEach((site) => {
    const cfg = SITES[site];
    const ref = {};
    const dom = buildPanel(site, ref);
    let entered = false;

    function applyState(st) {
      if (!st || st.error) {
        dom.loginMsg.textContent = st?.error ? `状态读取失败：${st.error}` : '点击右上角「打开登录」，由扩展在后台静默打开目标站点。';
        return;
      }
      dom.loginBtn.disabled = false;
      if (st.loggedIn) {
        dom.loginBox.classList.add('hidden');
        dom.chatBox.classList.remove('hidden');
        return;
      }
      dom.chatBox.classList.add('hidden');
      dom.loginBox.classList.remove('hidden');
      dom.loginMsg.textContent = '请输入账号信息完成登录（验证码由扩展从目标站点读取后显示在下方）。';
      if (st.captcha) { dom.captchaImg.src = st.captcha; dom.captchaImg.style.display = 'block'; }
      else dom.captchaImg.style.display = 'none';
    }

    const ctrl = {
      async onEnter() {
        if (!entered) { entered = true; await checkBridge(); }
        if (bridgeReady) this.refresh();
        else dom.loginMsg.textContent = '未检测到 bro bridge 扩展，请先安装并启用（点右上角「设置」查看说明）。';
      },
      async refresh() {
        try { applyState(await bridgeCall('ai.state', { site }, 30000)); }
        catch (err) { dom.loginMsg.textContent = `无法读取状态：${err.message}`; }
      },
      async start() {
        dom.loginMsg.textContent = '正在通过扩展打开目标站点...';
        try { applyState(await bridgeCall('ai.open', { site }, 60000)); }
        catch (err) { dom.loginMsg.textContent = `打开失败：${err.message}`; }
      },
      async login(username, password, captcha) {
        dom.loginMsg.textContent = '正在提交登录...';
        dom.loginBtn.disabled = true;
        try {
          const st = await bridgeCall('ai.login', { site, username, password, captcha }, 90000);
          applyState(st);
          if (st && !st.loggedIn) dom.loginMsg.textContent = '仍未登录成功：可能需要短信验证码或验证码错误，请重试。';
        } catch (err) {
          dom.loginMsg.textContent = `登录失败：${err.message}`;
        } finally {
          dom.loginBtn.disabled = false;
        }
      },
      async reset() {
        await bridgeCall('ai.reset', { site }).catch(() => {});
        dom.chatBox.classList.add('hidden');
        dom.loginBox.classList.remove('hidden');
        dom.loginMsg.textContent = '已断开本机会话。';
      },
      async send() {
        const text = dom.textInput.value.trim();
        const files = dom.getPending();
        if (!text && !files.length) return;
        const dataUrls = await Promise.all(files.map(fileToDataUrl));
        addMessage(dom, 'user', text, dataUrls);
        dom.textInput.value = '';
        dom.clearPending();
        const bot = addMessage(dom, 'bot', '正在等待回复...');
        dom.sendBtn.disabled = true;
        try {
          const data = await bridgeCall('ai.chat', { site, text, images: dataUrls }, 180000);
          bot.textContent = data?.reply || '（未读取到回复内容，可能站点结构已变化）';
        } catch (err) {
          bot.textContent = `发送失败：${err.message}`;
        } finally {
          dom.sendBtn.disabled = false;
        }
      },
    };

    ref.ctrl = ctrl;
    AI[site] = ctrl;
  });

  /* ------------------------------- 初始化 ------------------------------- */
  $$('.mode-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  renderFavs();
  renderEngineButton();
  renderEngineMenu();
  (async () => { await checkBridge(); })();
})();