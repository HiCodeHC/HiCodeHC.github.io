// bro bridge —— 后台 service worker
// ---------------------------------------------------------------------------
// 只做两件事：
//   1) 特权抓取：借 host_permissions，代表前端读取搜索引擎等站点的响应内容（不受 CORS 限制）；
//   2) 站点代理：在本机后台标签页中托管 Kimi / DeepSeek，并通过 content script 驱动其登录与对话。
// 全部运行在浏览器内部，不依赖 Node / npm / Chromium 等外部环境。
// ---------------------------------------------------------------------------

const SITES = {
  kimi: { url: 'https://www.kimi.com/' },
  deepseek: { url: 'https://chat.deepseek.com/' },
};

const siteTabs = new Map(); // site -> tabId
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------ 特权抓取 ------------------------------ */
async function fetchText(url) {
  const res = await fetch(url, {
    method: 'GET',
    credentials: 'include',        // 带上本机浏览器已有的 Cookie，提高结果页可用性
    redirect: 'follow',
    cache: 'no-store',
    headers: { 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`目标站点返回 ${res.status}`);
  return { status: res.status, finalUrl: res.url, text };
}

/* ------------------------------ 站点代理 ------------------------------ */
async function ensureTab(site) {
  const cfg = SITES[site];
  if (!cfg) throw new Error(`未知站点：${site}`);

  const existing = siteTabs.get(site);
  if (existing != null) {
    try {
      await chrome.tabs.get(existing);
      return existing;
    } catch {
      siteTabs.delete(site);
    }
  }

  const tab = await chrome.tabs.create({ url: cfg.url, active: false });
  siteTabs.set(site, tab.id);
  return tab.id;
}

// content script 可能尚未注入，带重试地发送消息
async function sendToTab(tabId, message, { retries = 25, delay = 800 } = {}) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (err) {
      lastErr = err;
      await sleep(delay);
    }
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
    case 'ping':
      return { pong: true };
    case 'fetch':
      return fetchText(params.url);

    case 'ai.open':
      return aiCall(params.site, 'state');
    case 'ai.state':
      return aiCall(params.site, 'state');
    case 'ai.login':
      return aiCall(params.site, 'login', {
        username: params.username,
        password: params.password,
        captcha: params.captcha,
      });
    case 'ai.chat':
      return aiCall(params.site, 'chat', { text: params.text, images: params.images || [] });
    case 'ai.newChat':
      return aiCall(params.site, 'newChat');
    case 'ai.reset': {
      const tabId = siteTabs.get(params.site);
      if (tabId != null) {
        await chrome.tabs.remove(tabId).catch(() => {});
        siteTabs.delete(params.site);
      }
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

// 用户手动关闭托管标签页时同步清理映射
chrome.tabs.onRemoved.addListener((tabId) => {
  for (const [site, id] of siteTabs.entries()) {
    if (id === tabId) siteTabs.delete(site);
  }
});