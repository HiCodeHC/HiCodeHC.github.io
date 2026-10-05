// bro 本地静默访问服务
// ---------------------------------------------------------------------------
// 该进程运行在“用户自己的设备”上（localhost），只对本机提供接口：
//   1) 代前端静默访问搜索引擎，读取结果页并解析后返回给前端；
//   2) 代前端静默访问 Kimi / DeepSeek，完成登录后代理对话（图片+提问）。
// 它不向任何第三方转发用户凭据，凭据仅在“本机浏览器 <-> 本机进程 <-> 目标站点”之间流转。
// ---------------------------------------------------------------------------
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { search, listEngines } from './search.js';
import { kimiRouter } from './ai/kimi.js';
import { deepseekRouter } from './ai/deepseek.js';
import { closeAll } from './ai/session.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.BRO_PORT || 8787);
const HOST = process.env.BRO_HOST || '127.0.0.1';

const app = express();

// 允许“公网页面（如 GitHub Pages）-> 本机地址”的跨域请求。
// Chrome 的 Private Network Access 要求此类预检请求返回 Access-Control-Allow-Private-Network，
// 否则浏览器会直接拦截，前端表现为 “Failed to fetch”（即抓取失败）。
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  next();
});
const corsOptions = {
  origin: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));               // 显式响应预检请求
app.use(express.json({ limit: '30mb' }));          // 图片以 dataURL 传输

// 本机服务同时也直接托管前端页面：浏览器打开 http://127.0.0.1:8787/ 即可使用
app.use(express.static(path.resolve(__dirname, '..')));

app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.get('/api/engines', (_req, res) => res.json({ engines: listEngines() }));

// 搜索：前端把 engine/关键词/类型交给本机进程，本机进程静默抓取并解析
app.get('/api/search', async (req, res) => {
  const engine = String(req.query.engine || 'bing');
  const query = String(req.query.q || '').trim();
  const type = String(req.query.type || 'web');
  const page = Math.max(1, Number(req.query.page) || 1);

  if (!query) return res.status(400).json({ error: '搜索词为空' });
  try {
    const results = await search({ engine, query, type, page });
    res.json({ engine, type, query, page, count: results.length, results });
  } catch (err) {
    res.status(502).json({ error: `抓取失败：${err?.message || err}` });
  }
});

app.use('/api/kimi', kimiRouter);
app.use('/api/deepseek', deepseekRouter);

const server = app.listen(PORT, HOST, () => {
  console.log(`\n[bro] 本地服务已启动：http://${HOST}:${PORT}`);
  console.log(`[bro] 直接使用：浏览器打开上面的地址；或从 GitHub Pages 打开页面，前端会自动连接本机服务。\n`);
});

async function shutdown() {
  await closeAll().catch(() => {});
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);