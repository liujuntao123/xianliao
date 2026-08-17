/**
 * 第三栏·笔记详情：选中笔记后常驻展示（桌面）/底部向上抽屉（移动端）。
 * 标题、正文、标签随时可编辑，文本防抖自动保存（与任务详情同一套交互），
 * 无「编辑」按钮；删除入口收在 Header 右上角菜单中。
 */
import * as React from 'react';
import { NotebookPen, Trash2, X } from 'lucide-react';
import { api, type Note } from '../lib/api';
import { useData } from '../lib/store';
import { useAutosave } from '../lib/useAutosave';
import { cn } from '../lib/cn';
import { Button } from './ui/button';
import { HeaderMenu } from './ui/menu';
import { ConfirmDialog, SaveStateHint, Spinner } from './ui/misc';
import { TagEditor } from './TagEditor';

export function NoteDetailPanel({
  note,
  onClose,
  onDeleted,
}: {
  note: Note;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const { data, mutateLocal, refresh } = useData();
  // 确认框打开与删除在途是两个独立状态：打开即可点击，确认后才进入 busy
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  // ---- 标题：防抖自动保存 ----
  const [title, setTitle] = React.useState(note.title);
  React.useEffect(() => setTitle(note.title), [note.id]); // 仅切换笔记时重置

  const titleSave = useAutosave({
    value: title,
    save: async (v) => {
      const t = v.trim() || '无标题笔记';
      if (t === note.title) return;
      await api.updateNote(note.id, { title: t });
      void refresh(true);
    },
  });

  // ---- 正文：防抖自动保存 ----
  const [content, setContent] = React.useState(note.content);
  React.useEffect(() => setContent(note.content), [note.id]);

  const contentSave = useAutosave({
    value: content,
    save: async (v) => {
      if (v === note.content) return;
      await api.updateNote(note.id, { content: v });
      void refresh(true);
    },
  });

  // ---- 标签：改动即存 ----
  const [tagBusy, setTagBusy] = React.useState(false);
  const setTags = async (tags: string[]) => {
    if (!data) return;
    mutateLocal({
      ...data,
      notes: data.notes.map((n) => (n.id === note.id ? { ...n, tags } : n)),
    });
    setTagBusy(true);
    try {
      await api.updateNote(note.id, { tags });
    } finally {
      setTagBusy(false);
      void refresh(true);
    }
  };

  // ---- 删除 ----
  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await api.deleteNote(note.id);
      setDeleting(false);
      setConfirmingDelete(false);
      onDeleted(note.id);
      void refresh(true);
    } catch {
      setDeleting(false);
    }
  };

  // Esc 关闭（移动端抽屉）
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-card">
      {/* 移动端底部抽屉把手 */}
      <div className="flex shrink-0 justify-center pt-2 lg:hidden" aria-hidden="true">
        <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
      </div>

      <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-medium text-muted-foreground">笔记详情</h2>
        <div className="flex items-center gap-0.5">
          <HeaderMenu
            items={[
              {
                label: '删除笔记',
                icon: <Trash2 className="h-4 w-4" />,
                destructive: true,
                onSelect: () => setConfirmingDelete(true),
              },
            ]}
          />
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} title="关闭">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div key={note.id} className="min-h-0 flex-1 animate-fade-in overflow-y-auto overscroll-contain px-4 pt-4">
        <div className="relative">
          <input
            className="w-full rounded-md bg-transparent px-1.5 py-0.5 pr-14 text-base font-semibold outline-none transition-colors focus:bg-muted/50"
            value={title}
            placeholder="笔记标题"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => titleSave.flush()}
          />
          <div className="absolute right-1 top-1">
            <SaveStateHint state={titleSave.state} onRetry={titleSave.flush} />
          </div>
        </div>

        {/* 标签：紧贴标题 */}
        <div className="mt-0.5 pl-1.5">
          <TagEditor
            tags={note.tags}
            allItems={[...(data?.tasks ?? []), ...(data?.notes ?? [])]}
            onChange={(t) => void setTags(t)}
          />
          {tagBusy && (
            <div className="flex h-4 items-center">
              <Spinner className="h-3 w-3" />
            </div>
          )}
        </div>

        {/* 正文：无边框速记式，保存提示浮动展示（空闲零占位） */}
        <div className="relative mt-1.5">
          <textarea
            ref={(el) => {
              if (el) fitTextarea(el);
            }}
            rows={8}
            className="w-full resize-none rounded-md bg-transparent px-1.5 py-0.5 pr-14 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/60 focus:bg-muted/40"
            placeholder="记点什么…（自动保存）"
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              fitTextarea(e.target);
            }}
            onBlur={contentSave.flush}
          />
          <div className="absolute right-1 top-1">
            <SaveStateHint state={contentSave.state} onRetry={contentSave.flush} />
          </div>
        </div>

        <p className={cn('pb-4 pt-1 text-xs text-muted-foreground')}>
          {note.modifiedAt
            ? '修改于 ' +
              new Date(note.modifiedAt).toLocaleString('zh-CN', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : ''}
        </p>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={confirmDelete}
        title="删除笔记"
        description="删除后不可恢复。"
        confirmText="删除"
        busy={deleting}
      />
    </div>
  );
}

/** 未选中笔记时的占位面板 */
export function NoteDetailPlaceholder() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-card px-8 text-center text-muted-foreground">
      <NotebookPen className="h-8 w-8 opacity-40" />
      <p className="text-sm">选择一条笔记查看详情</p>
    </div>
  );
}

/** textarea 自动增高（内容超出时撑开，配合底部向上抽屉）。 */
function fitTextarea(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = Math.max(el.scrollHeight, 96) + 'px';
}
