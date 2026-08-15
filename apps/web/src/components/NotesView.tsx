/**
 * 快捷笔记：顶部极速捕捉（首行为标题，可含多行正文），
 * 列表按修改时间倒序，点击展开编辑（CONTEXT.md）。
 */
import * as React from 'react';
import { NotebookPen, Trash2 } from 'lucide-react';
import { api, type Note } from '../lib/api';
import { useData } from '../lib/store';
import { Button } from './ui/button';
import { Textarea } from './ui/input';
import { EmptyState, Spinner } from './ui/misc';

export function NotesView() {
  const { data, refresh } = useData();
  const [draft, setDraft] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  if (!data) return null;
  const notes = [...data.notes].sort((a, b) => b.modifiedAt - a.modifiedAt);

  const capture = async () => {
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
    <div>
      <div className="border-b bg-card/80 px-4 py-3 backdrop-blur md:px-6">
        <div className="flex items-baseline justify-between">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <NotebookPen className="h-5 w-5 text-primary" />
            快捷笔记
          </h1>
          <span className="text-xs text-muted-foreground">{notes.length} 条</span>
        </div>
        <div className="mt-3">
          <Textarea
            placeholder={'记点什么…\n首行是标题，回车换行写正文，Ctrl/⌘+Enter 保存'}
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void capture();
            }}
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Ctrl/⌘ + Enter 保存</span>
            <Button size="sm" onClick={capture} disabled={busy || !draft.trim()}>
              {busy ? <Spinner className="text-primary-foreground" /> : null}
              保存
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 px-4 py-4 md:grid-cols-2 md:px-6">
        {notes.length === 0 && <EmptyState className="col-span-full">还没有笔记，随手记一条</EmptyState>}
        {notes.map((n) => (
          <NoteCard key={n.id} note={n} />
        ))}
      </div>
    </div>
  );
}

function NoteCard({ note }: { note: Note }) {
  const { refresh } = useData();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(note.title + (note.content ? '\n' + note.content : ''));
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!editing) setDraft(note.title + (note.content ? '\n' + note.content : ''));
  }, [note.title, note.content, editing]);

  const save = async () => {
    const [first, ...rest] = draft.split('\n');
    const title = (first ?? '').trim() || '无标题笔记';
    const content = rest.join('\n').trim();
    setBusy(true);
    try {
      await api.updateNote(note.id, { title, content });
      setEditing(false);
      void refresh(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow"
      onClick={() => !editing && setEditing(true)}
    >
      {editing ? (
        <div onClick={(e) => e.stopPropagation()}>
          <Textarea
            autoFocus
            rows={Math.min(Math.max(draft.split('\n').length, 3), 12)}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={busy}>
              取消
            </Button>
            <Button size="sm" onClick={save} disabled={busy}>
              {busy ? <Spinner className="text-primary-foreground" /> : null}
              保存
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-medium leading-snug">{note.title}</h3>
            <button
              className="shrink-0 text-muted-foreground hover:text-destructive"
              onClick={async (e) => {
                e.stopPropagation();
                await api.deleteNote(note.id);
                void refresh(true);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          {note.content && (
            <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
              {note.content}
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {note.modifiedAt ? new Date(note.modifiedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
          </p>
        </>
      )}
    </div>
  );
}
