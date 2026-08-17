/**
 * 飞书「一键创建智能体应用」Device Flow（RFC 8628）的自研 fetch 实现。
 * 协议与 @larksuiteoapi/node-sdk 的 registerApp 一致：
 *   POST https://accounts.{feishu.cn|larksuite.com}/oauth/v1/app/registration
 *   Content-Type: application/x-www-form-urlencoded
 *   begin: action=begin & archetype=PersonalAgent & auth_method=client_secret & request_user_info=open_id
 *   poll : action=poll & device_code=...
 * begin 返回 verification_uri_complete（含 user_code 的落地页），我们再
 * 拼上 from/source/tp/name/desc/addons/createOnly 参数渲染成二维码。
 */

import type { FeishuDomain } from '../types.js';

const ACCOUNTS_HOSTS: Record<FeishuDomain, string> = {
  feishu: 'https://accounts.feishu.cn',
  lark: 'https://accounts.larksuite.com',
};

/**
 * addons 参数（平台固定编码：JSON → gzip → base64url），内容为：
 * { preset:false, scopes:{ tenant:['bitable:app','drive:drive.metadata:readonly'] } }
 * 即：丢弃默认 IM 模板，最小基座 + 多维表格权限 + 云空间元数据只读（用于
 * Base 自动发现）。内容固定，故预计算为常量，运行时零依赖。
 */
const ADDONS_PARAM =
  'H4sIAAAAAAAAAx3EQQqAIBAF0Lv8tXSAuUq0GPMHgumgQxDi3YPe4k1Y56BDLi2DAeNsxgGZcFatDtkRs2ssFDVDQOr5ofxvN12TukqnplbLi2OtD084_NFUAAAA';

export const APP_DISPLAY_NAME = '闲记';
export const APP_DESC = '闲记：待办与快捷笔记（数据存于你的多维表格）';

export interface BeginResult {
  deviceCode: string;
  qrUrl: string;
  interval: number;
  expiresAt: number;
  /** 开始域名（可能因 tenant_brand 在轮询期切换） */
  domain: FeishuDomain;
}

export interface PollResult {
  /** pending=继续轮询；success=用户已确认；error=终态失败（停止轮询） */
  status: 'pending' | 'success' | 'error';
  /** pending 时可能给出新的轮询域名（租户是 lark 国际版时切换） */
  domainSwitched?: FeishuDomain;
  success?: {
    appId: string;
    appSecret: string;
    openId?: string;
    brand: 'feishu' | 'lark';
  };
  errorCode?: string;
  errorMessage?: string;
}

async function requestRegistration<T>(baseUrl: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${baseUrl}/oauth/v1/app/registration`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  // RFC 8628：authorization_pending / slow_down 等以 HTTP 400 携带 JSON 返回
  return (await res.json()) as T;
}

export async function beginRegistration(domain: FeishuDomain): Promise<BeginResult> {
  const baseUrl = ACCOUNTS_HOSTS[domain];
  const res = await requestRegistration<{
    device_code?: string;
    verification_uri_complete?: string;
    interval?: number;
    expires_in?: number;
    error?: string;
    error_description?: string;
  }>(baseUrl, {
    action: 'begin',
    archetype: 'PersonalAgent',
    auth_method: 'client_secret',
    request_user_info: 'open_id',
  });

  if (!res.device_code || !res.verification_uri_complete) {
    throw new Error(
      `发起扫码建应用失败：${res.error ?? '未知错误'} ${res.error_description ?? ''}`.trim(),
    );
  }

  const qr = new URL(res.verification_uri_complete);
  qr.searchParams.set('from', 'sdk');
  qr.searchParams.set('source', 'xianji');
  qr.searchParams.set('tp', 'sdk');
  qr.searchParams.set('name', APP_DISPLAY_NAME);
  qr.searchParams.set('desc', APP_DESC);
  qr.searchParams.set('addons', ADDONS_PARAM);
  qr.searchParams.set('createOnly', 'true');

  const expiresIn = res.expires_in ?? 600;
  return {
    deviceCode: res.device_code,
    qrUrl: qr.toString(),
    interval: res.interval ?? 5,
    expiresAt: Date.now() + expiresIn * 1000,
    domain,
  };
}

export async function pollRegistration(domain: FeishuDomain, deviceCode: string): Promise<PollResult> {
  const baseUrl = ACCOUNTS_HOSTS[domain];
  const res = await requestRegistration<{
    client_id?: string;
    client_secret?: string;
    user_info?: { open_id?: string; tenant_brand?: 'feishu' | 'lark' };
    error?: string;
    error_description?: string;
  }>(baseUrl, { action: 'poll', device_code: deviceCode });

  if (res.client_id && res.client_secret) {
    return {
      status: 'success',
      success: {
        appId: res.client_id,
        appSecret: res.client_secret,
        openId: res.user_info?.open_id,
        brand: res.user_info?.tenant_brand ?? domain,
      },
    };
  }

  if (res.user_info?.tenant_brand === 'lark' && domain === 'feishu') {
    return { status: 'pending', domainSwitched: 'lark' };
  }

  switch (res.error) {
    case undefined:
    case 'authorization_pending':
    case 'slow_down':
      return { status: 'pending' };
    default:
      return {
        status: 'error',
        errorCode: res.error,
        errorMessage: res.error_description ?? res.error,
      };
  }
}
