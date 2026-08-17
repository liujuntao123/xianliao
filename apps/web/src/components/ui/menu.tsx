/**
 * 详情面板 Header 右上角的收起菜单（轻量下拉，无 radix 依赖）。
 * 点击触发按钮展开；点击菜单项 / 外部 / Esc 关闭。
 */
import * as React from 'react';
import { MoreVertical } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button } from './button';

export interface HeaderMenuItem {
  label: string;
  icon?: React.ReactNode;
  destructive?: boolean;
  onSelect: () => void;
}

export function HeaderMenu({ items, label = '更多操作' }: { items: HeaderMenuItem[]; label?: string }) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <MoreVertical className="h-4 w-4" />
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 min-w-32 animate-fade-in rounded-md border bg-card p-1 shadow-lg"
        >
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              className={cn(
                'flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm transition-colors',
                it.destructive ? 'text-destructive hover:bg-destructive/10' : 'hover:bg-accent hover:text-accent-foreground',
              )}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
