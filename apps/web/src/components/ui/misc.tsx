import * as React from 'react';
import { Loader2, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button } from './button';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin text-muted-foreground', className)} />;
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
