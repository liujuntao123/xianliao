/**
 * 应用状态机：
 *   checking → (无 key) unlock → (401) unlock（密钥无效）
 *            → (503/未配置) server-error
 *            → setup-status：缺飞书配置 → 向导；就绪 → 主界面
 */
import * as React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { api, ApiError, clearAccessKey, getAccessKey, setAccessKey, type SetupStatus } from './lib/api';
import { DataProvider } from './lib/store';
import { UnlockScreen } from './components/UnlockScreen';
import { SetupWizard } from './components/SetupWizard';
import { AppShell } from './components/AppShell';
import { Button } from './components/ui/button';
import { Spinner } from './components/ui/misc';

type Phase =
  | { kind: 'checking' }
  | { kind: 'unlock'; error?: string | null }
  | { kind: 'server-error'; message: string }
  | { kind: 'setup'; status: SetupStatus }
  | { kind: 'app' };

export default function App() {
  const [phase, setPhase] = React.useState<Phase>({ kind: 'checking' });

  const checkStatus = React.useCallback(async () => {
    try {
      const status = await api.setupStatus();
      const ready = status.feishu.appIdSet && status.feishu.appSecretSet && status.base?.ok === true;
      setPhase(ready ? { kind: 'app' } : { kind: 'setup', status });
      return status;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setPhase({ kind: 'unlock', error: getAccessKey() ? '密钥无效，请重新输入' : null });
      } else if (e instanceof ApiError && e.status === 503) {
        setPhase({ kind: 'server-error', message: e.message });
      } else {
        setPhase({ kind: 'server-error', message: e instanceof Error ? e.message : String(e) });
      }
      return null;
    }
  }, []);

  React.useEffect(() => {
    if (!getAccessKey()) {
      setPhase({ kind: 'unlock' });
      return;
    }
    void checkStatus();
  }, [checkStatus]);

  const unlock = async (key: string): Promise<string | null> => {
    setAccessKey(key);
    const status = await checkStatus();
    if (!status) return '密钥无效，请重新输入';
    return null;
  };

  const logout = () => {
    clearAccessKey();
    setPhase({ kind: 'unlock' });
  };

  switch (phase.kind) {
    case 'checking':
      return (
        <div className="flex h-full items-center justify-center">
          <Spinner className="h-6 w-6" />
        </div>
      );

    case 'unlock':
      return <UnlockScreen onUnlock={unlock} initialError={phase.error} />;

    case 'server-error':
      return (
        <div className="flex h-full items-center justify-center p-4">
          <div className="max-w-md space-y-4 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
            <h1 className="text-lg font-semibold">服务端未就绪</h1>
            <p className="text-sm text-muted-foreground">{phase.message}</p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4" />
              刷新重试
            </Button>
          </div>
        </div>
      );

    case 'setup':
      return (
        <SetupWizard
          status={phase.status}
          onRecheck={async () => {
            const s = await checkStatus();
            return s;
          }}
          onReady={() => setPhase({ kind: 'app' })}
        />
      );

    case 'app':
      return (
        <DataProvider onAuthError={logout}>
          <AppShell onLogout={logout} />
        </DataProvider>
      );
  }
}
