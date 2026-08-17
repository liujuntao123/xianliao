/**
 * Cloudflare Pages 适配器：Pages Functions 承载全部 /api/* 路由。
 * 静态 SPA 由 apps/web/dist 产出（build_command: pnpm build），未命中路径经
 * apps/web/public/_redirects 回退 index.html；/api/* 优先直通本函数。
 */
import { createApp, parseFeishuDomain } from '@xianji/core';

interface Env {
  ACCESS_KEY?: string;
  FEISHU_APP_ID?: string;
  FEISHU_APP_SECRET?: string;
  FEISHU_BASE_TOKEN?: string;
  FEISHU_DOMAIN?: string;
}

// 与 Workers 适配器一致：按环境变量组合缓存应用实例，配置变更即换实例
const appCache = new Map<string, ReturnType<typeof createApp>>();

function getApp(env: Env): ReturnType<typeof createApp> {
  const key = [env.ACCESS_KEY, env.FEISHU_APP_ID, env.FEISHU_APP_SECRET, env.FEISHU_BASE_TOKEN, env.FEISHU_DOMAIN].join('|');
  let app = appCache.get(key);
  if (!app) {
    app = createApp({
      accessKey: env.ACCESS_KEY ?? '',
      feishuAppId: env.FEISHU_APP_ID ?? '',
      feishuAppSecret: env.FEISHU_APP_SECRET ?? '',
      feishuBaseToken: env.FEISHU_BASE_TOKEN ?? '',
      feishuDomain: parseFeishuDomain(env.FEISHU_DOMAIN),
    });
    appCache.set(key, app);
  }
  return app;
}

export const onRequest = (ctx: { env: Env; request: Request }): Response =>
  getApp(ctx.env).fetch(ctx.request);
