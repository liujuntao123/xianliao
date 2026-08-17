/** 后端 API 客户端。Access Key 存 localStorage，随每次请求携带。 */

const KEY_STORAGE = 'xianji.accessKey';

export function getAccessKey(): string {
  return localStorage.getItem(KEY_STORAGE) ?? '';
}

export function setAccessKey(key: string) {
  localStorage.setItem(KEY_STORAGE, key);
}

export function clearAccessKey() {
  localStorage.removeItem(KEY_STORAGE);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public payload?: Record<string, unknown>,
  ) {
    super(message);
  }
}

// ---- 在途请求计数：驱动全局 loading 过渡（顶部进度条等） ----

let pendingCount = 0;
const pendingListeners = new Set<() => void>();

export function getPendingCount(): number {
  return pendingCount;
}

/** 订阅在途请求数变化；立即回调一次，返回取消订阅函数 */
export function subscribePending(fn: () => void): () => void {
  pendingListeners.add(fn);
  fn();
  return () => {
    pendingListeners.delete(fn);
  };
}

function notifyPending() {
  for (const fn of pendingListeners) fn();
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  pendingCount++;
  notifyPending();
  try {
    const res = await fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAccessKey()}`,
        ...init?.headers,
      },
    });
    if (res.status === 204) return undefined as T;
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new ApiError(res.status, (body.error as string) ?? `请求失败（${res.status}）`, body);
    }
    return body as T;
  } finally {
    pendingCount--;
    notifyPending();
  }
}

// ---- 类型（与 packages/core/src/types.ts 对应） ----

export interface List {
  id: string;
  name: string;
}
export interface Task {
  id: string;
  listId: string;
  title: string;
  description: string;
  completed: boolean;
  dueDate: number | null;
  tags: string[];
  createdAt: number;
}
export interface Subtask {
  id: string;
  taskId: string;
  title: string;
  completed: boolean;
  createdAt: number;
}
export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  modifiedAt: number;
}
export interface AppData {
  lists: List[];
  tasks: Task[];
  subtasks: Subtask[];
  notes: Note[];
}

export interface SetupStatus {
  accessKeySet: boolean;
  feishu: { appIdSet: boolean; appSecretSet: boolean; baseTokenSet: boolean };
  domain: 'feishu' | 'lark';
  base?: { ok: boolean; token?: string; message?: string; consoleUrl?: string };
}

export interface ScanStart {
  qrUrl: string;
  handle: string;
  interval: number;
  expiresIn: number;
}

export interface ScanPoll {
  status: 'pending' | 'success' | 'error';
  handle?: string;
  domainSwitched?: 'lark';
  interval?: number;
  code?: string;
  message?: string;
  env?: { FEISHU_APP_ID: string; FEISHU_APP_SECRET: string; FEISHU_BASE_TOKEN: string; FEISHU_DOMAIN: string };
  baseName?: string;
  sharedTo?: string;
  initError?: { message: string; consoleUrl?: string };
}

export const api = {
  setupStatus: () => request<SetupStatus>('/api/setup/status'),
  scanStart: () => request<ScanStart>('/api/setup/scan/start', { method: 'POST' }),
  scanPoll: (handle: string) =>
    request<ScanPoll>('/api/setup/scan/poll', { method: 'POST', body: JSON.stringify({ handle }) }),
  setupInit: (body?: { appId?: string; appSecret?: string; openId?: string }) =>
    request<ScanPoll>('/api/setup/init', { method: 'POST', body: JSON.stringify(body ?? {}) }),

  data: () => request<AppData>('/api/data'),
  createList: (name: string) => request<List>('/api/lists', { method: 'POST', body: JSON.stringify({ name }) }),
  renameList: (id: string, name: string) =>
    request('/api/lists/' + id, { method: 'PATCH', body: JSON.stringify({ name }) }),
  deleteList: (id: string) => request('/api/lists/' + id, { method: 'DELETE' }),

  createTask: (
    listId: string,
    title: string,
    extra?: { dueDate?: number | null; description?: string; tags?: string[] },
  ) =>
    request('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ listId, title, ...extra }),
    }),
  updateTask: (
    id: string,
    patch: {
      title?: string;
      description?: string;
      completed?: boolean;
      dueDate?: number | null;
      tags?: string[];
      listId?: string;
    },
  ) => request('/api/tasks/' + id, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteTask: (id: string) => request('/api/tasks/' + id, { method: 'DELETE' }),

  createSubtask: (taskId: string, title: string) =>
    request('/api/subtasks', { method: 'POST', body: JSON.stringify({ taskId, title }) }),
  updateSubtask: (id: string, patch: { title?: string; completed?: boolean }) =>
    request('/api/subtasks/' + id, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteSubtask: (id: string) => request('/api/subtasks/' + id, { method: 'DELETE' }),

  createNote: (title: string, content: string, tags?: string[]) =>
    request('/api/notes', { method: 'POST', body: JSON.stringify({ title, content, tags }) }),
  updateNote: (id: string, patch: { title?: string; content?: string; tags?: string[] }) =>
    request('/api/notes/' + id, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteNote: (id: string) => request('/api/notes/' + id, { method: 'DELETE' }),
};
