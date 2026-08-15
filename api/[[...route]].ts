/**
 * Vercel 适配器：catch-all 函数承载全部 /api/* 路由。
 * 静态 SPA 由 vercel.json 的 outputDirectory 提供，未命中路径回退 index.html。
 */
import { createApp, parseFeishuDomain } from '@xianji/core';

const app = createApp({
  accessKey: process.env.ACCESS_KEY ?? '',
  feishuAppId: process.env.FEISHU_APP_ID ?? '',
  feishuAppSecret: process.env.FEISHU_APP_SECRET ?? '',
  feishuBaseToken: process.env.FEISHU_BASE_TOKEN ?? '',
  feishuDomain: parseFeishuDomain(process.env.FEISHU_DOMAIN),
});

export default app.fetch;
