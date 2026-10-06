// bro bridge —— Offscreen 文档（无界面后台抓取）
// ---------------------------------------------------------------------------
// 整个文档在浏览器内完全静默运行：
//   - 不在标签栏出现任何条目
//   - 不抢占用户焦点、不弹任何窗口
//   - 带上扩展身份的 Cookie 与完整 UA，真实加载目标结果页并等待其渲染完成
// 作用：解决搜索引擎（百度安全验证、必应 JS 校验等）拦截 Service Worker 裸 fetch 的问题。
// ---------------------------------------------------------------------------

let seq = 0;
const pending = new Map();

// 消息通道：Service Worker <-> Offscreen 文档
//   发:  { channel, dir:'req', id, method:'fetch', params:{ url, timeout, settle } }
//   回:  { channel, dir:'res', id, ok:true/false, data/error }
const CHANNEL = 'bro-offscreen-v1';

async function fetchAndRender({ url, timeout = 20000, settle = 600 }) {
  // 在 Offscreen 上下文中 fetch，会自带扩展身份的 Cookie 与完整 UA
  const res = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    redirect: 'follow',
    cache: 'no-store',
    headers: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'User-Agent': navigator.userAgent,
    },
  });

  // 拿到文档后，把它写入当前 Offscreen 文档以便浏览器引擎完成渲染
  const html = await res.text();
  document.open();
  document.write(html);
  document.close();

  // 等待渲染完成
  const waitLoad = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Offscreen 页面渲染超时')), timeout);
    const check = () => {
      if (document.readyState === 'complete') {
        clearTimeout(timer);
        resolve();
      } else {
        setTimeout(check, 80);
      }
    };
    check();
  });
  await waitLoad;
  await new Promise((r) => setTimeout(r, settle)); // 再等结果 DOM 稳定

  return {
    status: res.status,
    finalUrl: res.url,
    text: document.documentElement.outerHTML,
  };
}

self.addEventListener('message', async (ev) => {
  const msg = ev.data;
  if (!msg || msg.channel !== CHANNEL || msg.dir !== 'req') return;

  const id = msg.id;
  if (msg.method !== 'fetch') {
    self.postMessage({ channel: CHANNEL, dir: 'res', id, ok: false, error: `Offscreen 未知方法：${msg.method}` });
    return;
  }

  try {
    const data = await fetchAndRender(msg.params || {});
    self.postMessage({ channel: CHANNEL, dir: 'res', id, ok: true, data });
  } catch (err) {
    self.postMessage({ channel: CHANNEL, dir: 'res', id, ok: false, error: String(err?.message || err) });
  }
});

// 就绪时告知 Service Worker
chrome.runtime.sendMessage({ channel: CHANNEL, dir: 'ready' });
