/**
 * FeishuClient 瞬时错误自动重试：
 *  - 2200/1254002/99991400 与网络异常/5xx 自动重试（最多 3 次尝试）
 *  - 非瞬时错误（凭证/权限类）不重试，快速失败
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { FeishuClient, forgetTokenCache } from '../src/feishu/client';
import { AppError } from '../src/types';

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

// Response body 只能读一次，必须每次返回新实例
const TOKEN_OK = () => json({ code: 0, msg: 'ok', tenant_access_token: 't-test', expire: 7200 });

function client(): FeishuClient {
  return new FeishuClient({ appId: 'cli_test', appSecret: 's', domain: 'feishu' });
}

beforeEach(() => {
  forgetTokenCache();
});

describe('瞬时业务码重试', () => {
  it('2200 后成功：应重试并返回结果', async () => {
    const apiResponses = [
      json({ code: 2200, msg: 'Internal Error' }),
      json({ code: 0, msg: 'ok', data: { ok: 1 } }),
    ];
    let tokenServed = false;
    const fetchMock = vi.fn(async () => {
      if (!tokenServed) {
        tokenServed = true;
        return TOKEN_OK();
      }
      return apiResponses.shift()!;
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await client().get('/open-apis/test');
    expect((res as { data?: { ok?: number } }).data?.ok).toBe(1);
    // 1 次 token + 2 次 API（首次 2200 + 重试成功）
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.unstubAllGlobals();
  });

  it('2200 持续失败：3 次尝试后抛错，并注明已重试', async () => {
    let tokenServed = false;
    const fetchMock = vi.fn(async () => {
      if (!tokenServed) {
        tokenServed = true;
        return TOKEN_OK();
      }
      return json({ code: 2200, msg: 'Internal Error' });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(client().get('/open-apis/test')).rejects.toThrow('已自动重试 3 次');
    expect(fetchMock).toHaveBeenCalledTimes(4); // 1 token + 3 API
    vi.unstubAllGlobals();
  });

  it('非瞬时错误（91403 权限）不重试', async () => {
    let tokenServed = false;
    const fetchMock = vi.fn(async () => {
      if (!tokenServed) {
        tokenServed = true;
        return TOKEN_OK();
      }
      return json({ code: 91403, msg: 'Forbidden' }, 403);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(client().get('/open-apis/test')).rejects.toBeInstanceOf(AppError);
    expect(fetchMock).toHaveBeenCalledTimes(2); // 1 token + 1 API，无重试
    vi.unstubAllGlobals();
  });
});

describe('网络层与 5xx 重试', () => {
  it('网络抖动（TypeError）后成功', async () => {
    let tokenServed = false;
    let apiFailed = false;
    const fetchMock = vi.fn(async () => {
      if (!tokenServed) {
        tokenServed = true;
        return TOKEN_OK();
      }
      if (!apiFailed) {
        apiFailed = true;
        throw new TypeError('fetch failed');
      }
      return json({ code: 0, msg: 'ok', data: { ok: 1 } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await client().get('/open-apis/test');
    expect((res as { data?: { ok?: number } }).data?.ok).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.unstubAllGlobals();
  });

  it('HTTP 502 持续：fetch 层 3 次尝试后返回，由上层抛错', async () => {
    let tokenServed = false;
    const fetchMock = vi.fn(async () => {
      if (!tokenServed) {
        tokenServed = true;
        return TOKEN_OK();
      }
      return new Response('Bad Gateway', { status: 502, statusText: 'Bad Gateway' });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(client().get('/open-apis/test')).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(4); // 1 token + 3 API
    vi.unstubAllGlobals();
  });
});
