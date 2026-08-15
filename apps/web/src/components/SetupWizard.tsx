/**
 * 首启向导（ADR-0003）：
 *  1. 扫码一键创建飞书应用（官方 Device Flow，最小权限）
 *  2. 服务端同请求内自动创建 Base + 四张表 + full_access 共享
 *  3. 展示环境变量值与各平台设置指引；用户配置完成后「检查状态」进入应用
 * 另含「手动路径」备选：开发者后台建应用 + 手动建 Base + 添加文档应用。
 */
import * as React from 'react';
import {
  CheckCircle2,
  ClipboardCopy,
  ExternalLink,
  RefreshCw,
  ScanLine,
  Wand2,
} from 'lucide-react';
import { api, type ScanPoll, type SetupStatus } from '../lib/api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Card, CardContent } from './ui/card';
import { Spinner } from './ui/misc';
import { QrCode } from './QrCode';

type Phase = 'choose' | 'scanning' | 'success' | 'manual';

export function SetupWizard({
  status,
  onRecheck,
  onReady,
}: {
  status: SetupStatus;
  onRecheck: () => Promise<SetupStatus | null>;
  onReady: () => void;
}) {
  const credsReady = status.feishu.appIdSet && status.feishu.appSecretSet;
  const baseReady = status.base?.ok === true;
  const [phase, setPhase] = React.useState<Phase>(credsReady && !baseReady ? 'success' : 'choose');
  const [scanPollResult, setScanPollResult] = React.useState<ScanPoll | null>(null);
  const [checking, setChecking] = React.useState(false);

  // 扫码流程数据
  const [qrUrl, setQrUrl] = React.useState('');
  const [handle, setHandle] = React.useState('');
  const [interval, setIntervalSec] = React.useState(5);
  const [pollError, setPollError] = React.useState<string | null>(null);
  const [initBusy, setInitBusy] = React.useState(false);
  const timer = React.useRef<number | null>(null);
  const cancelled = React.useRef(false);

  React.useEffect(() => {
    return () => {
      cancelled.current = true;
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  const startScan = async () => {
    setPollError(null);
    try {
      const start = await api.scanStart();
      setQrUrl(start.qrUrl);
      setHandle(start.handle);
      setIntervalSec(start.interval);
      setPhase('scanning');
      schedulePoll(start.handle, start.interval);
    } catch (e) {
      setPollError(e instanceof Error ? e.message : String(e));
    }
  };

  const schedulePoll = (h: string, sec: number) => {
    timer.current = window.setTimeout(() => void poll(h), Math.max(sec, 3) * 1000);
  };

  const poll = async (h: string) => {
    if (cancelled.current) return;
    try {
      const res = await api.scanPoll(h);
      if (cancelled.current) return;
      if (res.status === 'pending') {
        if (res.handle) {
          setHandle(res.handle);
          schedulePoll(res.handle, res.interval ?? interval);
        } else {
          schedulePoll(h, res.interval ?? interval);
        }
        return;
      }
      if (res.status === 'error') {
        setPollError(res.message ?? '扫码失败');
        setPhase('choose');
        return;
      }
      // success：服务端已完成建 Base（或附带 initError）
      setScanPollResult(res);
      setPhase('success');
    } catch (e) {
      if (cancelled.current) return;
      // 网络抖动：退避后继续轮询一次
      schedulePoll(h, Math.min(interval * 2, 15));
      void e;
    }
  };

  const retryInit = async () => {
    setInitBusy(true);
    try {
      const body =
        scanPollResult?.env && !credsReady
          ? {
              appId: scanPollResult.env.FEISHU_APP_ID,
              appSecret: scanPollResult.env.FEISHU_APP_SECRET,
              openId: scanPollResult.sharedTo,
            }
          : undefined; // 无 body：服务端用已配置的环境变量凭证重试
      const res = await api.setupInit(body);
      if (res.status === 'success') {
        setScanPollResult(res);
        if (!res.initError) void checkReady();
      }
    } catch (e) {
      setPollError(e instanceof Error ? e.message : String(e));
    } finally {
      setInitBusy(false);
    }
  };

  const checkReady = async () => {
    setChecking(true);
    try {
      const s = await onRecheck();
      if (s?.base?.ok && s.feishu.appIdSet) onReady();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-full overflow-y-auto bg-gradient-to-b from-accent/30 to-background p-4">
      <div className="mx-auto max-w-2xl space-y-6 py-8">
        <header className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <Wand2 className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold">首启配置</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            闲记把所有数据存在你自己的飞书多维表格里，先完成一次性接入
          </p>
        </header>

        {/* 步骤指示 */}
        <ol className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Step done={credsReady} label="① 创建飞书应用" />
          <Step done={baseReady || !!scanPollResult?.env?.FEISHU_BASE_TOKEN} label="② 初始化数据表" />
          <Step done={false} label="③ 配置环境变量" />
        </ol>

        {phase === 'choose' && (
          <Card>
            <CardContent className="p-6 space-y-4">
              <h2 className="font-semibold">方式一：扫码自动创建（推荐）</h2>
              <p className="text-sm text-muted-foreground">
                用飞书扫一扫，一键创建专属「闲记」智能体应用（仅开通多维表格所需的最小权限），
                并自动在你的飞书云空间创建数据表。全程约 30 秒。
              </p>
              {pollError && <p className="text-sm text-destructive">{pollError}</p>}
              <Button onClick={startScan}>
                <ScanLine className="h-4 w-4" />
                开始扫码
              </Button>
              <details className="group">
                <summary className="cursor-pointer list-none text-sm text-muted-foreground hover:text-foreground">
                  方式二：手动配置（备选，适合不想新建应用时）▸
                </summary>
                <ManualGuide />
              </details>
            </CardContent>
          </Card>
        )}

        {phase === 'scanning' && (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 p-6">
              <QrCode text={qrUrl} />
              <p className="text-sm text-muted-foreground">打开飞书 App 扫一扫，确认创建应用</p>
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Spinner /> 等待确认…（二维码约 10 分钟内有效）
              </p>
              <a
                href={qrUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary underline-offset-2 hover:underline"
              >
                在浏览器中打开授权页 <ExternalLink className="inline h-3 w-3" />
              </a>
              <Button variant="ghost" size="sm" onClick={() => window.location.reload()}>
                取消重来
              </Button>
            </CardContent>
          </Card>
        )}

        {phase === 'success' && (
          <>
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <h2 className="font-semibold">
                    {scanPollResult?.initError ? '应用已创建，初始化未完成' : '应用与数据表已就绪'}
                  </h2>
                </div>
                {scanPollResult?.initError ? (
                  <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                    <p className="text-destructive">{scanPollResult.initError.message}</p>
                    {scanPollResult.initError.consoleUrl && (
                      <a
                        className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                        href={scanPollResult.initError.consoleUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        去开发者后台开通权限 <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    <div>
                      <Button size="sm" variant="outline" onClick={retryInit} disabled={initBusy}>
                        {initBusy ? <Spinner /> : <RefreshCw className="h-4 w-4" />}
                        重试初始化
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    多维表格「{scanPollResult?.baseName ?? '闲记'}」已创建
                    {scanPollResult?.sharedTo ? '，并已共享给你（可管理）' : ''}
                    ，你可以在飞书云空间直接打开它。
                  </p>
                )}
                <EnvVarsPanel env={scanPollResult?.env} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 space-y-3">
                <h3 className="text-sm font-semibold">最后一步：把上面的变量配置到部署环境</h3>
                <PlatformGuide />
                <div className="pt-2">
                  <Button onClick={checkReady} disabled={checking}>
                    {checking ? <Spinner className="text-primary-foreground" /> : <CheckCircle2 className="h-4 w-4" />}
                    我已配置完成，检查状态
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {phase === 'manual' && <ManualGuide detailed />}
      </div>
    </div>
  );
}

function Step({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-center gap-1">
      {done ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
      ) : (
        <span className="h-3.5 w-3.5 rounded-full border border-muted-foreground/40" />
      )}
      {label}
    </li>
  );
}

function EnvVarsPanel({ env }: { env?: ScanPoll['env'] }) {
  if (!env) return null;
  const rows: Array<[string, string]> = [
    ['FEISHU_APP_ID', env.FEISHU_APP_ID],
    ['FEISHU_APP_SECRET', env.FEISHU_APP_SECRET],
  ];
  if (env.FEISHU_BASE_TOKEN) rows.push(['FEISHU_BASE_TOKEN', env.FEISHU_BASE_TOKEN]);
  if (env.FEISHU_DOMAIN && env.FEISHU_DOMAIN !== 'feishu') rows.push(['FEISHU_DOMAIN', env.FEISHU_DOMAIN]);
  return (
    <div className="space-y-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
          <span className="w-40 shrink-0 font-mono text-xs font-semibold">{k}</span>
          <code className="flex-1 truncate font-mono text-xs">{v}</code>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => void navigator.clipboard.writeText(v)}
            title="复制"
          >
            <ClipboardCopy className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}

function PlatformGuide() {
  const items = [
    {
      title: 'Docker / 自托管',
      body: '把变量写入 .env（或 docker run -e），然后重启容器。',
    },
    {
      title: 'Vercel',
      body: '项目 Settings → Environment Variables 添加后 Redeploy。',
    },
    {
      title: 'Cloudflare Workers',
      body: 'Dashboard → Settings → Variables 添加，或 wrangler secret put，然后重新部署。',
    },
  ];
  return (
    <ul className="space-y-1.5 text-sm text-muted-foreground">
      {items.map((i) => (
        <li key={i.title} className="flex gap-2">
          <Badge variant="secondary" className="h-fit shrink-0">
            {i.title}
          </Badge>
          <span>{i.body}</span>
        </li>
      ))}
    </ul>
  );
}

function ManualGuide({ detailed = false }: { detailed?: boolean }) {
  const [baseInput, setBaseInput] = React.useState('');
  const parsed = React.useMemo(() => parseBaseToken(baseInput), [baseInput]);
  return (
    <div className={detailed ? 'space-y-4' : 'mt-4 space-y-3 rounded-md border p-4'}>
      <h3 className="font-semibold">手动路径</h3>
      <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
        <li>
          打开{' '}
          <a
            className="text-primary underline-offset-2 hover:underline"
            href="https://open.feishu.cn/app"
            target="_blank"
            rel="noreferrer"
          >
            飞书开发者后台 <ExternalLink className="inline h-3 w-3" />
          </a>{' '}
          ，创建<strong className="text-foreground">企业自建应用</strong>
        </li>
        <li>
          在「权限管理」开通：<code className="rounded bg-muted px-1 font-mono text-xs">bitable:app</code>（查看、
          评论、编辑和管理多维表格）；如需自动发现 Base 再开{' '}
          <code className="rounded bg-muted px-1 font-mono text-xs">drive:drive.metadata:readonly</code>
        </li>
        <li>复制 App ID / App Secret，配置为 FEISHU_APP_ID / FEISHU_APP_SECRET</li>
        <li>
          在飞书里<strong className="text-foreground">新建一个空的多维表格</strong>
          （名字随意，建议「闲记」），通过「…」→「文档应用」把刚创建的应用添加为协作者（可编辑）
        </li>
        <li>复制该多维表格的链接，填到下面提取 FEISHU_BASE_TOKEN：</li>
      </ol>
      <Input
        placeholder="https://xxx.feishu.cn/base/xxxxxxxx?table=tblYyyy"
        value={baseInput}
        onChange={(e) => setBaseInput(e.target.value)}
      />
      {baseInput && (
        <p className="text-sm">
          {parsed ? (
            <span className="flex flex-wrap items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{parsed}</code>
            </span>
          ) : (
            <span className="text-destructive">未能从链接中解析出 app_token（应形如 /base/xxxx）</span>
          )}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        配置好环境变量并重新部署后，后端会自动在该多维表格中创建所需的四张数据表。
      </p>
    </div>
  );
}

function parseBaseToken(url: string): string | null {
  const m = /\/base\/([A-Za-z0-9]+)/.exec(url.trim());
  return m?.[1] ?? null;
}

export { parseBaseToken };
export type { SetupStatus };
