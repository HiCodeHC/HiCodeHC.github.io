/* bro 搜索引擎适配层（纯前端）
 * ---------------------------------------------------------------------------
 * 只负责两件事：拼出目标结果页地址、把抓回来的 HTML 解析成结构化数据。
 * 真正的“跨域抓取”由浏览器扩展完成（host_permissions），这里不做网络请求。
 */
window.BRO_ENGINES = (() => {
  'use strict';

  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const parse = (html) => new DOMParser().parseFromString(html || '', 'text/html');

  /* ------------------------------- Bing ------------------------------- */
  function bingWeb(doc) {
    const out = [];
    doc.querySelectorAll('li.b_algo').forEach((li) => {
      const a = li.querySelector('h2 a');
      const url = a?.getAttribute('href') || '';
      const title = clean(a?.textContent);
      let snippet = clean(li.querySelector('.b_caption p')?.textContent);
      if (!snippet) snippet = clean(li.querySelector('p')?.textContent);
      if (title && url) out.push({ title, url, snippet });
    });
    return out;
  }
  function bingImage(doc) {
    const out = [];
    doc.querySelectorAll('a.iusc').forEach((a) => {
      const raw = a.getAttribute('m');
      if (!raw) return;
      try {
        const j = JSON.parse(raw);
        out.push({
          title: clean(j.t),
          thumbnail: j.turl || '',
          image: j.murl || j.turl || '',
          page: j.purl || '',
        });
      } catch (_) { /* 忽略单条解析失败 */ }
    });
    return out;
  }

  /* ------------------------------- 百度 ------------------------------- */
  function baiduWeb(doc) {
    const out = [];
    doc.querySelectorAll('#content_left .result, #content_left .result-op, .c-container').forEach((el) => {
      const a = el.querySelector('h3 a');
      const url = a?.getAttribute('href') || '';
      const title = clean(a?.textContent);
      let snippet = clean(el.querySelector('.c-abstract')?.textContent);
      if (!snippet) snippet = clean(el.querySelector('[class*="content-right"]')?.textContent);
      if (title && url) out.push({ title, url, snippet });
    });
    return out;
  }
  function baiduImage(_doc, html) {
    // 百度图片结果内嵌在页面脚本中，按键值就近提取
    const out = [];
    const chunks = String(html).split(/,\s*\{\s*"[\w]+":/);
    for (const chunk of chunks) {
      const thumb = (chunk.match(/"(?:thumbURL|middleURL|hoverURL)"\s*:\s*"([^"]+)"/) || [])[1];
      const full = (chunk.match(/"objURL"\s*:\s*"([^"]+)"/) || [])[1];
      const title = (chunk.match(/"fromPageTitleEnc"\s*:\s*"([^"]*)"/) || [])[1];
      const host = (chunk.match(/"fromURLHost"\s*:\s*"([^"]*)"/) || [])[1];
      if (!thumb) continue;
      out.push({
        title: clean(safeDecode(title)),
        thumbnail: thumb.replace(/\\\//g, '/'),
        image: (full ? safeDecode(full) : thumb).replace(/\\\//g, '/'),
        page: host || '',
      });
    }
    const seen = new Set();
    return out.filter((r) => (seen.has(r.thumbnail) ? false : (seen.add(r.thumbnail), true)));
  }
  function safeDecode(s) {
    try { return decodeURIComponent(s || ''); } catch { return s || ''; }
  }

  /* ------------------------------- 搜狗 ------------------------------- */
  function sogouWeb(doc) {
    const out = [];
    doc.querySelectorAll('.vrwrap, .rb').forEach((el) => {
      const a = el.querySelector('h3 a');
      const url = a?.getAttribute('href') || '';
      const title = clean(a?.textContent);
      const snippet = clean(el.querySelector('.str-text-info, .space-txt, .fz-mid')?.textContent);
      if (title && url) out.push({ title, url, snippet });
    });
    return out;
  }

  /* ------------------------------ Google ------------------------------ */
  function googleWeb(doc) {
    const out = [];
    doc.querySelectorAll('div.g, div[data-sokoban-container]').forEach((el) => {
      const a = el.querySelector('a');
      const url = a?.getAttribute('href') || '';
      const title = clean(el.querySelector('h3')?.textContent);
      const snippet = clean(el.querySelector('.VwiC3b, [data-sncf]')?.textContent);
      if (title && url.startsWith('http')) out.push({ title, url, snippet });
    });
    return out;
  }

  /* ---------------------------- DuckDuckGo ---------------------------- */
  function ddgWeb(doc) {
    const out = [];
    doc.querySelectorAll('.result, .web-result').forEach((el) => {
      const a = el.querySelector('.result__a');
      let url = a?.getAttribute('href') || '';
      const title = clean(a?.textContent);
      const snippet = clean(el.querySelector('.result__snippet')?.textContent);
      const m = url.match(/uddg=([^&]+)/);
      if (m) url = safeDecode(m[1]);
      if (title && url) out.push({ title, url, snippet });
    });
    return out;
  }

  const ENGINES = {
    bing: {
      label: 'Bing',
      supportsImage: true,
      webUrl: (q, p) => `https://cn.bing.com/search?q=${encodeURIComponent(q)}&first=${(p - 1) * 10 + 1}`,
      imageUrl: (q, p) => `https://cn.bing.com/images/search?q=${encodeURIComponent(q)}&first=${(p - 1) * 35 + 1}`,
      web: (doc) => bingWeb(doc),
      image: (doc) => bingImage(doc),
    },
    baidu: {
      label: '百度',
      supportsImage: true,
      webUrl: (q, p) => `https://www.baidu.com/s?wd=${encodeURIComponent(q)}&pn=${(p - 1) * 10}`,
      imageUrl: (q, p) => `https://image.baidu.com/search/index?tn=baiduimage&word=${encodeURIComponent(q)}&pn=${(p - 1) * 30}`,
      web: (doc) => baiduWeb(doc),
      image: (doc, html) => baiduImage(doc, html),
    },
    sogou: {
      label: '搜狗',
      supportsImage: false,
      webUrl: (q, p) => `https://www.sogou.com/web?query=${encodeURIComponent(q)}&page=${p}`,
      web: (doc) => sogouWeb(doc),
    },
    google: {
      label: 'Google',
      supportsImage: false,
      webUrl: (q, p) => `https://www.google.com/search?q=${encodeURIComponent(q)}&start=${(p - 1) * 10}&num=10`,
      web: (doc) => googleWeb(doc),
    },
    duckduckgo: {
      label: 'DuckDuckGo',
      supportsImage: false,
      webUrl: (q) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
      web: (doc) => ddgWeb(doc),
    },
  };

  return {
    ENGINES,
    list() {
      return Object.entries(ENGINES).map(([id, e]) => ({
        id,
        label: e.label,
        supportsWeb: !!e.web,
        supportsImage: !!e.image && e.supportsImage,
      }));
    },
    // 返回结果页地址
    url(id, query, type, page = 1) {
      const e = ENGINES[id];
      if (!e) throw new Error(`未知引擎：${id}`);
      const build = type === 'image' ? e.imageUrl : e.webUrl;
      if (!build) throw new Error(`${e.label} 不支持${type === 'image' ? '图片' : '网页'}搜索`);
      return build(query, page);
    },
    // 解析抓回来的 HTML
    parse(id, type, html) {
      const e = ENGINES[id];
      const fn = type === 'image' ? e.image : e.web;
      if (!fn) throw new Error(`${e.label} 不支持该类型`);
      return fn(parse(html), html).map((r) => ({ ...r, engine: id }));
    },
  };
})();