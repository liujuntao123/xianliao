/**
 * 数据 store：Context + 60s 轮询 + 手动刷新 + 页面回前台刷新（CONTEXT.md / Q10）。
 * 勾选类操作做乐观更新（mutateLocal），随后静默刷新对齐服务端。
 */
import * as React from 'react';
import { api, ApiError, getPendingCount, subscribePending, type AppData } from './api';

interface DataCtx {
  data: AppData | null;
  loading: boolean;
  /** 是否有接口请求在途（含轮询/变更后的静默刷新） */
  pending: boolean;
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
  const [pending, setPending] = React.useState(false);
  // 刷新序号：并发刷新不互相丢弃，晚发起的刷新结果优先（最后写入胜）
  const refreshSeq = React.useRef(0);

  // 在途请求计数 → 全局 loading 过渡
  React.useEffect(() => subscribePending(() => setPending(getPendingCount() > 0)), []);

  const refresh = React.useCallback(
    async (silent = false) => {
      const seq = ++refreshSeq.current;
      if (!silent) setLoading(true);
      try {
        const d = await api.data();
        if (seq !== refreshSeq.current) return; // 已有更新的刷新在途，丢弃本次旧结果
        setData(d);
        setError(null);
        setLastUpdated(Date.now());
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          onAuthError();
          return;
        }
        if (seq === refreshSeq.current) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (seq === refreshSeq.current) setLoading(false);
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
    <Ctx.Provider value={{ data, loading, pending, error, lastUpdated, refresh, mutateLocal: setData }}>
      {children}
    </Ctx.Provider>
  );
}
