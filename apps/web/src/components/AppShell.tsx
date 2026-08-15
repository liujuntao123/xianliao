/**
 * 主界面骨架：左侧清单栏 + 右侧内容区；移动端为抽屉侧栏。
 * 视图：'all' | { list: id } | 'notes'
 */
import * as React from 'react';
import {
  CheckCircle2,
  Inbox,
  Layers,
  Menu,
  Moon,
  NotebookPen,
  Plus,
  RefreshCw,
  Sun,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { useData } from '../lib/store';
import { cn } from '../lib/cn';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Spinner } from './ui/misc';
import { TaskListView } from './TaskListView';
import { NotesView } from './NotesView';
import { ConfirmDialog } from './ui/misc';

export type View = { kind: 'all' } | { kind: 'list'; listId: string } | { kind: 'notes' };

export function AppShell({ onLogout }: { onLogout: () => void }) {
  const { data, loading, error, lastUpdated, refresh, mutateLocal } = useData();
  const [view, setView] = React.useState<View>({ kind: 'all' });
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [dark, setDark] = React.useState(() => localStorage.getItem('xianji.theme') === 'dark');
  const [addingList, setAddingList] = React.useState(false);
  const [newListName, setNewListName] = React.useState('');
  const [deletingList, setDeletingList] = React.useState<string | null>(null);
  const [busyList, setBusyList] = React.useState(false);

  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('xianji.theme', dark ? 'dark' : 'light');
  }, [dark]);

  // 首个清单作为默认视图
  React.useEffect(() => {
    if (data && view.kind === 'all' && localStorage.getItem('xianji.view') === null && data.lists.length > 0) {
      // 保持「全部」为默认，不强制跳转
    }
  }, [data, view.kind]);

  const lists = data?.lists ?? [];
  const counts = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const t of data?.tasks ?? []) {
      if (!t.completed) m.set(t.listId, (m.get(t.listId) ?? 0) + 1);
    }
    return m;
  }, [data]);

  const addList = async () => {
    const name = newListName.trim();
    if (!name) return;
    setBusyList(true);
    try {
      const created = await api.createList(name);
      if (data) mutateLocal({ ...data, lists: [...data.lists, created] });
      setNewListName('');
      setAddingList(false);
    } finally {
      setBusyList(false);
    }
  };

  const confirmDeleteList = async () => {
    if (!deletingList) return;
    setBusyList(true);
    try {
      await api.deleteList(deletingList);
      if (view.kind === 'list' && view.listId === deletingList) setView({ kind: 'all' });
      setDeletingList(null);
      await refresh(true);
    } finally {
      setBusyList(false);
    }
  };

  const selectView = (v: View) => {
    setView(v);
    setDrawerOpen(false);
  };

  const sidebar = (
    <aside className="flex h-full w-60 flex-col border-r bg-card">
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <span className="text-lg font-bold">闲记</span>
        <div className="ml-auto flex">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDark(!dark)} title="切换主题">
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden" onClick={() => setDrawerOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
        <SideItem
          icon={<Layers className="h-4 w-4" />}
          label="全部"
          badge={data ? data.tasks.filter((t) => !t.completed).length : undefined}
          active={view.kind === 'all'}
          onClick={() => selectView({ kind: 'all' })}
        />
        <div className="px-3 pb-1 pt-4 text-xs font-medium text-muted-foreground">清单</div>
        {lists.map((l) => (
          <SideItem
            key={l.id}
            icon={<Inbox className="h-4 w-4" />}
            label={l.name}
            badge={counts.get(l.id)}
            active={view.kind === 'list' && view.listId === l.id}
            onClick={() => selectView({ kind: 'list', listId: l.id })}
            onRename={async (name) => {
              await api.renameList(l.id, name);
              await refresh(true);
            }}
            onDelete={() => setDeletingList(l.id)}
          />
        ))}
        {addingList ? (
          <div className="px-2 py-1">
            <Input
              autoFocus
              placeholder="清单名称，回车保存"
              value={newListName}
              disabled={busyList}
              onChange={(e) => setNewListName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addList();
                if (e.key === 'Escape') setAddingList(false);
              }}
              onBlur={() => !newListName && setAddingList(false)}
            />
          </div>
        ) : (
          <button
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={() => setAddingList(true)}
          >
            <Plus className="h-4 w-4" />
            添加清单
          </button>
        )}

        <div className="px-3 pb-1 pt-4 text-xs font-medium text-muted-foreground">速记</div>
        <SideItem
          icon={<NotebookPen className="h-4 w-4" />}
          label="快捷笔记"
          badge={data?.notes.length}
          active={view.kind === 'notes'}
          onClick={() => selectView({ kind: 'notes' })}
        />
      </nav>

      <div className="border-t p-3 text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>{lastUpdated ? `更新于 ${new Date(lastUpdated).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : '—'}</span>
          <button className="hover:text-foreground" onClick={() => void refresh(true)} title="立即刷新">
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </button>
        </div>
        <button className="mt-2 hover:text-foreground" onClick={onLogout}>
          退出（清除本机密钥）
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-full">
      {/* 桌面侧栏 */}
      <div className="hidden md:flex">{sidebar}</div>
      {/* 移动抽屉 */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 shadow-xl">{sidebar}</div>
        </div>
      )}

      <main className="relative flex min-w-0 flex-1 flex-col">
        {/* 移动顶栏 */}
        <div className="flex items-center gap-2 border-b px-3 py-2 md:hidden">
          <Button variant="ghost" size="icon" onClick={() => setDrawerOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <span className="font-semibold">
            {view.kind === 'all' ? '全部' : view.kind === 'notes' ? '快捷笔记' : lists.find((l) => l.id === view.listId)?.name ?? '…'}
          </span>
        </div>

        {error && (
          <div className="border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}{' '}
            <button className="underline" onClick={() => void refresh()}>
              重试
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && !data ? (
            <div className="flex h-full items-center justify-center">
              <Spinner className="h-6 w-6" />
            </div>
          ) : view.kind === 'notes' ? (
            <NotesView />
          ) : (
            <TaskListView view={view} />
          )}
        </div>
      </main>

      <ConfirmDialog
        open={deletingList !== null}
        onClose={() => setDeletingList(null)}
        onConfirm={confirmDeleteList}
        title="删除清单"
        description="将同时删除该清单下的全部任务与子任务，且不可恢复。"
        confirmText="删除"
        busy={busyList}
      />
    </div>
  );
}

