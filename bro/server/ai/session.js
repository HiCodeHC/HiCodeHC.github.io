// 本机自动化会话：用一个真实的（无头）浏览器在本机后台静默访问目标站点
// ---------------------------------------------------------------------------
// 全部在本机运行：浏览器实例、用户资料（登录态）都保存在本机 server/ai/profiles/ 下。
// 站点结构的差异集中在各站点模块的 selectors 配置里，改版时只需调整选择器。
// ---------------------------------------------------------------------------
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILES_DIR = path.resolve(__dirname, 'profiles');

const sessions = new Map();

export function launchArgs() {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--window-size=1280,900',
  ];
  const proxy = process.env.BRO_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (proxy) args.push(`--proxy-server=${proxy}`);
  return args;
}

export class Session {
  constructor(key, config) {
    this.key = key;
    this.config = config;
    this.browser = null;
    this.page = null;
    this.lastReply = '';
  }

  profileDir() {
    const dir = path.join(PROFILES_DIR, this.key);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  async ensure() {
    if (this.page && !this.page.isClosed()) return this.page;
    // 动态加载，避免未安装 puppeteer 时连搜索功能都无法启动
    const puppeteer = (await import('puppeteer')).default;
    this.browser = await puppeteer.launch({
      headless: process.env.BRO_HEADED === '1' ? false : 'new',
      args: launchArgs(),
      userDataDir: this.profileDir(),
      defaultViewport: { width: 1280, height: 900 },
    });
    const pages = await this.browser.pages();
    this.page = pages[0] || (await this.browser.newPage());
    return this.page;
  }

  async goto(url) {
    const page = await this.ensure();
    await page
      .goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
      .catch(() => {});
    await sleep(1500);
    return page;
  }

  async close() {
    if (this.browser) await this.browser.close().catch(() => {});
    this.browser = null;
    this.page = null;
  }
}

export function getSession(key, config) {
  if (!sessions.has(key)) sessions.set(key, new Session(key, config));
  return sessions.get(key);
}

export async function closeAll() {
  for (const s of sessions.values()) await s.close();
  sessions.clear();
}

/* --------------------------- 通用小工具 --------------------------- */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 依次尝试多个候选选择器，返回第一个存在的选择器字符串
async function resolve(page, selectors = []) {
  for (const sel of selectors) {
    const el = await page.$(sel).catch(() => null);
    if (el) return { sel, el };
  }
  return null;
}

export async function existsAny(page, selectors = []) {
  return !!(await resolve(page, selectors));
}

export async function typeAny(page, selectors, text) {
  const found = await resolve(page, selectors);
  if (!found) throw new Error(`未找到输入框，候选选择器：${selectors.join(', ')}`);
  await found.el.click({ clickCount: 3 }).catch(() => {});
  await found.el.type(String(text), { delay: 30 });
  return true;
}

export async function clickAny(page, selectors) {
  const found = await resolve(page, selectors);
  if (!found) throw new Error(`未找到可点击元素，候选选择器：${selectors.join(', ')}`);
  await found.el.click().catch(async () => {
    await page.evaluate((s) => document.querySelector(s)?.click(), found.sel);
  });
  return true;
}

export async function readText(page, selectors) {
  const found = await resolve(page, selectors);
  if (!found) return '';
  return (await found.el.evaluate((n) => n.innerText || n.textContent || '')).trim();
}

// 截取验证码等元素的图片，返回 dataURL
export async function shootElement(page, selectors) {
  const found = await resolve(page, selectors);
  if (!found) return null;
  const buf = await found.el.screenshot({ type: 'png' }).catch(() => null);
  return buf ? `data:image/png;base64,${buf.toString('base64')}` : null;
}

// 等待页面中某个候选容器里的文本趋于稳定，返回该文本（用于读取模型回答）
export async function waitForAnswer(page, selectors, { timeout = 120000, quiet = 1500 } = {}) {
  const start = Date.now();
  let last = '';
  let lastChange = Date.now();
  while (Date.now() - start < timeout) {
    const found = await resolve(page, selectors).catch(() => null);
    const text = found
      ? (await found.el.evaluate((n) => n.innerText || n.textContent || '')).trim()
      : '';
    if (text && text !== last) {
      last = text;
      lastChange = Date.now();
    }
    if (last && Date.now() - lastChange > quiet) return last;
    await sleep(400);
  }
  return last;
}

// 把 dataURL 图片落盘，供 <input type=file> 上传使用
export function saveDataUrlImages(images = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bro-'));
  const files = [];
  images.forEach((dataUrl, i) => {
    const m = /^data:(image\/[\w.+-]+);base64,(.+)$/.exec(dataUrl || '');
    if (!m) return;
    const ext = m[1].split('/')[1].replace('jpeg', 'jpg');
    const file = path.join(dir, `img-${i}.${ext}`);
    fs.writeFileSync(file, Buffer.from(m[2], 'base64'));
    files.push(file);
  });
  return files;
}

/* ---------------------- 基于配置的站点路由 ---------------------- */
export function createSiteRouter(express, siteKey, config) {
  const router = express.Router();
  const session = () => getSession(siteKey, config);

  // 打开首页/登录页并反馈当前状态
  router.post('/start', async (_req, res) => {
    try {
      const s = session();
      const page = await s.goto(config.loginUrl || config.homeUrl);
      // 有些站点需要先点“登录”按钮才出现表单
      if (config.login?.open && !(await existsAny(page, config.login.username))) {
        await clickAny(page, config.login.open).catch(() => {});
        await sleep(1200);
      }
      res.json(await stateOf(page, config));
    } catch (err) {
      res.status(500).json({ error: String(err?.message || err) });
    }
  });

  router.get('/state', async (_req, res) => {
    try {
      const s = session();
      if (!s.page || s.page.isClosed()) return res.json({ ready: false, loggedIn: false });
      res.json(await stateOf(s.page, config));
    } catch (err) {
      res.status(500).json({ error: String(err?.message || err) });
    }
  });

  // 前端提交账号/密码/验证码，本机进程同步填入目标站点并提交
  router.post('/login', async (req, res) => {
    const { username = '', password = '', captcha = '' } = req.body || {};
    try {
      const s = session();
      const page = await s.ensure();
      await typeAny(page, config.login.username, username);
      if (password && config.login.password) await typeAny(page, config.login.password, password);
      if (captcha && config.login.captchaInput) await typeAny(page, config.login.captchaInput, captcha);
      await clickAny(page, config.login.submit);
      await sleep(3500);
      res.json(await stateOf(page, config));
    } catch (err) {
      res.status(500).json({ error: String(err?.message || err) });
    }
  });

  // 发送提问（可含图片）
  router.post('/chat', async (req, res) => {
    const { text = '', images = [] } = req.body || {};
    try {
      const s = session();
      const page = await s.ensure();
      if (page.url() !== config.chatUrl && !page.url().startsWith(config.chatUrl)) {
        await s.goto(config.chatUrl);
      }
      // 上传图片
      if (images.length && config.chat.upload) {
        const handle = await resolve(page, config.chat.upload);
        if (handle) {
          const input = await handle.el.evaluateHandle((n) => n);
          await input.asElement().uploadFile(...saveDataUrlImages(images));
          await sleep(1500);
        }
      }
      // 输入并发送
      await typeAny(page, config.chat.input, text);
      await sleep(300);
      await clickAny(page, config.chat.send).catch(async () => {
        await page.keyboard.press('Enter');
      });
      const reply = await waitForAnswer(page, config.chat.answer, {
        timeout: Number(process.env.BRO_ANSWER_TIMEOUT || 120000),
      });
      res.json({ reply });
    } catch (err) {
      res.status(500).json({ error: String(err?.message || err) });
    }
  });

  router.post('/newChat', async (_req, res) => {
    try {
      const s = session();
      const page = await s.ensure();
      await s.goto(config.chatUrl);
      if (config.chat.newChat) await clickAny(page, config.chat.newChat).catch(() => {});
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: String(err?.message || err) });
    }
  });

  router.post('/reset', async (_req, res) => {
    try {
      await session().close();
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: String(err?.message || err) });
    }
  });

  return router;
}

async function stateOf(page, config) {
  const loggedIn = await existsAny(page, config.loggedIn || []);
  let captcha = null;
  let needCaptcha = false;
  if (!loggedIn && config.login?.captchaImg) {
    captcha = await shootElement(page, config.login.captchaImg);
    needCaptcha = !!captcha;
  }
  return {
    ready: true,
    loggedIn,
    needCaptcha,
    captcha,
    model: config.model || null,
    url: page.url(),
  };
}