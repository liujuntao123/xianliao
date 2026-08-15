/**
 * Node 适配器（Docker / 自托管）：单进程同时托管 API 与前端静态文件。
 * 零本地持久化：唯一状态是环境变量（ADR-0001/0004）。
 */
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { createApp, parseFeishuDomain } from '@xianji/core';

loadDotenv({ quiet: true });

const port = Number(process.env.PORT ?? 3000);

const app = createApp({
  accessKey: process.env.ACCESS_KEY ?? '',
  feishuAppId: process.env.FEISHU_APP_ID ?? '',
  feishuAppSecret: process.env.FEISHU_APP_SECRET ?? '',
  feishuBaseToken: process.env.FEISHU_BASE_TOKEN ?? '',
  feishuDomain: parseFeishuDomain(process.env.FEISHU_DOMAIN),
});

const root = new Hono();

// API
root.route('/', app);

// 前端静态文件（SPA fallback 到 index.html）
const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url));
if (existsSync(webDist)) {
  root.use('*', serveStatic({ root: webDist }));
  root.get('*', serveStatic({ root: webDist, path: '/index.html' }));
} else {
  root.get('/', (c) =>
    c.text('前端尚未构建：请先运行 pnpm build（或使用已包含构建产物的镜像）', 503),
  );
}

serve({ fetch: root.fetch, port }, (info) => {
  console.log(`[xianji] listening on http://localhost:${info.port}`);
  if (!process.env.ACCESS_KEY) {
    console.warn('[xianji] 警告：未设置 ACCESS_KEY，API 将全部拒绝服务');
  }
});

export { app };
