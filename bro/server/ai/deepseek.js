// DeepSeek 站点适配：与 Kimi 同构，本机进程静默访问，前端收信息、本机同步填入
// ---------------------------------------------------------------------------
// 前端地址栏始终停留在 bro 页面（不跳转、不暴露目标）。
// 登录态保存在 server/ai/profiles/deepseek/。
// ---------------------------------------------------------------------------
import express from 'express';
import { createSiteRouter } from './session.js';

export const deepseekConfig = {
  label: 'DeepSeek',
  model: 'DeepSeek 默认模型',
  homeUrl: 'https://chat.deepseek.com/',
  loginUrl: 'https://chat.deepseek.com/',
  chatUrl: 'https://chat.deepseek.com/',

  loggedIn: [
    'textarea#chat-input',
    'textarea[placeholder]',
    'div[contenteditable="true"]',
  ],

  login: {
    username: [
      'input[type="text"]',
      'input[name="email"]',
      'input[placeholder*="手机"]',
      'input[placeholder*="邮箱"]',
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
    ],
    submit: [
      'div[class*="login"] button',
      'button[type="submit"]',
      'button:has-text("登录")',
    ],
  },

  chat: {
    input: [
      'textarea#chat-input',
      'textarea[placeholder]',
      'div[contenteditable="true"]',
    ],
    send: [
      'div[role="button"][class*="send"]',
      'button[class*="send"]',
      'div[class*="send-btn"]',
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
      'div.ds-markdown',
      'div[class*="markdown"]',
      'div[class*="assistant"]',
    ],
  },
};

export const deepseekRouter = createSiteRouter(express, 'deepseek', deepseekConfig);