/**
 * 任务列表视图：快速添加 + 未完成区 + 可折叠已完成区 + 子任务展开。
 * 「全部」视图按清单分组展示。
 */
import * as React from 'react';
import { CalendarDays, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { api, type Subtask, type Task } from '../lib/api';
import { useData } from '../lib/store';
import { sortSubtasks, sortTasks } from '../lib/sort';
import type { View } from './AppShell';
import { Checkbox } from './ui/checkbox';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { EmptyState, Spinner } from './ui/misc';
import { formatDue } from '../lib/sort';

export function TaskListView({ view }: { view: View }) {
  const { data } = useData();
  const [title, setTitle] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [showDone, setShowDone] = React.useState(false);

  if (!data) return null;
  const lists = data.lists;
  const currentList = view.kind === 'list' ? lists.find((l) => l.id === view.listId) : null;
  const defaultListId = lists[0]?.id;

  const tasks = view.kind === 'list' ? data.tasks.filter((t) => t.listId === view.listId) : data.tasks;
  const sorted = sortTasks(tasks);
  const open = sorted.filter((t) => !t.completed);
  const done = sorted.filter((t) => t.completed);

  const subtasksByTask = React.useMemo(() => {
    const m = new Map<string, Subtask[]>();
    for (const s of data.subtasks) {
      const arr = m.get(s.taskId) ?? [];
      arr.push(s);
      m.set(s.taskId, arr);
    }
    return m;
  }, [data.subtasks]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = title.trim();
    if (!v || busy) return;
    const listId = view.kind === 'list' ? view.listId : defaultListId;
    if (!listId) return;
    setBusy(true);
    try {
      await api.createTask(listId, v);
      setTitle('');
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <div className="border-b bg-card/80 px-4 py-3 backdrop-blur md:px-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold">
          {view.kind === 'all' ? '全部' : currentList?.name ?? '清单'}
        </h1>
        <span className="text-xs text-muted-foreground">
          {open.length} 个未完成{done.length > 0 ? ` · ${done.length} 个已完成` : ''}
        </span>
      </div>
      <form onSubmit={add} className="mt-3 flex items-center gap-2">
        <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          className="w-full bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
          placeholder={
            view.kind === 'all' && currentList === null && lists[0]
              ? `添加任务到「${lists[0]?.name}」，回车保存`
              : '添加任务，回车保存'
          }
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        {busy && <Spinner />}
      </form>
    </div>
  );

  if (lists.length === 0) {
    return (
      <div>
        {header}
        <EmptyState>先在左侧创建一个清单</EmptyState>
      </div>
    );
  }

  return (
    <div>
      {header}
      <div className="px-2 py-2 md:px-4">
        {open.length === 0 && <EmptyState>没有未完成的任务 🎉</EmptyState>}
        {view.kind === 'all'
          ? lists
              .filter((l) => open.some((t) => t.listId === l.id))
              .map((l) => (
                <section key={l.id} className="mb-4">
                  <h2 className="px-2 pb-1 pt-3 text-xs font-medium text-muted-foreground">{l.name}</h2>
                  {open
                    .filter((t) => t.listId === l.id)
                    .map((t) => (
                      <TaskItem key={t.id} task={t} subtasks={subtasksByTask.get(t.id) ?? []} />
                    ))}
                </section>
              ))
          : open.map((t) => <TaskItem key={t.id} task={t} subtasks={subtasksByTask.get(t.id) ?? []} />)}

        {done.length > 0 && (
          <>
            <button
              className="mt-4 flex w-full items-center gap-1 px-2 py-2 text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setShowDone(!showDone)}
            >
              {showDone ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              已完成（{done.length}）
            </button>
            {showDone &&
              done.map((t) => <TaskItem key={t.id} task={t} subtasks={subtasksByTask.get(t.id) ?? []} />)}
          </>
        )}
      </div>
    </div>
  );
}

function TaskItem({ task, subtasks }: { task: Task; subtasks: Subtask[] }) {
  const { data, mutateLocal, refresh } = useData();
  const [expanded, setExpanded] = React.useState(false);
  const [subtaskTitle, setSubtaskTitle] = React.useState('');
  const [editingTitle, setEditingTitle] = React.useState(false);
  const [titleDraft, setTitleDraft] = React.useState(task.title);
  const [busy, setBusy] = React.useState(false);
  const sortedSubs = sortSubtasks(subtasks);
  const doneSubs = subtasks.filter((s) => s.completed).length;

  const toggle = async (checked: boolean) => {
    if (!data) return;
    mutateLocal({
      ...data,
      tasks: data.tasks.map((t) => (t.id === task.id ? { ...t, completed: checked } : t)),
    });
    try {
      await api.updateTask(task.id, { completed: checked });
      void refresh(true);
    } catch {
      void refresh(true); // 回滚交给刷新
    }
  };

  const saveTitle = async () => {
    const v = titleDraft.trim();
    setEditingTitle(false);
    if (!v || v === task.title) {
      setTitleDraft(task.title);
      return;
    }
    await api.updateTask(task.id, { title: v });
    void refresh(true);
  };

  const addSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = subtaskTitle.trim();
    if (!v) return;
    setBusy(true);
    try {
      await api.createSubtask(task.id, v);
      setSubtaskTitle('');
      void refresh(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="group rounded-md px-2 py-0.5 hover:bg-muted/60">
      <div className="flex items-start gap-2 py-2">
        <div className="pt-0.5">
          <Checkbox checked={task.completed} onChange={toggle} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {editingTitle ? (
              <input
                autoFocus
                className="w-full rounded border bg-background px-1 py-0.5 text-sm outline-none"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveTitle();
                  if (e.key === 'Escape') {
                    setTitleDraft(task.title);
                    setEditingTitle(false);
                  }
                }}
              />
            ) : (
              <span
                className={task.completed ? 'text-sm text-muted-foreground line-through' : 'text-sm'}
                onDoubleClick={() => setEditingTitle(true)}
              >
                {task.title}
              </span>
            )}

            {task.dueDate != null &&
              (() => {
                const { text, overdue } = formatDue(task.dueDate);
                return (
                  <Badge
                    variant="secondary"
                    className={
                      task.completed
                        ? ''
                        : overdue
                          ? 'bg-destructive/15 text-destructive'
                          : 'text-accent-foreground'
                    }
                  >
                    <CalendarDays className="mr-1 h-3 w-3" />
                    {text}
                  </Badge>
                );
              })()}

            {subtasks.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {doneSubs}/{subtasks.length}
              </span>
            )}
          </div>

          {expanded && (
            <div className="mt-2 space-y-1.5 border-l-2 border-border pl-3">
              {sortedSubs.map((s) => (
                <SubtaskRow key={s.id} subtask={s} />
              ))}
              <form onSubmit={addSubtask} className="flex items-center gap-2 pt-1">
                <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                <input
                  className="w-full bg-transparent py-0.5 text-sm outline-none placeholder:text-muted-foreground"
                  placeholder="添加子任务"
                  value={subtaskTitle}
                  onChange={(e) => setSubtaskTitle(e.target.value)}
                />
                {busy && <Spinner />}
              </form>
              <div className="flex items-center gap-2 pt-1">
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  截止
                  <input
                    type="date"
                    className="rounded border bg-background px-1 py-0.5 text-xs"
                    value={task.dueDate ? toDateInput(task.dueDate) : ''}
                    onChange={async (e) => {
                      const v = e.target.value;
                      await api.updateTask(task.id, { dueDate: v ? new Date(v + 'T00:00:00').getTime() : null });
                      void refresh(true);
                    }}
                  />
                </label>
                {task.dueDate != null && (
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={async () => {
                      await api.updateTask(task.id, { dueDate: null });
                      void refresh(true);
                    }}
                  >
                    清除
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title={expanded ? '收起' : '展开详情'}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            title="删除任务"
            onClick={async () => {
              await api.deleteTask(task.id);
              void refresh(true);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function SubtaskRow({ subtask }: { subtask: Subtask }) {
  const { data, mutateLocal, refresh } = useData();
  const toggle = async (checked: boolean) => {
    if (!data) return;
    mutateLocal({
      ...data,
      subtasks: data.subtasks.map((s) => (s.id === subtask.id ? { ...s, completed: checked } : s)),
    });
    try {
      await api.updateSubtask(subtask.id, { completed: checked });
      void refresh(true);
    } catch {
      void refresh(true);
    }
  };
  return (
    <div className="group/sub flex items-center gap-2">
      <Checkbox size="sm" checked={subtask.completed} onChange={toggle} />
      <span className={subtask.completed ? 'flex-1 text-sm text-muted-foreground line-through' : 'flex-1 text-sm'}>
        {subtask.title}
      </span>
      <button
        className="text-muted-foreground opacity-0 hover:text-destructive group-hover/sub:opacity-100"
        onClick={async () => {
          await api.deleteSubtask(subtask.id);
          void refresh(true);
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function toDateInput(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
