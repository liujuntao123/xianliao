/**
 * 日期选择器：点击触发按钮弹出日历面板（无原生 date input、无 radix 依赖）。
 * 弹层经 Portal 挂到 document.body 并用 fixed 定位——底部抽屉带 slide-in-up
 * 动画（驻留 transform 会让 fixed 以其为包含块）且 overflow 可滚动，不脱离
 * 它们弹层就会被裁切；外部点击 / Esc / 滚动 / 视口变化时关闭，放不下时翻转到
 * 触发器上方。支持「今天」快捷与清除。
 */
import * as React from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import { formatDue } from '../../lib/sort';

const POPUP_W = 264;
const POPUP_H_EST = 336; // 弹层高度估算（用于下方放不下时向上翻转）

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function DatePicker({
  value,
  onChange,
  placeholder = '设置日期',
  variant = 'ghost',
}: {
  /** epoch 毫秒（某日零点）；null = 未设置 */
  value: number | null;
  onChange: (ts: number | null) => void;
  placeholder?: string;
  /** ghost：详情信息行内的轻量触发；field：表单里的边框字段 */
  variant?: 'ghost' | 'field';
}) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ left: number; top: number } | null>(null);
  const [view, setView] = React.useState(() => {
    const d = value != null ? new Date(value) : new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const popupRef = React.useRef<HTMLDivElement>(null);

  // 打开时：视图月对齐当前值，并计算弹层 fixed 坐标
  React.useEffect(() => {
    if (!open) return;
    const d = value != null ? new Date(value) : new Date();
    setView({ y: d.getFullYear(), m: d.getMonth() });
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) {
      const left = Math.max(8, Math.min(r.left, window.innerWidth - POPUP_W - 8));
      // 下方放不下（如底部抽屉里的表单字段）则翻转到触发器上方
      const flipUp = r.bottom + POPUP_H_EST + 12 > window.innerHeight;
      setPos({ left, top: flipUp ? Math.max(8, r.top - POPUP_H_EST - 6) : r.bottom + 6 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      // 弹层已 Portal 到 body，判定“外部”时需同时排除触发器与弹层自身
      if (rootRef.current?.contains(t) || popupRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onMove = () => setOpen(false); // 滚动 / 缩放视口时直接收起
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open]);

  const info = value != null ? formatDue(value) : null;

  const pick = (day: number) => {
    onChange(new Date(view.y, view.m, day).getTime());
    setOpen(false);
  };

  const shift = (delta: number) => {
    setView((v) => {
      const d = new Date(v.y, v.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  const lead = (new Date(view.y, view.m, 1).getDay() + 6) % 7; // 周一=0
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const todayKey = dayKey(Date.now());
  const valueKey = value != null ? dayKey(value) : '';

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          variant === 'field'
            ? 'flex w-full items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-2 text-sm outline-none transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring'
            : 'flex items-center rounded-sm px-1.5 py-0.5 text-xs transition-colors hover:bg-muted/60',
          value == null ? 'text-muted-foreground' : info?.overdue ? 'text-destructive' : 'text-foreground',
        )}
        onClick={() => setOpen(!open)}
      >
        {info ? info.text : placeholder}
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={popupRef}
            style={{ position: 'fixed', left: pos.left, top: pos.top }}
            className="z-[70] w-64 animate-fade-in rounded-lg border bg-card p-2 shadow-xl"
          >
          {/* 月份导航 */}
          <div className="flex items-center justify-between px-1 pb-1">
            <button
              type="button"
              className="rounded-md p-1 hover:bg-muted"
              aria-label="上个月"
              onClick={() => shift(-1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium">
              {view.y}年{view.m + 1}月
            </span>
            <button
              type="button"
              className="rounded-md p-1 hover:bg-muted"
              aria-label="下个月"
              onClick={() => shift(1)}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* 星期表头（周一起） */}
          <div className="grid grid-cols-7 text-center text-[10px] text-muted-foreground">
            {['一', '二', '三', '四', '五', '六', '日'].map((w) => (
              <span key={w} className="py-1">
                {w}
              </span>
            ))}
          </div>

          {/* 日期网格 */}
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: lead }).map((_, i) => (
              <span key={'blank' + i} />
            ))}
            {Array.from({ length: days }).map((_, i) => {
              const day = i + 1;
              const key = `${view.y}-${view.m}-${day}`;
              const selected = key === valueKey;
              const isToday = key === todayKey;
              return (
                <button
                  key={day}
                  type="button"
                  className={cn(
                    'h-7 rounded-md text-center text-xs leading-7 transition-colors',
                    selected
                      ? 'bg-primary font-medium text-primary-foreground'
                      : 'hover:bg-accent hover:text-accent-foreground',
                    isToday && !selected && 'font-semibold text-primary',
                  )}
                  onClick={() => pick(day)}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* 快捷操作 */}
          <div className="mt-1 flex items-center justify-between border-t pt-1.5">
            <button
              type="button"
              className="rounded-sm px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                onChange(startOfDay(new Date()));
                setOpen(false);
              }}
            >
              今天
            </button>
            {value != null && (
              <button
                type="button"
                className="rounded-sm px-1.5 py-0.5 text-xs text-muted-foreground hover:text-destructive"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                清除
              </button>
            )}
          </div>
        </div>,
          document.body,
        )}
    </div>
  );
}
