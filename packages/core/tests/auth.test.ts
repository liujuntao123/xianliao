import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';

const cfg = {
  accessKey: 'test-key-123',
  feishuAppId: '',
  feishuAppSecret: '',
  feishuBaseToken: '',
  feishuDomain: 'feishu' as const,
};

const app = createApp(cfg);

describe('鉴权（Q7）', () => {
  it('健康检查无需鉴权', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('缺少 Authorization 返回 401', async () => {
    const res = await app.request('/api/setup/status');
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('密钥无效');
  });

  it('错误密钥返回 401', async () => {
    const res = await app.request('/api/setup/status', {
      headers: { Authorization: 'Bearer wrong' },
    });
    expect(res.status).toBe(401);
  });

  it('正确密钥通过，status 返回未配置状态', async () => {
    const res = await app.request('/api/setup/status', {
      headers: { Authorization: 'Bearer test-key-123' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { feishu: { appIdSet: boolean } };
    expect(body.feishu.appIdSet).toBe(false);
  });

  it('数据面在缺飞书凭证时返回 409 引导向导', async () => {
    const res = await app.request('/api/data', {
      headers: { Authorization: 'Bearer test-key-123' },
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('首启向导');
  });

  it('ACCESS_KEY 未设置时全部 503', async () => {
    const noKey = createApp({ ...cfg, accessKey: '' });
    const res = await noKey.request('/api/data', {
      headers: { Authorization: 'Bearer anything' },
    });
    expect(res.status).toBe(503);
    // 健康检查仍然可用
    expect((await noKey.request('/api/health')).status).toBe(200);
  });

  it('未知 API 路径返回 404 JSON', async () => {
    const res = await app.request('/api/nope', {
      headers: { Authorization: 'Bearer test-key-123' },
    });
    expect(res.status).toBe(404);
  });
});
