/**
 * 中栏·快捷笔记列表：桌面顶部极速捕捉（NoteCapture）+ 按修改时间倒序的笔记行；
 * 点击行 → 右栏（NoteDetailPanel）查看编辑（自动保存）。
 */
import * as React from 'react';
import { ArrowUp, NotebookPen } from 'lucide-react';
import { api, type Note } from '../lib/api';
import { useData } from '../lib/store';
import { cn } from '../lib/cn';
import { Textarea } from './ui/input';
import { EmptyState, Spinner } from './ui/misc';
import { TagChip } from './TagEditor';

/**
 * 速记捕捉框：首行为标题、可含多行正文；保存按钮内置于输入框右下角（icon 形式），
 * 无底部工具条。Ctrl/⌘+Enter 同样保存。桌面与「全部」页速记区共用。
 */
export function NoteCapture({ className }: { className?: string }) {
  const { refresh } = useData();
  const [draft, setDraft] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const capture = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const raw = draft.trim();
    if (!raw || busy) return;
    const [first, ...rest] = raw.split('\n');
    setBusy(true);
    try {
      await api.createNote((first ?? '').trim() || '无标题笔记', rest.join('\n').trim());
      setDraft('');
      void refresh(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void capture(e)} className={cn('relative', className)}>
      <Textarea
        placeholder={'记点什么…首行为标题，回车换行写正文，Ctrl/⌘+Enter 保存'}
        rows={3}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void capture();
        }}
        className="resize-none pb-11"
      />
      <button
        type="submit"
        title="保存（Ctrl/⌘ + Enter）"
        aria-label="保存笔记"
        disabled={busy || !draft.trim()}
        className="absolute bottom-2.5 right-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-40"
      >
        {busy ? <Spinner className="h-4 w-4 text-primary-foreground" /> : <ArrowUp className="h-4 w-4" />}
      </button>
    </form>
  );
}

export function NotesView({
  selectedNoteId,
  onSelectNote,
}: {
  selectedNoteId: string | null;
  onSelectNote: (id: string | null) => void;
}) {
  const { data } = useData();

  if (!data) return null;
  const notes = [...data.notes].sort((a, b) => b.modifiedAt - a.modifiedAt);

  return (
    <div className="animate-fade-in">
      <div className="bg-card/80 px-4 py-3 backdrop-blur md:px-6">
        <div className="flex items-baseline justify-between">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <NotebookPen className="h-5 w-5 text-primary" />
            快捷笔记
          </h1>
          <span className="text-xs text-muted-foreground">{notes.length} 条</span>
        </div>
        {/* 桌面捕捉入口；移动端走右下角悬浮新建 */}
        <NoteCapture className="mt-3 hidden lg:block" />
      </div>

      <div className="px-2 py-2 md:px-4">
        {notes.length === 0 && <EmptyState>还没有笔记</EmptyState>}
        {notes.map((n) => (
          <NoteRow key={n.id} note={n} selected={selectedNoteId === n.id} onSelect={onSelectNote} />
        ))}
      </div>
    </div>
  );
}

export function NoteRow({
  note,
  selected,
  onSelect,
}: {
  note: Note;
  selected: boolean;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        'cursor-pointer rounded-md px-2 py-2 transition-colors',
        selected ? 'bg-accent' : 'hover:bg-muted/60',
      )}
      onClick={() => onSelect(selected ? null : note.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(selected ? null : note.id);
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{note.title}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {note.modifiedAt
            ? new Date(note.modifiedAt).toLocaleString('zh-CN', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : ''}
        </span>
      </div>
      {note.content && (
        <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
          {note.content}
        </p>
      )}
      {note.tags.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {note.tags.slice(0, 4).map((t) => (
            <TagChip key={t} name={t} />
          ))}
          {note.tags.length > 4 && (
            <span className="text-xs text-muted-foreground">+{note.tags.length - 4}</span>
          )}
        </div>
      )}
    </div>
  );
}
