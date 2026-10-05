// bro bridge —— 注入到 bro 页面的内容脚本
// ---------------------------------------------------------------------------
// 作用：在“网页”和“扩展后台”之间转发消息。
// 页面通过 window.postMessage 发请求，这里转交 service worker，再把结果回传页面。
// ---------------------------------------------------------------------------
(() => {
  const CHANNEL = 'bro-bridge-v1';

  window.addEventListener('message', async (ev) => {
    if (ev.source !== window) return;
    if (ev.origin && ev.origin !== location.origin && ev.origin !== 'null') return;
    const msg = ev.data;
    if (!msg || msg.channel !== CHANNEL || msg.dir !== 'req') return;

    try {
      const res = await chrome.runtime.sendMessage({
        type: 'bro',
        method: msg.method,
        params: msg.params || {},
      });
      if (res && res.ok) {
        window.postMessage({ channel: CHANNEL, dir: 'res', id: msg.id, ok: true, data: res.data }, location.origin);
      } else {
        window.postMessage(
          { channel: CHANNEL, dir: 'res', id: msg.id, ok: false, error: res?.error || '扩展返回错误' },
          location.origin
        );
      }
    } catch (err) {
      window.postMessage(
        { channel: CHANNEL, dir: 'res', id: msg.id, ok: false, error: String(err?.message || err) },
        location.origin
      );
    }
  });

  // 告知页面：扩展已就绪
  window.postMessage({ channel: CHANNEL, dir: 'ready' }, location.origin);
})();