function SideItem({
  icon,
  label,
  badge,
  active,
  onClick,
  onRename,
  onDelete,
}: {
  icon: React.ReactNode;
  label: string;
  badge?: number;
  active: boolean;
  onClick: () => void;
  onRename?: (name: string) => Promise<void>;
  onDelete?: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(label);

  React.useEffect(() => setName(label), [label]);

  return (
    <div
      className={cn(
        'group flex items-center gap-2 rounded-md px-3 py-2 text-sm',
        active ? 'bg-accent font-medium text-accent-foreground' : 'hover:bg-muted',
      )}
    >
      {editing ? (
        <input
          autoFocus
          className="w-full bg-transparent text-sm outline-none"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) {
              void onRename?.(name.trim());
              setEditing(false);
            }
            if (e.key === 'Escape') {
              setName(label);
              setEditing(false);
            }
          }}
          onBlur={() => {
            if (name.trim() && name.trim() !== label) void onRename?.(name.trim());
            setEditing(false);
          }}
        />
      ) : (
        <>
          <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={onClick}>
            <span className="text-muted-foreground">{icon}</span>
            <span className="truncate">{label}</span>
          </button>
          {badge ? (
            <span className="text-xs text-muted-foreground group-hover:hidden">{badge}</span>
          ) : null}
          {onRename && (
            <button
              className="hidden shrink-0 text-muted-foreground hover:text-foreground group-hover:block"
              title="重命名"
              onClick={() => setEditing(true)}
            >
              ✎
            </button>
          )}
          {onDelete && (
            <button
              className="hidden shrink-0 text-muted-foreground hover:text-destructive group-hover:block"
              title="删除清单"
              onClick={onDelete}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </>
      )}
    </div>
  );
}
