// Kimi 站点适配：本机进程静默访问 Kimi，前端负责收账号/密码/验证码，本机同步填入
// ---------------------------------------------------------------------------
// 默认模型：K2.6 普通（不推理）。登录态保存在 server/ai/profiles/kimi/。
// 说明：站点前端会不定期改版，下面的 selectors 采用“多候选”方式，改版后按注释增补即可。
// ---------------------------------------------------------------------------
import express from 'express';
import { createSiteRouter } from './session.js';

export const kimiConfig = {
  label: 'Kimi',
  model: 'K2.6 普通（不推理）',
  homeUrl: 'https://www.kimi.com/',
  loginUrl: 'https://www.kimi.com/',
  chatUrl: 'https://www.kimi.com/',

  // 已登录的标志（页面出现聊天输入框即视为已登录）
  loggedIn: [
    'div.chat-input-editor[contenteditable="true"]',
    'div[contenteditable="true"]',
    'textarea[placeholder]',
  ],

  login: {
    // 需要先点“登录”才弹出表单
    open: [
      'button:has-text("登录")',
      'div[class*="login"] button',
      'button[class*="login"]',
    ],
    username: [
      'input[type="tel"]',
      'input[placeholder*="手机"]',
      'input[placeholder*="邮箱"]',
      'input[name="mobile"]',
      'input[type="text"]',
    ],
    password: [
      'input[type="password"]',
      'input[placeholder*="密码"]',
    ],
    captchaImg: [
      'img[alt*="验证码"]',
      'img[class*="captcha"]',
      '[class*="captcha"] img',
    ],
    captchaInput: [
      'input[placeholder*="验证码"]',
      'input[name*="captcha"]',
      'input[class*="captcha"]',
    ],
    submit: [
      'button[type="submit"]',
      'button:has-text("登录")',
      'div[class*="submit"]',
    ],
  },

  chat: {
    input: [
      'div.chat-input-editor[contenteditable="true"]',
      'div[contenteditable="true"]',
      'textarea[placeholder]',
    ],
    send: [
      'div[class*="send-button"]',
      'button[class*="send"]',
      'button[aria-label*="发送"]',
    ],
    upload: [
      'input[type="file"][accept*="image"]',
      'input[type="file"]',
    ],
    newChat: [
      'div[class*="new-chat"]',
      'button:has-text("新建")',
    ],
    answer: [
      'div[class*="segment-assistant"]',
      'div[class*="markdown"]',
      'div[class*="assistant"]',
    ],
  },
};

export const kimiRouter = createSiteRouter(express, 'kimi', kimiConfig);