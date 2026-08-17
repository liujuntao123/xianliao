/**
 * 第三栏·任务详情：选中任务后常驻展示（桌面）/底部向上抽屉（移动端）。
 * Header 左侧即所属清单切换（下拉）；其下一行左为截止日期、右为子任务数，
 * 下方紧贴子任务进度条。正文区无表单标签：标题、描述（无边框）、标签
 * 直接编辑，防抖自动保存；删除入口收在 Header 右上角菜单中。
 */
import * as React from 'react';
import { CalendarDays, ChevronDown, Inbox, ListChecks, MousePointerClick, Plus, Trash2, X } from 'lucide-react';
import { api, type Subtask, type Task } from '../lib/api';
import { useData } from '../lib/store';
import { useAutosave } from '../lib/useAutosave';
import { sortSubtasks } from '../lib/sort';
import { cn } from '../lib/cn';
import { Checkbox } from './ui/checkbox';
import { Button } from './ui/button';
import { HeaderMenu } from './ui/menu';
import { DatePicker } from './ui/datepicker';
import { ConfirmDialog, SaveStateHint, Spinner } from './ui/misc';
import { TagEditor } from './TagEditor';

export function TaskDetailPanel({
  task,
  onClose,
  onDeleted,
  onMoved,
}: {
  task: Task;
  onClose: () => void;
  onDeleted: (id: string) => void;
  onMoved: (id: string, listId: string) => void;
}) {
  const { data, mutateLocal, refresh } = useData();
  // 确认框打开与删除在途是两个独立状态：打开即可点击，确认后才进入 busy
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const subtasks = React.useMemo(
    () => sortSubtasks((data?.subtasks ?? []).filter((s) => s.taskId === task.id)),
    [data, task.id],
  );
  const doneSubs = subtasks.filter((s) => s.completed).length;

  // ---- 标题：防抖自动保存 ----
  const [title, setTitle] = React.useState(task.title);
  React.useEffect(() => setTitle(task.title), [task.id]); // 仅切换任务时重置，不覆盖编辑草稿

  const titleSave = useAutosave({
    value: title,
    save: async (v) => {
      const t = v.trim();
      if (!t || t === task.title) return; // 空标题不落库
      await api.updateTask(task.id, { title: t });
      void refresh(true);
    },
  });

  // ---- 描述：防抖自动保存（空 = 清空，合法） ----
  const [description, setDescription] = React.useState(task.description);
  React.useEffect(() => setDescription(task.description), [task.id]);

  const descSave = useAutosave({
    value: description,
    save: async (v) => {
      if (v === task.description) return;
      await api.updateTask(task.id, { description: v });
      void refresh(true);
    },
  });

  // ---- 标签：改动即存 ----
  const [tagBusy, setTagBusy] = React.useState(false);
  const setTags = async (tags: string[]) => {
    if (!data) return;
    mutateLocal({
      ...data,
      tasks: data.tasks.map((t) => (t.id === task.id ? { ...t, tags } : t)),
    });
    setTagBusy(true);
    try {
      await api.updateTask(task.id, { tags });
    } finally {
      setTagBusy(false);
      void refresh(true);
    }
  };

  // ---- 完成状态：乐观更新 ----
  const toggle = async (checked: boolean) => {
    if (!data) return;
    mutateLocal({
      ...data,
      tasks: data.tasks.map((t) => (t.id === task.id ? { ...t, completed: checked } : t)),
    });
    try {
      await api.updateTask(task.id, { completed: checked });
    } finally {
      void refresh(true);
    }
  };

  // ---- 截止日期：改动即存 ----
  const [dueBusy, setDueBusy] = React.useState(false);
  const setDue = async (v: number | null) => {
    if (v === task.dueDate) return;
    setDueBusy(true);
    try {
      await api.updateTask(task.id, { dueDate: v });
      void refresh(true);
    } finally {
      setDueBusy(false);
    }
  };

  // ---- 所属清单 ----
  const moveList = async (listId: string) => {
    if (listId === task.listId) return;
    await api.updateTask(task.id, { listId });
    void refresh(true);
    onMoved(task.id, listId);
  };

  // ---- 删除 ----
  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await api.deleteTask(task.id);
      setDeleting(false);
      setConfirmingDelete(false);
      onDeleted(task.id);
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

      {/* Header：左＝所属清单切换，右＝菜单 / 关闭 */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-1">
          <Inbox className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="relative min-w-0">
            <select
              className="max-w-[9.5rem] cursor-pointer appearance-none truncate rounded-sm bg-transparent py-0.5 pl-1 pr-4 text-sm font-medium outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
              value={task.listId}
              onChange={(e) => void moveList(e.target.value)}
              aria-label="所属清单"
              title="切换所属清单"
            >
              {(data?.lists ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <HeaderMenu
            items={[
              {
                label: '删除任务',
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

      {/* 信息行：左＝截止日期，右＝子任务数 */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-1.5 text-xs text-muted-foreground">
        <div className="flex min-w-0 items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5 shrink-0" />
          <DatePicker value={task.dueDate} onChange={(ts) => void setDue(ts)} placeholder="设置截止日期" />
          {dueBusy && <Spinner className="h-3 w-3" />}
        </div>
        {subtasks.length > 0 && (
          <span className="flex shrink-0 items-center gap-1" title="子任务进度">
            <ListChecks className="h-3.5 w-3.5" />
            {doneSubs}/{subtasks.length}
          </span>
        )}
      </div>

      {/* 子任务完成进度条 */}
      {subtasks.length > 0 && (
        <div
          className="h-1 w-full shrink-0 bg-muted/70"
          role="progressbar"
          aria-label="子任务完成进度"
          aria-valuemin={0}
          aria-valuemax={subtasks.length}
          aria-valuenow={doneSubs}
        >
          <div
            className="h-full bg-primary transition-[width] duration-300"
            style={{ width: `${(doneSubs / subtasks.length) * 100}%` }}
          />
        </div>
      )}

      <div key={task.id} className="min-h-0 flex-1 animate-fade-in overflow-y-auto overscroll-contain">
        {/* 主任务区：标题 / 描述 / 标签，保存提示浮动展示（空闲零占位） */}
        <div className="flex items-start gap-3 px-4 pt-4">
          <div className="pt-[5px]">
            <Checkbox checked={task.completed} onChange={toggle} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="relative">
              <input
                className={cn(
                  // 常态保留与聚焦一致的 padding，保证标题与复选框稳定对齐、聚焦无跳动
                  'w-full rounded-md bg-transparent px-1.5 py-0.5 pr-14 text-base font-semibold outline-none transition-colors focus:bg-muted/50',
                  task.completed && 'text-muted-foreground line-through',
                )}
                value={title}
                placeholder="任务标题"
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => {
                  if (!title.trim()) setTitle(task.title); // 空标题回退
                  else titleSave.flush();
                }}
              />
              <div className="absolute right-1 top-1">
                <SaveStateHint state={titleSave.state} onRetry={titleSave.flush} />
              </div>
            </div>

            {/* 描述：单行无边框，紧贴标题 */}
            <div className="relative mt-px">
              <input
                className="w-full truncate rounded-md bg-transparent px-1.5 py-px text-sm outline-none placeholder:text-muted-foreground/60 focus:bg-muted/40"
                placeholder="添加描述…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => {
                  // 单行：换行符剥掉再落库
                  if (description !== description.replace(/\n/g, '')) setDescription(description.replace(/\n/g, ''));
                  descSave.flush();
                }}
              />
              <div className="absolute right-1 top-0.5">
                <SaveStateHint state={descSave.state} onRetry={descSave.flush} />
              </div>
            </div>

            {/* 标签：紧贴描述 */}
            <div className="mt-px pl-1.5">
              <TagEditor
                tags={task.tags}
                allItems={[...(data?.tasks ?? []), ...(data?.notes ?? [])]}
                onChange={(t) => void setTags(t)}
              />
              {tagBusy && (
                <div className="flex h-4 items-center">
                  <Spinner className="h-3 w-3" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 子任务区：缩进对齐主任务标题文本起点（52px），字号/字重弱于主任务 */}
        <div className="mt-5 border-t py-2 pl-12 pr-4">
          <div className="space-y-0.5">
            {subtasks.map((s) => (
              <SubtaskRow key={s.id} subtask={s} />
            ))}
          </div>
          <AddSubtaskForm taskId={task.id} />
        </div>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={confirmDelete}
        title="删除任务"
        description="将同时删除其全部子任务，且不可恢复。"
        confirmText="删除"
        busy={deleting}
      />
    </div>
  );
}

/** 未选中任务时的占位面板 */
export function TaskDetailPlaceholder() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-card px-8 text-center text-muted-foreground">
      <MousePointerClick className="h-8 w-8 opacity-40" />
      <p className="text-sm">选择一个任务查看详情</p>
    </div>
  );
}

function AddSubtaskForm({ taskId }: { taskId: string }) {
  const { refresh } = useData();
  const [title, setTitle] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = title.trim();
    if (!v || busy) return;
    setBusy(true);
    try {
      await api.createSubtask(taskId, v);
      setTitle('');
      void refresh(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={add} className="mt-1 flex items-center gap-2 border-t border-dashed pt-2.5">
      <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <input
        className="w-full bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
        placeholder="添加子任务，回车保存"
        value={title}
        disabled={busy}
        onChange={(e) => setTitle(e.target.value)}
      />
      {busy && <Spinner className="h-3.5 w-3.5" />}
    </form>
  );
}

function SubtaskRow({ subtask }: { subtask: Subtask }) {
  const { data, mutateLocal, refresh } = useData();
  const [title, setTitle] = React.useState(subtask.title);
  React.useEffect(() => setTitle(subtask.title), [subtask.id]);

  const save = useAutosave({
    value: title,
    delay: 500,
    save: async (v) => {
      const t = v.trim();
      if (!t || t === subtask.title) return;
      await api.updateSubtask(subtask.id, { title: t });
      void refresh(true);
    },
  });

  const toggle = async (checked: boolean) => {
    if (!data) return;
    mutateLocal({
      ...data,
      subtasks: data.subtasks.map((s) => (s.id === subtask.id ? { ...s, completed: checked } : s)),
    });
    try {
      await api.updateSubtask(subtask.id, { completed: checked });
    } finally {
      void refresh(true);
    }
  };

  const remove = async () => {
    await api.deleteSubtask(subtask.id);
    void refresh(true);
  };

  return (
    <div className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/50">
      <Checkbox size="sm" checked={subtask.completed} onChange={toggle} />
      <input
        className={cn(
          'w-full flex-1 bg-transparent text-sm outline-none',
          subtask.completed ? 'text-muted-foreground line-through' : 'text-foreground/75',
        )}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => {
          if (!title.trim()) setTitle(subtask.title);
          else save.flush();
        }}
      />
      {save.state === 'saving' && <Spinner className="h-3 w-3 shrink-0" />}
      <button
        className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
        title="删除子任务"
        onClick={() => void remove()}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
