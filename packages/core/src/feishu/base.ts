/**
 * Base 生命周期：创建 / 按名自动发现 / full_access 共享给用户 / 一站式初始化。
 */
import { AppError, type FeishuDomain } from '../types';
import { FeishuClient } from './client';
import { BASE_NAME, ensureSchema } from './schema';

export interface InitResult {
  baseToken: string;
  baseName: string;
  sharedTo?: string;
}

/** 创建全新 Base（落在应用云空间，owner 是应用），随后建表、共享给扫码用户。 */
export async function createBaseWithSchema(
  client: FeishuClient,
  openId?: string,
): Promise<InitResult> {
  const created = await client.post<{ data: { app: { app_token: string } } }>(
    '/open-apis/bitable/v1/apps',
    { name: BASE_NAME },
  );
  const baseToken = created.data.app.app_token;
  await ensureSchema(client, baseToken);

  let sharedTo: string | undefined;
  if (openId) {
    sharedTo = (await shareBaseFullAccess(client, baseToken, openId)) ? openId : undefined;
  }
  return { baseToken, baseName: BASE_NAME, sharedTo };
}

/** 把 Base 以可管理（full_access）权限共享给用户 —— 数据主权归用户（ADR-0003）。 */
export async function shareBaseFullAccess(
  client: FeishuClient,
  baseToken: string,
  openId: string,
): Promise<boolean> {
  try {
    await client.post(
      `/open-apis/drive/v1/permissions/${baseToken}/members`,
      { member_type: 'openid', member_id: openId, perm: 'full_access' },
      { type: 'bitable' },
    );
    return true;
  } catch {
    // 共享失败不阻塞初始化（凭证仍有效，用户可稍后在飞书内手动共享）
    return false;
  }
}

const discoveredCache = new Map<string, { token: string; at: number }>();

/**
 * 按名称自动发现 Base（应用云空间根目录，scope：drive:drive.metadata:readonly）。
 * 用于 FEISHU_BASE_TOKEN 未设置但 Base 是应用自建的场景（如扫码向导刚建完）。
 * 实例内存缓存 60s。
 */
export async function discoverBase(client: FeishuClient, appId: string): Promise<string | null> {
  const cached = discoveredCache.get(appId);
  if (cached && Date.now() - cached.at < 60_000) return cached.token;

  const files: { token: string; name: string; type: string }[] = [];
  let pageToken: string | undefined;
  do {
    const res = await client.get<{
      data: { files?: { token: string; name: string; type: string }[]; next_page_token?: string };
    }>('/open-apis/drive/explorer/v2/root_folder/files', {
      page_size: 200,
      page_token: pageToken,
    });
    files.push(...(res.data.files ?? []));
    pageToken = res.data.next_page_token || undefined;
  } while (pageToken);

  const hit = files.find((f) => f.type === 'bitable' && f.name === BASE_NAME);
  if (!hit) return null;
  discoveredCache.set(appId, { token: hit.token, at: Date.now() });
  return hit.token;
}

export function forgetDiscoveredCache(appId?: string): void {
  if (appId) discoveredCache.delete(appId);
  else discoveredCache.clear();
}

/**
 * 解析当前可用的 Base token：环境变量优先，缺失时自动发现。
 * 发现失败抛 409 引导走向导。
 */
export async function resolveBaseToken(
  client: FeishuClient,
  appId: string,
  envBaseToken: string,
): Promise<string> {
  if (envBaseToken) return envBaseToken;
  const found = await discoverBase(client, appId);
  if (found) return found;
  throw new AppError(
    409,
    '缺少 FEISHU_BASE_TOKEN：请完成首启向导，或在环境变量中填入多维表格 app_token',
  );
}

/** 校验 Base 可达且四表齐全（幂等补建）。 */
export async function verifyBase(client: FeishuClient, baseToken: string): Promise<void> {
  await ensureSchema(client, baseToken);
}
