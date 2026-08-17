import * as React from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button } from './button';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin text-muted-foreground', className)} />;
}

/** 骨架块：首屏数据加载时的占位过渡 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} />;
}

/** 顶部不确定进度条：任意接口请求在途时展示 */
export function LoadingBar({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] overflow-hidden">
      <div
        className="absolute h-full rounded-full bg-primary/80"
        style={{ animation: 'xianji-loading-bar 1.1s ease-in-out infinite' }}
      />
    </div>
  );
}

/** 任务列表首屏骨架 */
export function TaskListSkeleton() {
  return (
    <div className="animate-fade-in" aria-busy="true" aria-label="加载中">
      <div className="border-b bg-card/80 px-4 py-3 md:px-6">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="mt-3 h-6 w-full max-w-md" />
      </div>
      <div className="space-y-2 px-4 py-4 md:px-6">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-3 py-1.5">
            <Skeleton className="h-[18px] w-[18px] rounded-[4px]" />
            <Skeleton className={`h-4 ${i % 3 === 0 ? 'w-2/3' : 'w-1/2'}`} />
            {i % 3 === 1 && <Skeleton className="h-4 w-14 rounded-full" />}
          </div>
        ))}
      </div>
    </div>
  );
}

/** 快捷笔记首屏骨架（捕捉框占位仅桌面显示，与实际布局一致） */
export function NotesSkeleton() {
  return (
    <div className="animate-fade-in" aria-busy="true" aria-label="加载中">
      <div className="border-b bg-card/80 px-4 py-3 md:px-6">
        <Skeleton className="h-5 w-24" />
        <div className="mt-3 hidden lg:block">
          <Skeleton className="h-[76px] w-full" />
        </div>
      </div>
      <div className="space-y-3 px-4 py-4 md:px-6">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-md px-2 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <Skeleton className={`h-4 ${i % 3 === 0 ? 'w-2/3' : 'w-1/2'}`} />
              <Skeleton className="h-3 w-14" />
            </div>
            <Skeleton className="mt-1.5 h-3 w-full" />
            <Skeleton className="mt-1 h-3 w-3/4" />
            {i % 2 === 0 && <Skeleton className="mt-2 h-4 w-16 rounded-full" />}
          </div>
        ))}
      </div>
    </div>
  );
}

/** 自动保存状态指示：等待防抖 / 保存中 / 已保存 / 失败 */
export function SaveStateHint({
  state,
  onRetry,
}: {
  state: 'idle' | 'pending' | 'saving' | 'saved' | 'error';
  onRetry?: () => void;
}) {
  if (state === 'idle') return null;
  return (
    <span
      className={
        'inline-flex items-center gap-1 text-xs ' +
        (state === 'error' ? 'text-destructive' : 'text-muted-foreground')
      }
    >
      {state === 'pending' && '输入中…'}
      {state === 'saving' && <Spinner className="h-3 w-3" />}
      {state === 'saving' && '正在保存'}
      {state === 'saved' && <Check className="h-3 w-3 text-primary" />}
      {state === 'saved' && '已保存'}
      {state === 'error' && (
        <button className="underline underline-offset-2 hover:text-foreground" onClick={onRetry}>
          保存失败，点击重试
        </button>
      )}
    </span>
  );
}

export function EmptyState({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground', className)}>
      {children}
    </div>
  );
}

/** 轻量对话框（无 radix 依赖）：点击遮罩 / Esc 关闭 */
export function Dialog({
  open,
  onClose,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  React.useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={cn('relative w-full max-w-md rounded-lg bg-card p-6 shadow-xl', className)}>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
          aria-label="关闭"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = '确认',
  destructive = true,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmText?: string;
  destructive?: boolean;
  busy?: boolean;
}) {
  return (
    <Dialog open={open} onClose={onClose} className="max-w-sm">
      <h3 className="mb-2 text-base font-semibold">{title}</h3>
      {description && <p className="mb-5 text-sm text-muted-foreground">{description}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={busy}>
          取消
        </Button>
        <Button variant={destructive ? 'destructive' : 'default'} onClick={onConfirm} disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {confirmText}
        </Button>
      </div>
    </Dialog>
  );
}
