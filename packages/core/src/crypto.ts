/**
 * 扫码向导的「密封句柄」：把 Device Flow 的 device_code 等敏感中间态
 * 加密成不透明字符串交由前端保管，轮询时带回。这样 Serverless 实例
 * 无需任何服务器端会话状态（实例内存/存储都不可靠）。
 *
 * 密钥由 ACCESS_KEY 派生（HKDF-SHA256），不引入新的环境变量。
 * 使用 Web Crypto（Node 20 / Workers / 浏览器通用）。
 */
import type { FeishuDomain } from './types.js';

export interface SealedScanState {
  deviceCode: string;
  domain: FeishuDomain;
  /** begin 返回的轮询间隔（秒） */
  interval: number;
  /** 过期时间（epoch 毫秒） */
  expiresAt: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function deriveKey(accessKey: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.importKey(
    'raw',
    encoder.encode('xianji-scan-seal:' + accessKey),
    'HKDF',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: encoder.encode('xianji.v1'), info: new Uint8Array(0) },
    raw,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function sealState(accessKey: string, state: SealedScanState): Promise<string> {
  const key = await deriveKey(accessKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(state)),
  );
  const bytes = new Uint8Array(iv.length + ciphertext.byteLength);
  bytes.set(iv);
  bytes.set(new Uint8Array(ciphertext), iv.length);
  return toBase64Url(bytes);
}

export async function unsealState(accessKey: string, handle: string): Promise<SealedScanState> {
  const key = await deriveKey(accessKey);
  const bytes = fromBase64Url(handle);
  const iv = bytes.slice(0, 12);
  const data = bytes.slice(12);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  } catch {
    throw new Error('handle 无效或密钥不匹配');
  }
  const state = JSON.parse(decoder.decode(plaintext)) as SealedScanState;
  if (!state?.deviceCode || typeof state.expiresAt !== 'number') {
    throw new Error('handle 内容无效');
  }
  if (Date.now() > state.expiresAt) {
    throw new Error('handle 已过期，请重新发起扫码');
  }
  return state;
}

export function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 常量时间比较：先哈希到等长，再逐字节异或累积。 */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);
  const va = new Uint8Array(da);
  const vb = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i]! ^ vb[i]!;
  return diff === 0;
}
