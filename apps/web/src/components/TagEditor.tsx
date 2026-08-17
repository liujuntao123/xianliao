/**
 * 标签编辑器：任务详情 / 笔记详情共用。
 * - 已有标签以彩色 Badge 展示，点 × 移除
 * - 内联输入：回车 / 逗号确认；下拉建议来自全局已用标签（点击选择）
 * - 变更即时回调 onChange（由调用方负责保存）
 */
import * as React from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from '../lib/cn';
import { collectTags, tagStyle, useIsDark } from '../lib/tags';

export function TagChip({ name, onRemove }: { name: string; onRemove?: () => void }) {
  const dark = useIsDark();
  return (
    <span
      className="inline-flex max-w-full items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium"
      style={tagStyle(name, dark)}
      title={name}
    >
      <span className="truncate">{name}</span>
      {onRemove && (
        <button
          type="button"
          className="-mr-0.5 shrink-0 rounded-full p-0.5 opacity-60 transition-opacity hover:opacity-100"
          aria-label={`移除标签 ${name}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

export function TagEditor({
  tags,
  allItems,
  onChange,
}: {
  tags: string[];
  /** 全部任务+笔记，用于收集标签建议 */
  allItems: { tags: string[] }[];
  onChange: (tags: string[]) => void;
}) {
  const dark = useIsDark();
  const [editing, setEditing] = React.useState(false);
  const [input, setInput] = React.useState('');
  const suggestions = React.useMemo(() => collectTags(allItems), [allItems]);

  const addTag = (raw: string) => {
    const t = raw.trim().replace(/^#/, '').slice(0, 50);
    if (!t || tags.includes(t)) {
      setInput('');
      return;
    }
    onChange([...tags, t]);
    setInput('');
  };

  const removeTag = (t: string) => onChange(tags.filter((x) => x !== t));

  const filtered = input
    ? suggestions.filter((s) => !tags.includes(s) && s.toLowerCase().includes(input.trim().toLowerCase()))
    : suggestions.filter((s) => !tags.includes(s));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <TagChip key={t} name={t} onRemove={() => removeTag(t)} />
      ))}

      {editing ? (
        <div className="relative inline-flex min-w-[9rem] flex-1 items-center">
          <input
            autoFocus
            className="w-full min-w-0 rounded-full border border-input bg-background px-2.5 py-0.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="标签名，回车确认"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onBlur={() => {
              if (input.trim()) addTag(input);
              else setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
                e.preventDefault();
                addTag(input);
              }
              if (e.key === 'Escape') {
                setInput('');
                setEditing(false);
              }
            }}
          />
          {filtered.length > 0 && (
            <div className="absolute left-0 top-full z-20 mt-1 max-h-44 w-64 max-w-full overflow-y-auto rounded-md border bg-card p-1 shadow-lg">
              {filtered.slice(0, 12).map((s) => (
                <button
                  key={s}
                  type="button"
                  className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs hover:bg-accent"
                  onMouseDown={(e) => e.preventDefault()} // 抢在 blur 前生效
                  onClick={() => addTag(s)}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={tagStyle(s, dark)} />
                  <span className="truncate">{s}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-0.5 rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground',
            'transition-colors hover:border-foreground/30 hover:text-foreground',
          )}
          onClick={() => setEditing(true)}
        >
          <Plus className="h-3 w-3" />
          标签
        </button>
      )}
    </div>
  );
}
