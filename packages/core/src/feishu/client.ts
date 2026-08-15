/**
 * 飞书 OpenAPI 客户端：tenant_access_token 管理（实例内存缓存 + 冷启动现取）
 * 与统一调用封装（错误归一化为 AppError）。
 */
import { AppError, type FeishuDomain } from '../types';

export const OPENAPI_HOSTS: Record<FeishuDomain, string> = {
  feishu: 'https://open.feishu.cn',
  lark: 'https://open.larksuite.com',
};

export interface FeishuCredentials {
  appId: string;
  appSecret: string;
  domain: FeishuDomain;
}

export type Query = Record<string, string | number | undefined>;

/** 实例级 token 缓存（Serverless 冷启动时自然为空，届时现取）。 */
const tokenCache = new Map<string, { token: string; expireAt: number }>();

export class FeishuClient {
  constructor(private creds: FeishuCredentials) {}

  private host(): string {
    return OPENAPI_HOSTS[this.creds.domain];
  }

  async getTenantToken(): Promise<string> {
    const cached = tokenCache.get(this.creds.appId);
    if (cached && cached.expireAt > Date.now()) return cached.token;

    const res = await fetch(`${this.host()}/open-apis/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: this.creds.appId,
        app_secret: this.creds.appSecret,
      }),
    });
    const data = (await res.json()) as {
      code: number;
      msg: string;
      tenant_access_token?: string;
      expire?: number;
    };
    if (data.code !== 0 || !data.tenant_access_token) {
      throw new AppError(
        502,
        `获取飞书 tenant_access_token 失败（${data.code} ${data.msg}）——请检查 FEISHU_APP_ID / FEISHU_APP_SECRET 是否正确`,
        { feishu: data },
      );
    }
    const expireInMs = (data.expire ?? 7200) * 1000;
    // 提前 5 分钟视为过期，避免边界失效
    tokenCache.set(this.creds.appId, {
      token: data.tenant_access_token,
      expireAt: Date.now() + expireInMs - 5 * 60 * 1000,
    });
    return data.tenant_access_token;
  }

  /** 调用飞书 OpenAPI，非 0 code 一律抛 AppError（携带 missing scope 信息）。 */
  private async request<T>(method: string, path: string, body: unknown, query?: Query): Promise<T> {
    const token = await this.getTenantToken();
    let url = `${this.host()}${path}`;
    if (query) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) qs.set(k, String(v));
      }
      const s = qs.toString();
      if (s) url += '?' + s;
    }
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json().catch(() => ({ code: res.status, msg: res.statusText }))) as {
      code: number;
      msg: string;
      [k: string]: unknown;
    };
    if (data.code !== 0) {
      throw toAppError(data, res.status);
    }
    return data as T;
  }

  get<T = unknown>(path: string, query?: Query): Promise<T> {
    return this.request<T>('GET', path, undefined, query);
  }

  post<T = unknown>(path: string, body?: unknown, query?: Query): Promise<T> {
    return this.request<T>('POST', path, body, query);
  }

  put<T = unknown>(path: string, body?: unknown, query?: Query): Promise<T> {
    return this.request<T>('PUT', path, body, query);
  }

  delete<T = unknown>(path: string, query?: Query): Promise<T> {
    return this.request<T>('DELETE', path, undefined, query);
  }
}

export function toAppError(
  data: { code: number; msg: string; [k: string]: unknown },
  httpStatus: number,
): AppError {
  const payload: Record<string, unknown> = { feishu: data };
  const msg = typeof data.msg === 'string' ? data.msg : '未知飞书错误';

  const consoleUrl = data.console_url as string | undefined;
  if (consoleUrl) payload.consoleUrl = consoleUrl;
  const hint = data.hint as string | undefined;
  if (hint) payload.hint = hint;
  const missing = data.missing_scopes;
  if (Array.isArray(missing)) payload.missingScopes = missing.map(String);

  // 91403 等：无文档权限（Base 不存在或应用未被授权）
  if (data.code === 91403 || httpStatus === 403) {
    return new AppError(
      502,
      `飞书拒绝了访问（${data.code} ${msg}）——通常是 Base 不存在或应用未被授权`,
      payload,
    );
  }
  return new AppError(502, `飞书 API 出错（${data.code} ${msg}）`, payload);
}

export function forgetTokenCache(appId?: string): void {
  if (appId) tokenCache.delete(appId);
  else tokenCache.clear();
}
