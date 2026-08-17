/**
 * Vercel 适配器：catch-all 函数承载全部 /api/* 路由。
 * Vercel Node 运行时对默认导出按老式 (req, res) 签名调用；Web 标准 (Request) => Response
 * 必须用命名导出（GET/POST/...），故将 Hono 应用按方法逐一导出。
 * 静态 SPA 由 vercel.json 的 outputDirectory 提供，未命中路径回退 index.html（已排除 /api 前缀）。
 */
import { createApp, parseFeishuDomain } from '@xianji/core';

// Vercel 函数实例内 process.env 固定（每次部署生成新实例），模块级初始化即可
const app = createApp({
  accessKey: process.env.ACCESS_KEY ?? '',
  feishuAppId: process.env.FEISHU_APP_ID ?? '',
  feishuAppSecret: process.env.FEISHU_APP_SECRET ?? '',
  feishuBaseToken: process.env.FEISHU_BASE_TOKEN ?? '',
  feishuDomain: parseFeishuDomain(process.env.FEISHU_DOMAIN),
});

export const GET = app.fetch;
export const POST = app.fetch;
export const PUT = app.fetch;
export const PATCH = app.fetch;
export const DELETE = app.fetch;
export const HEAD = app.fetch;
