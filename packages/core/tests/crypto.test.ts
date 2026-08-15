import { describe, expect, it } from 'vitest';
import { safeEqual, sealState, unsealState } from '../src/crypto';

describe('密封句柄（serverless 无状态轮询）', () => {
  it('密封/解封往返一致', async () => {
    const state = { deviceCode: 'dc-1', domain: 'feishu' as const, interval: 5, expiresAt: Date.now() + 60_000 };
    const handle = await sealState('key', state);
    expect(await unsealState('key', handle)).toEqual(state);
  });

  it('密钥不同则解密失败', async () => {
    const handle = await sealState('key-a', {
      deviceCode: 'dc', domain: 'feishu' as const, interval: 5, expiresAt: Date.now() + 60_000,
    });
    await expect(unsealState('key-b', handle)).rejects.toThrow();
  });

  it('过期句柄被拒绝', async () => {
    const handle = await sealState('k', {
      deviceCode: 'dc', domain: 'feishu' as const, interval: 5, expiresAt: Date.now() - 1000,
    });
    await expect(unsealState('k', handle)).rejects.toThrow('过期');
  });

  it('篡改句柄被拒绝', async () => {
    const handle = await sealState('k', {
      deviceCode: 'dc', domain: 'feishu' as const, interval: 5, expiresAt: Date.now() + 60_000,
    });
    const tampered = handle.slice(0, -4) + 'AAAA';
    await expect(unsealState('k', tampered)).rejects.toThrow();
  });
});

describe('常量时间比较', () => {
  it('相同/不同输入', async () => {
    expect(await safeEqual('abc', 'abc')).toBe(true);
    expect(await safeEqual('abc', 'abd')).toBe(false);
    expect(await safeEqual('', '')).toBe(true);
  });
});
