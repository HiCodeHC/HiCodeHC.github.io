// 搜索引擎适配层：本机进程静默访问目标站点，解析结果页后返回结构化数据
// ---------------------------------------------------------------------------
// 每个引擎实现 web(query,page) 与 image(query,page)，返回统一结构：
//   web:   { title, url, snippet }
//   image: { title, thumbnail, image, page }
// 站点改版只需调整对应解析函数，不影响前端。
// ---------------------------------------------------------------------------
import axios from 'axios';
import * as cheerio from 'cheerio';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const http = axios.create({
  timeout: 20000,
  maxRedirects: 5,
  validateStatus: (s) => s >= 200 && s < 400,
  headers: {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  },
});

const get = async (url, opts = {}) => (await http.get(url, opts)).data;
const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

/* ------------------------------- Bing ------------------------------- */
function parseBingWeb(html) {
  const $ = cheerio.load(html);
  const out = [];
  $('li.b_algo').each((_, el) => {
    const a = $(el).find('h2 a').first();
    const url = a.attr('href') || '';
    const title = clean(a.text());
    let snippet = clean($(el).find('.b_caption p').first().text());
    if (!snippet) snippet = clean($(el).find('p').first().text());
    if (title && url) out.push({ title, url, snippet });
  });
  return out;
}
function parseBingImage(html) {
  const $ = cheerio.load(html);
  const out = [];
  $('a.iusc').each((_, el) => {
    const m = $(el).attr('m');
    if (!m) return;
    try {
      const j = JSON.parse(m);
      out.push({
        title: clean(j.t),
        thumbnail: j.turl || '',
        image: j.murl || j.turl || '',
        page: j.purl || '',
      });
    } catch {
      /* 忽略解析失败的条目 */
    }
  });
  return out;
}

/* ------------------------------- 百度 ------------------------------- */
function parseBaiduWeb(html) {
  const $ = cheerio.load(html);
  const out = [];
  $('#content_left .result, #content_left .result-op, .c-container').each((_, el) => {
    const a = $(el).find('h3 a').first();
    const url = a.attr('href') || '';
    const title = clean(a.text());
    let snippet = clean($(el).find('.c-abstract').first().text());
    if (!snippet) snippet = clean($(el).find('[class*="content-right"]').first().text());
    if (title && url) out.push({ title, url, snippet });
  });
  return out;
}
function parseBaiduImage(html) {
  // 百度图片结果以 JSON 片段内嵌在页面里，这里按键值就近提取
  const out = [];
  const re =
    /"(?:thumbURL|middleURL|hoverURL)"\s*:\s*"([^"]+)"[\s\S]{0,600}?/g;
  const items = html.split(/,\s*\{\s*"[\w]+":/);
  for (const chunk of items) {
    const thumb = (chunk.match(/"(?:thumbURL|middleURL|hoverURL)"\s*:\s*"([^"]+)"/) || [])[1];
    const full = (chunk.match(/"objURL"\s*:\s*"([^"]+)"/) || [])[1];
    const title = (chunk.match(/"fromPageTitleEnc"\s*:\s*"([^"]*)"/) || [])[1];
    const page = (chunk.match(/"fromURLHost"\s*:\s*"([^"]*)"/) || [])[1];
    if (thumb) {
      out.push({
        title: clean(decodeURIComponent(title || '')),
        thumbnail: thumb.replace(/\\\//g, '/'),
        image: (full ? decodeURIComponent(full) : thumb).replace(/\\\//g, '/'),
        page: page || '',
      });
    }
  }
  // 去重
  const seen = new Set();
  return out.filter((r) => {
    if (seen.has(r.thumbnail)) return false;
    seen.add(r.thumbnail);
    return true;
  });
}

/* ------------------------------- 搜狗 ------------------------------- */
function parseSogouWeb(html) {
  const $ = cheerio.load(html);
  const out = [];
  $('.vrwrap, .rb').each((_, el) => {
    const a = $(el).find('h3 a').first();
    const url = a.attr('href') || '';
    const title = clean(a.text());
    let snippet = clean($(el).find('.str-text-info, .space-txt, .fz-mid').first().text());
    if (title && url) out.push({ title, url, snippet });
  });
  return out;
}

/* ------------------------------ Google ------------------------------ */
function parseGoogleWeb(html) {
  const $ = cheerio.load(html);
  const out = [];
  $('div.g, div[data-sokoban-container]').each((_, el) => {
    const a = $(el).find('a').first();
    const url = a.attr('href') || '';
    const title = clean($(el).find('h3').first().text());
    const snippet = clean($(el).find('.VwiC3b, [data-sncf]').first().text());
    if (title && url && url.startsWith('http')) out.push({ title, url, snippet });
  });
  return out;
}

/* ---------------------------- DuckDuckGo ---------------------------- */
function parseDdgWeb(html) {
  const $ = cheerio.load(html);
  const out = [];
  $('.result, .web-result').each((_, el) => {
    const a = $(el).find('.result__a').first();
    let url = a.attr('href') || '';
    const title = clean(a.text());
    const snippet = clean($(el).find('.result__snippet').first().text());
    // DDG 使用跳转链接，抽取其中 uddg 参数
    const m = url.match(/uddg=([^&]+)/);
    if (m) url = decodeURIComponent(m[1]);
    if (title && url) out.push({ title, url, snippet });
  });
  return out;
}

/* ---------------------------- 引擎注册表 ---------------------------- */
const ENGINES = {
  bing: {
    label: 'Bing',
    supportsImage: true,
    web: async (q, page) =>
      parseBingWeb(await get(`https://cn.bing.com/search?q=${encodeURIComponent(q)}&first=${(page - 1) * 10 + 1}`)),
    image: async (q, page) =>
      parseBingImage(await get(`https://cn.bing.com/images/search?q=${encodeURIComponent(q)}&first=${(page - 1) * 35 + 1}`)),
  },
  baidu: {
    label: '百度',
    supportsImage: true,
    web: async (q, page) =>
      parseBaiduWeb(await get(`https://www.baidu.com/s?wd=${encodeURIComponent(q)}&pn=${(page - 1) * 10}`)),
    image: async (q, page) =>
      parseBaiduImage(await get(`https://image.baidu.com/search/index?tn=baiduimage&word=${encodeURIComponent(q)}&pn=${(page - 1) * 30}`)),
  },
  sogou: {
    label: '搜狗',
    supportsImage: false,
    web: async (q, page) =>
      parseSogouWeb(await get(`https://www.sogou.com/web?query=${encodeURIComponent(q)}&page=${page}`)),
  },
  google: {
    label: 'Google',
    supportsImage: false,
    web: async (q, page) =>
      parseGoogleWeb(await get(`https://www.google.com/search?q=${encodeURIComponent(q)}&start=${(page - 1) * 10}&num=10`)),
  },
  duckduckgo: {
    label: 'DuckDuckGo',
    supportsImage: false,
    web: async (q, page) =>
      parseDdgWeb(await get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`)),
  },
};

export function listEngines() {
  return Object.entries(ENGINES).map(([id, e]) => ({
    id,
    label: e.label,
    supportsWeb: !!e.web,
    supportsImage: !!e.image && e.supportsImage,
  }));
}

export async function search({ engine, query, type, page = 1 }) {
  const eng = ENGINES[engine];
  if (!eng) throw new Error(`未知引擎：${engine}`);
  const fn = type === 'image' ? eng.image : eng.web;
  if (!fn) throw new Error(`${eng.label} 不支持${type === 'image' ? '图片' : '网页'}搜索`);
  const results = await fn(query, page);
  return results.map((r) => ({ ...r, engine }));
}