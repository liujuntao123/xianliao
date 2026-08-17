/**
 * 中栏任务列表：快速添加 + 未完成区 + 可折叠已完成区。
 * 点击任务行 → 选中，右栏（TaskDetailPanel）展示子任务并提供全部编辑（自动保存）。
 * 「全部」视图按清单分组展示。
 */
import * as React from 'react';
import { CalendarDays, ChevronDown, ChevronRight, ListChecks, Plus, Trash2 } from 'lucide-react';
import { api, type Note, type Task } from '../lib/api';
import { useData } from '../lib/store';
import { sortTasks, formatDue } from '../lib/sort';
import type { View } from './AppShell';
import { Checkbox } from './ui/checkbox';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { EmptyState, Spinner } from './ui/misc';
import { cn } from '../lib/cn';
import { TagChip } from './TagEditor';
import { NoteCapture, NoteRow } from './NotesView';

export function TaskListView({
  view,
  selectedTaskId,
  onSelectTask,
  notes = [],
  selectedNoteId = null,
  onSelectNote,
}: {
  view: View;
  selectedTaskId: string | null;
  onSelectTask: (id: string | null) => void;
  /** 「全部」视图尾部展示的速记（按修改时间倒序）。 */
  notes?: Note[];
  selectedNoteId?: string | null;
  onSelectNote?: (id: string | null) => void;
}) {
  const { data, refresh } = useData();
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

  const subtaskStats = React.useMemo(() => {
    const total = new Map<string, number>();
    const done = new Map<string, number>();
    for (const s of data.subtasks) {
      total.set(s.taskId, (total.get(s.taskId) ?? 0) + 1);
      if (s.completed) done.set(s.taskId, (done.get(s.taskId) ?? 0) + 1);
    }
    return { total, done };
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
      void refresh(true); // 立即拉取，新任务即时出现在列表
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <div className="bg-card/80 px-4 py-3 backdrop-blur md:px-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold">{view.kind === 'all' ? '全部' : currentList?.name ?? '清单'}</h1>
        <span className="text-xs text-muted-foreground">
          {open.length} 个未完成{done.length > 0 ? ` · ${done.length} 个已完成` : ''}
        </span>
      </div>
      {/* 快速添加：桌面显示；移动端用右下角悬浮新建入口替代 */}
      <form onSubmit={add} className="mt-3 hidden items-center gap-2 lg:flex">
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
        <EmptyState>创建一个清单开始</EmptyState>
      </div>
    );
  }

  const renderItem = (t: Task) => (
    <TaskItem
      key={t.id}
      task={t}
      subtaskTotal={subtaskStats.total.get(t.id) ?? 0}
      subtaskDone={subtaskStats.done.get(t.id) ?? 0}
      selected={selectedTaskId === t.id}
      onSelect={onSelectTask}
    />
  );

  return (
    <div key={view.kind === 'list' ? view.listId : 'all'} className="animate-fade-in">
      {header}
      <div className="px-2 py-2 md:px-4">
        {open.length === 0 && <EmptyState>没有未完成的任务</EmptyState>}
        {view.kind === 'all'
          ? lists
              .filter((l) => open.some((t) => t.listId === l.id))
              .map((l) => (
                <section key={l.id} className="mb-4">
                  <h2 className="px-2 pb-1 pt-3 text-xs font-medium text-muted-foreground">{l.name}</h2>
                  {open.filter((t) => t.listId === l.id).map(renderItem)}
                </section>
              ))
          : open.map(renderItem)}

        {done.length > 0 && (
          <>
            <button
              className="mt-4 flex w-full items-center gap-1 px-2 py-2 text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setShowDone(!showDone)}
            >
              {showDone ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              已完成（{done.length}）
            </button>
            {showDone && done.map(renderItem)}
          </>
        )}

        {/* 「全部」视图尾部：速记区（笔记新建入口 + 列表，与任务共享同一套选中/详情交互） */}
        {view.kind === 'all' && (
          <section className="mt-4 border-t pt-1">
            <h2 className="px-2 pb-1 pt-3 text-xs font-medium text-muted-foreground">
              速记{notes.length > 0 ? `（${notes.length}）` : ''}
            </h2>
            {/* 桌面笔记新建入口（与顶部任务快速添加构成「全部」页的两个新建入口）；移动端走 FAB */}
            <div className="px-2 pb-1">
              <NoteCapture className="hidden lg:block" />
            </div>
            {notes.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                <span className="lg:hidden">还没有笔记</span>
                <span className="hidden lg:inline">还没有笔记</span>
              </p>
            ) : (
              onSelectNote && notes.map((n) => (
                <NoteRow key={n.id} note={n} selected={selectedNoteId === n.id} onSelect={onSelectNote} />
              ))
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function TaskItem({
  task,
  subtaskTotal,
  subtaskDone,
  selected,
  onSelect,
}: {
  task: Task;
  subtaskTotal: number;
  subtaskDone: number;
  selected: boolean;
  onSelect: (id: string | null) => void;
}) {
  const { data, mutateLocal, refresh } = useData();

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

  const remove = async () => {
    await api.deleteTask(task.id);
    onSelect(null);
    void refresh(true);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        'group cursor-pointer rounded-md px-2 py-0.5 transition-colors',
        selected ? 'bg-accent' : 'hover:bg-muted/60',
      )}
      onClick={() => onSelect(selected ? null : task.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(selected ? null : task.id);
        }
      }}
    >
      <div className="flex items-start gap-2 py-2">
        <div className="pt-px">
          <Checkbox checked={task.completed} onChange={toggle} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={task.completed ? 'text-sm text-muted-foreground line-through' : 'text-sm'}>
              {task.title}
            </span>

            {task.dueDate != null &&
              (() => {
                const { text, overdue } = formatDue(task.dueDate);
                return (
                  <Badge
                    variant="secondary"
                    className={
                      task.completed ? '' : overdue ? 'bg-destructive/15 text-destructive' : 'text-accent-foreground'
                    }
                  >
                    <CalendarDays className="mr-1 h-3 w-3" />
                    {text}
                  </Badge>
                );
              })()}

            {subtaskTotal > 0 && (
              <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground" title="子任务进度">
                <ListChecks className="h-3.5 w-3.5" />
                {subtaskDone}/{subtaskTotal}
              </span>
            )}
          </div>
          {(task.tags.length > 0 || task.description) && (
            <div className="mt-0.5 flex items-center gap-1.5">
              {task.tags.slice(0, 3).map((t) => (
                <TagChip key={t} name={t} />
              ))}
              {task.tags.length > 3 && (
                <span className="text-xs text-muted-foreground">+{task.tags.length - 3}</span>
              )}
              {task.description && (
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground/80" title={task.description}>
                  {task.description.split('\n')[0]}
                </span>
              )}
            </div>
          )}
        </div>

        <div
          className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            title="删除任务"
            onClick={() => void remove()}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
