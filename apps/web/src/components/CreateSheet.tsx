/**
 * 移动端悬浮新建入口（lg 以下显示）：
 *   右下角 FAB → 底部抽屉选择类型 → 新建任务 / 新建笔记表单。
 * 桌面端不渲染（中栏顶部已有快速添加与速记捕捉框）。
 */
import * as React from 'react';
import { CheckCircle2, NotebookPen, Plus, X } from 'lucide-react';
import { api } from '../lib/api';
import { useData } from '../lib/store';
import { Button } from './ui/button';
import { Input, Textarea } from './ui/input';
import { DatePicker } from './ui/datepicker';
import { Spinner } from './ui/misc';
import { TagEditor } from './TagEditor';

type SheetKind = 'choose' | 'task' | 'note';

export function CreateFab({ defaultListId }: { defaultListId?: string }) {
  const { refresh } = useData();
  const [sheet, setSheet] = React.useState<SheetKind | null>(null);

  React.useEffect(() => {
    if (!sheet) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheet(null);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [sheet]);

  const onCreated = () => {
    setSheet(null);
    void refresh(true);
  };

  return (
    <>
      <button
        type="button"
        aria-label="新建任务或笔记"
        className="fixed bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95 lg:hidden"
        onClick={() => setSheet('choose')}
      >
        <Plus className="h-6 w-6" strokeWidth={2.5} />
      </button>

      {sheet && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 animate-fade-in-backdrop bg-black/50"
            onClick={() => setSheet(null)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[88vh] animate-slide-in-up overflow-y-auto overscroll-contain rounded-t-2xl bg-card shadow-xl">
            {sheet === 'choose' ? (
              <ChooseSheet onChoose={setSheet} onClose={() => setSheet(null)} />
            ) : sheet === 'task' ? (
              <TaskCreateForm
                defaultListId={defaultListId}
                onCancel={() => setSheet(null)}
                onCreated={onCreated}
              />
            ) : (
              <NoteCreateForm onCancel={() => setSheet(null)} onCreated={onCreated} />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <>
      <div className="flex justify-center pt-2" aria-hidden="true">
        <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
      </div>
      <div className="flex items-center justify-between px-4 pb-2 pt-2">
        <h2 className="text-base font-semibold">{title}</h2>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} title="关闭">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </>
  );
}

function ChooseSheet({ onChoose, onClose }: { onChoose: (k: SheetKind) => void; onClose: () => void }) {
  return (
    <div className="px-4 pb-6">
      <SheetHeader title="新建" onClose={onClose} />
      <div className="mt-1 space-y-3">
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-accent"
          onClick={() => onChoose('task')}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium">新建任务</span>
            <span className="block text-xs text-muted-foreground">添加一条待办，可设清单 / 截止 / 标签</span>
          </span>
        </button>
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-accent"
          onClick={() => onChoose('note')}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <NotebookPen className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium">新建笔记</span>
            <span className="block text-xs text-muted-foreground">随手记点什么，支持标题 / 正文 / 标签</span>
          </span>
        </button>
      </div>
    </div>
  );
}

function TaskCreateForm({
  defaultListId,
  onCancel,
  onCreated,
}: {
  defaultListId?: string;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const { data } = useData();
  const lists = data?.lists ?? [];
  const [listId, setListId] = React.useState(defaultListId ?? lists[0]?.id ?? '');
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [due, setDue] = React.useState<number | null>(null);
  const [tags, setTags] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t || !listId || busy) return;
    setBusy(true);
    try {
      await api.createTask(listId, t, {
        description: description.trim(),
        dueDate: due,
        tags,
      });
      onCreated();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="px-4 pb-6">
      <SheetHeader title="新建任务" onClose={onCancel} />
      <div className="mt-1 space-y-3">
        <Input
          autoFocus
          placeholder="任务标题"
          value={title}
          disabled={busy}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Textarea
          rows={2}
          placeholder="描述（可选）"
          value={description}
          disabled={busy}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="flex gap-2">
          <select
            className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={listId}
            onChange={(e) => setListId(e.target.value)}
          >
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <div className="w-40 shrink-0">
            <DatePicker value={due} onChange={setDue} placeholder="截止日期" variant="field" />
          </div>
        </div>
        <TagEditor
          tags={tags}
          allItems={[...(data?.tasks ?? []), ...(data?.notes ?? [])]}
          onChange={setTags}
        />
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            取消
          </Button>
          <Button type="submit" disabled={busy || !title.trim() || !listId}>
            {busy && <Spinner className="text-primary-foreground" />}
            保存
          </Button>
        </div>
      </div>
    </form>
  );
}

function NoteCreateForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: () => void }) {
  const { data } = useData();
  const [title, setTitle] = React.useState('');
  const [content, setContent] = React.useState('');
  const [tags, setTags] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await api.createNote(t, content.trim(), tags);
      onCreated();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="px-4 pb-6">
      <SheetHeader title="新建笔记" onClose={onCancel} />
      <div className="mt-1 space-y-3">
        <Input
          autoFocus
          placeholder="笔记标题"
          value={title}
          disabled={busy}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Textarea
          rows={4}
          placeholder="正文（可选）"
          value={content}
          disabled={busy}
          onChange={(e) => setContent(e.target.value)}
        />
        <TagEditor
          tags={tags}
          allItems={[...(data?.tasks ?? []), ...(data?.notes ?? [])]}
          onChange={setTags}
        />
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            取消
          </Button>
          <Button type="submit" disabled={busy || !title.trim()}>
            {busy && <Spinner className="text-primary-foreground" />}
            保存
          </Button>
        </div>
      </div>
    </form>
  );
}
