/**
 * Cloudflare Workers 适配器：worker 处理 /api/*，其余路径由
 * Workers Static Assets 直接服务 SPA（not_found_handling: single-page-application）。
 */
import { createApp, parseFeishuDomain } from '@xianji/core';

export interface Env {
  ACCESS_KEY?: string;
  FEISHU_APP_ID?: string;
  FEISHU_APP_SECRET?: string;
  FEISHU_BASE_TOKEN?: string;
  FEISHU_DOMAIN?: string;
}

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

export default {
  fetch(request: Request, env: Env): Response {
    return getApp(env).fetch(request);
  },
};
