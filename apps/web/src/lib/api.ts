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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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
  completed: boolean;
  dueDate: number | null;
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

  createTask: (listId: string, title: string, dueDate?: number | null) =>
    request('/api/tasks', { method: 'POST', body: JSON.stringify({ listId, title, dueDate }) }),
  updateTask: (id: string, patch: { title?: string; completed?: boolean; dueDate?: number | null; listId?: string }) =>
    request('/api/tasks/' + id, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteTask: (id: string) => request('/api/tasks/' + id, { method: 'DELETE' }),

  createSubtask: (taskId: string, title: string) =>
    request('/api/subtasks', { method: 'POST', body: JSON.stringify({ taskId, title }) }),
  updateSubtask: (id: string, patch: { title?: string; completed?: boolean }) =>
    request('/api/subtasks/' + id, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteSubtask: (id: string) => request('/api/subtasks/' + id, { method: 'DELETE' }),

  createNote: (title: string, content: string) =>
    request('/api/notes', { method: 'POST', body: JSON.stringify({ title, content }) }),
  updateNote: (id: string, patch: { title?: string; content?: string }) =>
    request('/api/notes/' + id, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteNote: (id: string) => request('/api/notes/' + id, { method: 'DELETE' }),
};
