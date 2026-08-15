/**
 * 数据 store：Context + 60s 轮询 + 手动刷新 + 页面回前台刷新（CONTEXT.md / Q10）。
 * 勾选类操作做乐观更新（mutateLocal），随后静默刷新对齐服务端。
 */
import * as React from 'react';
import { api, ApiError, type AppData } from './api';

interface DataCtx {
  data: AppData | null;
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
  refresh: (silent?: boolean) => Promise<void>;
  /** 本地乐观更新（不触发网络） */
  mutateLocal: React.Dispatch<React.SetStateAction<AppData | null>>;
}

const Ctx = React.createContext<DataCtx | null>(null);

export function useData(): DataCtx {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}

export function DataProvider({
  children,
  onAuthError,
}: {
  children: React.ReactNode;
  onAuthError: () => void;
}) {
  const [data, setData] = React.useState<AppData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = React.useState<number | null>(null);
  const refreshing = React.useRef(false);

  const refresh = React.useCallback(
    async (silent = false) => {
      if (refreshing.current) return;
      refreshing.current = true;
      if (!silent) setLoading(true);
      try {
        const d = await api.data();
        setData(d);
        setError(null);
        setLastUpdated(Date.now());
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          onAuthError();
          return;
        }
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        refreshing.current = false;
        setLoading(false);
      }
    },
    [onAuthError],
  );

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  // 60s 轮询（仅页面可见时）+ 回前台即时刷新
  React.useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh(true);
    }, 60_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') void refresh(true);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [refresh]);

  return (
    <Ctx.Provider value={{ data, loading, error, lastUpdated, refresh, mutateLocal: setData }}>
      {children}
    </Ctx.Provider>
  );
}
