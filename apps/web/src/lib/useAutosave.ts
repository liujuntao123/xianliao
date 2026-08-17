/**
 * 防抖自动保存：值变化后延迟 `delay` ms 调用 save，成功后短暂展示「已保存」。
 * - 状态机：idle → pending（防抖等待）→ saving（请求在途）→ saved（2.5s 后回 idle）/ error
 * - flush()：立即保存挂起的变更（切换目标 / 卸载时调用）
 * - save 内部可对非法值直接 resolve（no-op），同样推进 lastSaved，避免反复重试
 */
import * as React from 'react';

export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export function useAutosave<T>(opts: {
  value: T;
  save: (value: T) => Promise<void>;
  isEqual?: (a: T, b: T) => boolean;
  delay?: number;
}): { state: SaveState; flush: () => void } {
  const { value, save, delay = 600 } = opts;
  const isEqual = opts.isEqual ?? ((a: T, b: T) => a === b);

  const [state, setState] = React.useState<SaveState>('idle');
  const lastSavedRef = React.useRef<T>(value);
  const timerRef = React.useRef<number | null>(null);
  const inflightRef = React.useRef(false);
  const savedTimerRef = React.useRef<number | null>(null);
  const saveRef = React.useRef(save);
  saveRef.current = save;
  // 保存的值快照，成功后与最新值比较决定是否继续 pending
  // 始终指向最新值（卸载时读取，避免闭包旧值）
  const valueRef = React.useRef<T>(value);
  valueRef.current = value;

  const runSave = React.useCallback(async (v: T) => {
    inflightRef.current = true;
    setState('saving');
    try {
      await saveRef.current(v);
      lastSavedRef.current = v;
      setState('saved');
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
      savedTimerRef.current = window.setTimeout(() => setState('idle'), 2500);
    } catch {
      setState('error');
    } finally {
      inflightRef.current = false;
    }
  }, []);

  const flush = React.useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!isEqual(value, lastSavedRef.current)) void runSave(value);
  }, [value, isEqual, runSave]);

  React.useEffect(() => {
    if (isEqual(value, lastSavedRef.current)) return;
    setState('pending');
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void runSave(value);
    }, delay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // 卸载时尽力保存未落盘的变更
  React.useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
      const v = valueRef.current;
      if (!inflightRef.current && !isEqual(v, lastSavedRef.current)) {
        void saveRef.current(v);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { state, flush };
}
