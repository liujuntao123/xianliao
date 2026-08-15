import * as React from 'react';
import { CheckCircle2, Lock } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Spinner } from './ui/misc';

/** 解锁页：输入 Access Key（Q7）。wrongKey=true 时提示「密钥无效」。 */
export function UnlockScreen({
  onUnlock,
  initialError,
}: {
  onUnlock: (key: string) => Promise<string | null>;
  initialError?: string | null;
}) {
  const [key, setKey] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(initialError ?? null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim() || busy) return;
    setBusy(true);
    setError(null);
    const err = await onUnlock(key.trim());
    if (err) setError(err);
    setBusy(false);
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-b from-accent/40 to-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold">闲记</h1>
            <p className="mt-1 text-sm text-muted-foreground">待办与快捷笔记，数据在你的飞书里</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="password"
              autoFocus
              className="pl-9"
              placeholder="输入 Access Key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy || !key.trim()}>
            {busy ? <Spinner className="text-primary-foreground" /> : null}
            解锁
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Access Key 是部署时设置的 ACCESS_KEY 环境变量
        </p>
      </div>
    </div>
  );
}
