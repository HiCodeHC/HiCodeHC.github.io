// bro bridge —— 注入到 Kimi / DeepSeek 页面的内容脚本
// ---------------------------------------------------------------------------
// 在目标站点自身的页面上下文里工作：读取登录状态与验证码、代填账号密码、
// 上传图片、发送提问并读取回答。站点的页面始终在后台标签页里，用户不会直接看到它。
// 站点改版时，只需调整下面 CONFIG 里的候选选择器。
// ---------------------------------------------------------------------------
(() => {
  if (window !== window.top) return; // 只在顶层页面响应，避免子框架返回错误状态

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const CONFIG = {
    kimi: {
      model: 'K2.6 普通（不推理）',
      loggedIn: [
        'div.chat-input-editor[contenteditable="true"]',
        'div[contenteditable="true"]',
        'textarea[placeholder]',
      ],
      login: {
        open: ['button[class*="login"]', 'div[class*="login"] button', 'button'],
        username: ['input[type="tel"]', 'input[placeholder*="手机"]', 'input[placeholder*="邮箱"]', 'input[name="mobile"]', 'input[type="text"]'],
        password: ['input[type="password"]', 'input[placeholder*="密码"]'],
        captchaImg: ['img[alt*="验证码"]', 'img[class*="captcha"]', '[class*="captcha"] img'],
        captchaInput: ['input[placeholder*="验证码"]', 'input[name*="captcha"]', 'input[class*="captcha"]'],
        submit: ['button[type="submit"]', 'button[class*="login"]', 'div[class*="submit"]'],
      },
      chat: {
        input: ['div.chat-input-editor[contenteditable="true"]', 'div[contenteditable="true"]', 'textarea[placeholder]'],
        send: ['div[class*="send-button"]', 'button[class*="send"]', 'button[aria-label*="发送"]'],
        upload: ['input[type="file"][accept*="image"]', 'input[type="file"]'],
        newChat: ['div[class*="new-chat"]', 'button[title*="新建"]'],
        answer: ['div[class*="segment-assistant"]', 'div[class*="markdown"]', 'div[class*="assistant"]'],
      },
    },
    deepseek: {
      model: 'DeepSeek 默认模型',
      loggedIn: ['textarea#chat-input', 'textarea[placeholder]', 'div[contenteditable="true"]'],
      login: {
        open: ['button[class*="login"]', 'div[class*="login"] button', 'button'],
        username: ['input[type="text"]', 'input[name="email"]', 'input[placeholder*="手机"]', 'input[placeholder*="邮箱"]'],
        password: ['input[type="password"]', 'input[placeholder*="密码"]'],
        captchaImg: ['img[alt*="验证码"]', 'img[class*="captcha"]', '[class*="captcha"] img'],
        captchaInput: ['input[placeholder*="验证码"]', 'input[name*="captcha"]'],
        submit: ['div[class*="login"] button', 'button[type="submit"]', 'button[class*="login"]'],
      },
      chat: {
        input: ['textarea#chat-input', 'textarea[placeholder]', 'div[contenteditable="true"]'],
        send: ['div[role="button"][class*="send"]', 'button[class*="send"]', 'div[class*="send-btn"]'],
        upload: ['input[type="file"][accept*="image"]', 'input[type="file"]'],
        newChat: ['div[class*="new-chat"]', 'button[title*="新建"]'],
        answer: ['div.ds-markdown', 'div[class*="markdown"]', 'div[class*="assistant"]'],
      },
    },
  };

  const siteOf = () => {
    const h = location.hostname;
    if (h.includes('kimi') || h.includes('moonshot')) return 'kimi';
    if (h.includes('deepseek')) return 'deepseek';
    return null;
  };

  /* ------------------------------- DOM 工具 ------------------------------- */
  const find = (selectors) => {
    for (const sel of selectors || []) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  };

  const findLast = (selectors) => {
    for (const sel of selectors || []) {
      const list = document.querySelectorAll(sel);
      if (list.length) return list[list.length - 1];
    }
    return null;
  };

  // React/Vue 受控输入需要通过原生 setter 赋值再派发事件，才能被框架感知
  function setValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setEditable(el, value) {
    el.focus();
    el.textContent = value;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
  }

  const click = (el) => {
    el.scrollIntoView({ block: 'center' });
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    el.click();
  };

  // 读取验证码图片（同源，可直接 fetch 转 dataURL；失败时退回 canvas 绘制）
  async function captureImage(el) {
    try {
      const src = el.currentSrc || el.src;
      const res = await fetch(src, { credentials: 'include' });
      const blob = await res.blob();
      return await new Promise((resolve) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = () => resolve(null);
        fr.readAsDataURL(blob);
      });
    } catch {
      try {
        const c = document.createElement('canvas');
        c.width = el.naturalWidth || el.width;
        c.height = el.naturalHeight || el.height;
        c.getContext('2d').drawImage(el, 0, 0);
        return c.toDataURL('image/png');
      } catch {
        return null;
      }
    }
  }

  function dataUrlToFile(dataUrl, name) {
    const [meta, b64] = String(dataUrl).split(',');
    const mime = (meta.match(/data:([^;]+)/) || [])[1] || 'image/png';
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new File([arr], name, { type: mime });
  }

  async function uploadImages(input, images) {
    const dt = new DataTransfer();
    images.forEach((d, i) => dt.items.add(dataUrlToFile(d, `bro-${i}.png`)));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(1200);
  }

  // 轮询读取回答，直到文本稳定
  async function waitForAnswer(cfg, { timeout = 120000, quiet = 1500 } = {}) {
    const start = Date.now();
    let last = '';
    let lastChange = Date.now();
    while (Date.now() - start < timeout) {
      const el = findLast(cfg.chat.answer);
      const text = (el?.innerText || '').trim();
      if (text && text !== last) {
        last = text;
        lastChange = Date.now();
      }
      if (last && Date.now() - lastChange > quiet) return last;
      await sleep(400);
    }
    return last;
  }

  /* ------------------------------- 指令处理 ------------------------------- */
  async function state(cfg) {
    const loggedIn = !!find(cfg.loggedIn);
    let captcha = null;
    if (!loggedIn) {
      const img = find(cfg.login.captchaImg);
      if (img) captcha = await captureImage(img);
    }
    return { ready: true, loggedIn, needCaptcha: !!captcha, captcha, model: cfg.model, url: location.href };
  }

  async function login(cfg, { username = '', password = '', captcha = '' }) {
    if (find(cfg.loggedIn)) return state(cfg);
    if (!find(cfg.login.username)) {
      const openBtn = find(cfg.login.open);
      if (openBtn) {
        click(openBtn);
        await sleep(1200);
      }
    }
    const uEl = find(cfg.login.username);
    if (!uEl) throw new Error('未找到账号输入框，站点可能已改版（请调整 site-agent.js 中的选择器）');
    setValue(uEl, username);
    const pEl = find(cfg.login.password);
    if (pEl && password) setValue(pEl, password);
    if (captcha) {
      const cEl = find(cfg.login.captchaInput);
      if (cEl) setValue(cEl, captcha);
    }
    const sEl = find(cfg.login.submit);
    if (sEl) click(sEl);
    await sleep(3500);
    return state(cfg);
  }

  async function chat(cfg, { text = '', images = [] }) {
    if (images.length) {
      const input = find(cfg.chat.upload);
      if (input) await uploadImages(input, images);
    }
    const input = find(cfg.chat.input);
    if (!input) throw new Error('未找到输入框，站点可能已改版（请调整 site-agent.js 中的选择器）');
    if (input.isContentEditable) setEditable(input, text);
    else setValue(input, text);
    await sleep(300);

    const btn = find(cfg.chat.send);
    if (btn) click(btn);
    else {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    }
    const reply = await waitForAnswer(cfg);
    return { reply };
  }

  async function newChat(cfg) {
    const btn = find(cfg.chat.newChat);
    if (btn) click(btn);
    await sleep(800);
    return { ok: true };
  }

  /* ------------------------------- 消息入口 ------------------------------- */
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    const site = siteOf();
    if (!site || !msg || !msg.cmd) return undefined;
    const cfg = CONFIG[site];

    (async () => {
      switch (msg.cmd) {
        case 'state':
          return state(cfg);
        case 'login':
          return login(cfg, msg);
        case 'chat':
          return chat(cfg, msg);
        case 'newChat':
          return newChat(cfg);
        default:
          throw new Error(`未知指令：${msg.cmd}`);
      }
    })()
      .then((data) => sendResponse(data))
      .catch((err) => sendResponse({ error: String(err?.message || err) }));

    return true; // 异步响应
  });
})();