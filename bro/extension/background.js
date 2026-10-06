// bro bridge —— 后台 service worker
// ---------------------------------------------------------------------------
// 职责：
//   1) 搜索引擎抓取：先用 Service Worker fetch（最轻量，零痕迹），若返回验证页或解析不到
//      结果则降级到 Offscreen Document（依然完全静默，无任何标签/窗口）。
//      全程对用户不可见，没有任何跳转或弹窗。
//   2) Kimi / DeepSeek 会话：在本机后台标签页托管（登录态不能放在 Offscreen），通过
//      content script 驱动。这部分会创建标签但不抢占焦点，与搜索抓取链路解耦。
// 全部运行在浏览器内部，不依赖 Node / npm / Chromium 等外部环境。
// ---------------------------------------------------------------------------

const SITES = {
  kimi: { url: 'https://www.kimi.com/' },
  deepseek: { url: 'https://chat.deepseek.com/' },
};

const siteTabs = new Map();  // site -> tabId（仅 Kimi / DeepSeek 使用）
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------------------- Offscreen 文档管理 ---------------------------- */
const OFFSCREEN_PATH = 'offscreen.html';
const OFFSCREEN_CHANNEL = 'bro-offscreen-v1';
const offscreenReady = new Promise((resolve) => {
  const listener = (msg) => {
    if (msg && msg.channel === OFFSCREEN_CHANNEL && msg.dir === 'ready') {
      chrome.runtime.onMessage.removeListener(listener);
      resolve();
    }
  };
  chrome.runtime.onMessage.addListener(listener);
});

// 确保 Offscreen 文档存在（完全无界面、不出现任何标签）
async function ensureOffscreen() {
  try {
    // Chrome 116+ 支持；老版本抛错时回退到 fetch
    const has = await chrome.offscreen.hasDocument();
    if (has) return;
  } catch (_) { /* 不支持 offscreen，走纯 fetch 路径 */ }

  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_PATH,
      reasons: ['DOM_PARSER'],
      justification: '为 bro 搜索引擎后台静默抓取提供 DOM 环境，避免裸 fetch 被站点防爬拦截。',
    });
    await offscreenReady;
  } catch (err) {
    throw new Error(`无法创建 Offscreen 文档：${err?.message || err}`);
  }
}

// 通过 Service Worker → Offscreen 发请求并拿回渲染后的 HTML
function callOffscreen(url, timeout = 25000) {
  const id = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(onMsg);
      reject(new Error('Offscreen 文档未响应'));
    }, timeout);
    function onMsg(msg) {
      if (!msg || msg.channel !== OFFSCREEN_CHANNEL || msg.dir !== 'res' || msg.id !== id) return;
      clearTimeout(timer);
      chrome.runtime.onMessage.removeListener(onMsg);
      if (msg.ok) resolve(msg.data);
      else reject(new Error(msg.error || 'Offscreen 返回错误'));
    }
    chrome.runtime.onMessage.addListener(onMsg);
    chrome.runtime.sendMessage({
      channel: OFFSCREEN_CHANNEL, dir: 'req', id, method: 'fetch',
      params: { url, timeout: 20000, settle: 600 },
    });
  });
}

/* ------------------------------ 搜索引擎抓取 ------------------------------ */
async function fetchText(url) {
  // Service Worker fetch：最轻量，扩展身份（带完整 Cookie + UA + host_permissions）
  const res = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    redirect: 'follow',
    cache: 'no-store',
    headers: {
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'User-Agent': navigator.userAgent,
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`目标站点返回 ${res.status}`);
  return { status: res.status, finalUrl: res.url, text };
}

// 判断 HTML 是否为搜索引擎返回的安全验证页（而非真正的搜索结果页）
function looksLikeCaptcha(html) {
  const h = html || '';
  return /wappass\.baidu\.com|百度安全验证|请输入验证码|滑动验证|人机验证|unusual traffic|security check|captcha/i.test(h);
}

// 后台静默抓取：先 fetch（最轻量），若拿到验证页或空结果再降级 Offscreen。
// 全程对用户不可见——没有跳转、没有标签闪动、没有任何窗口。
async function fetchPageSilent(url) {
  // 第一优先级：Service Worker fetch（零痕迹）
  try {
    const res = await fetchText(url);
    if (!looksLikeCaptcha(res.text)) return { ...res, via: 'sw-fetch' };
    // fetch 拿到了验证页，降级到 Offscreen
  } catch (_) { /* fetch 失败直接走 Offscreen */ }

  // 第二优先级：Offscreen Document（同样零痕迹）
  try {
    await ensureOffscreen();
    const res = await callOffscreen(url);
    return { ...res, via: 'offscreen' };
  } catch (err) {
    throw new Error(`静默抓取失败：${err?.message || err}`);
  }
}

/* ------------------------------ 站点代理（Kimi / DeepSeek） ------------------------------ */
async function ensureTab(site) {
  const cfg = SITES[site];
  if (!cfg) throw new Error(`未知站点：${site}`);

  const existing = siteTabs.get(site);
  if (existing != null) {
    try { await chrome.tabs.get(existing); return existing; }
    catch { siteTabs.delete(site); }
  }

  const tab = await chrome.tabs.create({ url: cfg.url, active: false });
  siteTabs.set(site, tab.id);
  return tab.id;
}

// content script 可能尚未注入，带重试地发送消息
async function sendToTab(tabId, message, { retries = 25, delay = 800 } = {}) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try { return await chrome.tabs.sendMessage(tabId, message); }
    catch (err) { lastErr = err; await sleep(delay); }
  }
  throw new Error(`无法与站点页面通信：${lastErr?.message || lastErr}`);
}

async function aiCall(site, cmd, payload = {}) {
  const tabId = await ensureTab(site);
  return sendToTab(tabId, { cmd, ...payload });
}

/* --------------------------- 消息分发入口 --------------------------- */
async function handle(method, params = {}) {
  switch (method) {
    case 'ping':      return { pong: true };
    case 'fetch':     return fetchText(params.url);
    case 'fetchPage': return fetchPageSilent(params.url);   // 搜索引擎：全程静默

    case 'ai.open':    return aiCall(params.site, 'state');
    case 'ai.state':   return aiCall(params.site, 'state');
    case 'ai.login':   return aiCall(params.site, 'login', { username: params.username, password: params.password, captcha: params.captcha });
    case 'ai.chat':    return aiCall(params.site, 'chat', { text: params.text, images: params.images || [] });
    case 'ai.newChat': return aiCall(params.site, 'newChat');
    case 'ai.reset': {
      const tabId = siteTabs.get(params.site);
      if (tabId != null) { await chrome.tabs.remove(tabId).catch(() => {}); siteTabs.delete(params.site); }
      return { ok: true };
    }
    default:
      throw new Error(`未知方法：${method}`);
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'bro') return undefined;
  handle(msg.method, msg.params)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
  return true; // 异步响应
});

chrome.tabs.onRemoved.addListener((tabId) => {
  for (const [site, id] of siteTabs.entries()) {
    if (id === tabId) siteTabs.delete(site);
  }
});
