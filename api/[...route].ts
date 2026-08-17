/**
 * Vercel 适配器：hono/vercel 把 Web 标准 Hono 应用转成 Vercel Node 函数的 (req, res) 处理器。
 * 静态 SPA 由 vercel.json 的 outputDirectory 提供，未命中路径回退 index.html（已排除 /api 前缀）。
 */
import { createApp, parseFeishuDomain } from '@xianji/core';
import { handle } from 'hono/vercel';

// Vercel 函数实例内 process.env 固定（每次部署生成新实例），模块级初始化即可
const app = createApp({
  accessKey: process.env.ACCESS_KEY ?? '',
  feishuAppId: process.env.FEISHU_APP_ID ?? '',
  feishuAppSecret: process.env.FEISHU_APP_SECRET ?? '',
  feishuBaseToken: process.env.FEISHU_BASE_TOKEN ?? '',
  feishuDomain: parseFeishuDomain(process.env.FEISHU_DOMAIN),
});

export default handle(app);
