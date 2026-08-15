import { afterEach, describe, expect, it, vi } from 'vitest';
import { gunzipSync } from 'node:zlib';
import { beginRegistration, pollRegistration } from '../src/feishu/device-flow';

function mockFetch(handler: (url: string, body: string) => unknown) {
  const calls: Array<{ url: string; body: string }> = [];
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = String(init?.body ?? '');
    calls.push({ url, body });
    const res = handler(url, body);
    return new Response(JSON.stringify(res), { status: 200 });
  });
  vi.stubGlobal('fetch', spy);
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('Device Flow（一键创建智能体应用）', () => {
  it('begin 生成含全部预设参数的二维码 URL', async () => {
    const calls = mockFetch(() => ({
      device_code: 'DEV123',
      verification_uri_complete: 'https://open.feishu.cn/page/launcher?user_code=ABCD-1234',
      interval: 7,
      expires_in: 600,
    }));

    const r = await beginRegistration('feishu');
    expect(r.deviceCode).toBe('DEV123');
    expect(r.interval).toBe(7);
    expect(r.domain).toBe('feishu');

    const u = new URL(r.qrUrl);
    expect(u.pathname).toBe('/page/launcher');
    expect(u.searchParams.get('user_code')).toBe('ABCD-1234');
    expect(u.searchParams.get('from')).toBe('sdk');
    expect(u.searchParams.get('source')).toBe('xianji');
    expect(u.searchParams.get('tp')).toBe('sdk');
    expect(u.searchParams.get('name')).toBe('闲记');
    expect(u.searchParams.get('createOnly')).toBe('true');

    // addons 常量必须解出「最小基座 + bitable 权限」（编码：JSON → gzip → base64url）
    const addonsB64 = u.searchParams.get('addons')!;
    const json = JSON.parse(
      gunzipSync(
        Buffer.from(
          addonsB64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (addonsB64.length % 4)) % 4),
          'base64',
        ),
      ).toString('utf8'),
    );
    expect(json).toEqual({
      preset: false,
      scopes: { tenant: ['bitable:app', 'drive:drive.metadata:readonly'] },
    });

    // 请求体：begin 参数
    expect(calls[0]?.body).toContain('action=begin');
    expect(calls[0]?.body).toContain('archetype=PersonalAgent');
    expect(calls[0]?.body).toContain('auth_method=client_secret');
    expect(calls[0]?.url).toBe('https://accounts.feishu.cn/oauth/v1/app/registration');
  });

  it('poll：pending', async () => {
    mockFetch(() => ({ error: 'authorization_pending' }));
    const r = await pollRegistration('feishu', 'DEV');
    expect(r.status).toBe('pending');
  });

  it('poll：success 返回凭证与 open_id', async () => {
    mockFetch(() => ({
      client_id: 'cli_xxx',
      client_secret: 'sec',
      user_info: { open_id: 'ou_1', tenant_brand: 'feishu' },
    }));
    const r = await pollRegistration('feishu', 'DEV');
    expect(r.status).toBe('success');
    expect(r.success).toEqual({ appId: 'cli_xxx', appSecret: 'sec', openId: 'ou_1', brand: 'feishu' });
  });

  it('poll：lark 租户触发域名切换', async () => {
    mockFetch(() => ({ user_info: { tenant_brand: 'lark' } }));
    const r = await pollRegistration('feishu', 'DEV');
    expect(r.status).toBe('pending');
    expect(r.domainSwitched).toBe('lark');
  });

  it('poll：access_denied / expired_token 为终态错误', async () => {
    mockFetch(() => ({ error: 'access_denied', error_description: 'denied by user' }));
    const r = await pollRegistration('feishu', 'DEV');
    expect(r.status).toBe('error');
    expect(r.errorCode).toBe('access_denied');
  });
});
