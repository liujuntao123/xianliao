/**
 * Base 数据建模（ADR-0002）：四张中文数据表 + 双向关联。
 *
 *  清单：名称
 *  任务：标题 / 描述 / 已完成 / 截止日期 / 标签（多选）/ 所属清单（关联→清单）
 *  子任务：标题 / 已完成 / 所属任务（关联→任务）
 *  笔记：标题 / 正文 / 标签（多选）
 *
 * 字段类型枚举：1 多行文本、4 多选、5 日期、7 复选框、21 双向关联。
 * 标签用多选字段而非独立标签表：标签即字符串，写入新选项时飞书自动创建，
 * 任务与笔记共享同一套标签命名空间（按名称相等）。
 * 初始化幂等：已存在的表/字段跳过；缺失的补建。顺手清掉新建 Base
 * 自带的空默认表，并写入默认清单「收集箱」。
 */
import { AppError } from '../types.js';
import { FeishuClient } from './client.js';

export const BASE_NAME = '闲记';
export const DEFAULT_LIST_NAME = '收集箱';

// 字段类型枚举
export const FieldType = {
  Text: 1,
  MultiSelect: 4,
  DateTime: 5,
  Checkbox: 7,
  TwoWayLink: 21,
} as const;

interface FieldDef {
  field_name: string;
  type: number;
  property?: Record<string, unknown>;
}

interface TableDef {
  name: string;
  /** 依赖的表名 → 建表时把已建表的 id 注入 link 字段 property */
  fields: (resolve: (table: string) => string | undefined) => FieldDef[];
}

export const TABLES: Record<'lists' | 'tasks' | 'subtasks' | 'notes', TableDef> = {
  lists: {
    name: '清单',
    fields: () => [{ field_name: '名称', type: FieldType.Text }],
  },
  tasks: {
    name: '任务',
    fields: (resolve) => [
      { field_name: '标题', type: FieldType.Text },
      { field_name: '描述', type: FieldType.Text },
      { field_name: '已完成', type: FieldType.Checkbox },
      { field_name: '截止日期', type: FieldType.DateTime, property: { date_formatter: 'yyyy-MM-dd' } },
      { field_name: '标签', type: FieldType.MultiSelect },
      { field_name: '所属清单', type: FieldType.TwoWayLink, property: { table_id: resolve('清单') } },
    ],
  },
  subtasks: {
    name: '子任务',
    fields: (resolve) => [
      { field_name: '标题', type: FieldType.Text },
      { field_name: '已完成', type: FieldType.Checkbox },
      { field_name: '所属任务', type: FieldType.TwoWayLink, property: { table_id: resolve('任务') } },
    ],
  },
  notes: {
    name: '笔记',
    fields: () => [
      { field_name: '标题', type: FieldType.Text },
      { field_name: '正文', type: FieldType.Text },
      { field_name: '标签', type: FieldType.MultiSelect },
    ],
  },
};

// ---- 字段名常量（代码侧映射，与上面定义一一对应） ----
export const F = {
  listName: '名称',
  taskTitle: '标题',
  description: '描述',
  completed: '已完成',
  dueDate: '截止日期',
  tags: '标签',
  taskList: '所属清单',
  subtaskTask: '所属任务',
  noteTitle: '标题',
  noteContent: '正文',
} as const;

interface TableInfo {
  tableId: string;
  name: string;
}

// 实例级 schema 缓存：冷启动后首个请求 ensureSchema 一次，之后直接命中
const schemaCache = new Map<string, SchemaTableIds>();

export function getSchema(
  client: FeishuClient,
  appId: string,
  baseToken: string,
): Promise<SchemaTableIds> {
  const key = `${appId}:${baseToken}`;
  const hit = schemaCache.get(key);
  if (hit) return Promise.resolve(hit);
  return ensureSchema(client, baseToken).then((ids) => {
    schemaCache.set(key, ids);
    return ids;
  });
}

export function forgetSchemaCache(appId?: string): void {
  if (!appId) {
    schemaCache.clear();
    return;
  }
  for (const k of schemaCache.keys()) {
    if (k.startsWith(appId + ':')) schemaCache.delete(k);
  }
}

/** 预填 schema 缓存（测试辅助：跳过真实 ensureSchema 网络调用）。 */
export function primeSchemaCache(appId: string, baseToken: string, ids: SchemaTableIds): void {
  schemaCache.set(`${appId}:${baseToken}`, ids);
}

export async function listTables(client: FeishuClient, baseToken: string): Promise<TableInfo[]> {
  const out: TableInfo[] = [];
  let pageToken: string | undefined;
  do {
    const res = await client.get<{
      data: { items?: { table_id: string; name: string }[]; page_token?: string; has_more?: boolean };
    }>(`/open-apis/bitable/v1/apps/${baseToken}/tables`, {
      page_size: 100,
      page_token: pageToken,
    });
    for (const it of res.data.items ?? []) out.push({ tableId: it.table_id, name: it.name });
    pageToken = res.data.has_more ? res.data.page_token : undefined;
  } while (pageToken);
  return out;
}

export interface SchemaTableIds {
  lists: string;
  tasks: string;
  subtasks: string;
  notes: string;
}

/** 幂等初始化：确保四张表与字段齐全，返回表 id 映射。 */
export async function ensureSchema(client: FeishuClient, baseToken: string): Promise<SchemaTableIds> {
  const order: Array<keyof typeof TABLES> = ['lists', 'tasks', 'subtasks', 'notes'];
  const ids = new Map<string, string>(); // 中文名 → table_id

  for (const key of order) {
    const def = TABLES[key];
    const existing = (await listTables(client, baseToken)).find((t) => t.name === def.name);
    if (existing) {
      ids.set(def.name, existing.tableId);
      await ensureFields(client, baseToken, existing.tableId, def, ids);
      continue;
    }
    const created = await client.post<{ data: { table_id: string } }>(
      `/open-apis/bitable/v1/apps/${baseToken}/tables`,
      {
        table: {
          name: def.name,
          fields: def.fields((name) => ids.get(name)),
        },
      },
    );
    ids.set(def.name, created.data.table_id);
    // 建表时字段是随表创建的，无需再补
  }

  // 清理：新建 Base 自带的空默认表（不属于我们的四张表且无记录）
  await dropEmptyDefaultTables(client, baseToken, new Set(ids.values()));

  const result = {
    lists: ids.get(TABLES.lists.name) ?? '',
    tasks: ids.get(TABLES.tasks.name) ?? '',
    subtasks: ids.get(TABLES.subtasks.name) ?? '',
    notes: ids.get(TABLES.notes.name) ?? '',
  };
  if (!result.lists || !result.tasks || !result.subtasks || !result.notes) {
    throw new AppError(500, 'Base 表结构初始化异常：缺少表 id');
  }

  // 默认清单「收集箱」
  await ensureDefaultList(client, baseToken, result.lists);

  return result;
}

async function ensureFields(
  client: FeishuClient,
  baseToken: string,
  tableId: string,
  def: TableDef,
  ids: Map<string, string>,
): Promise<void> {
  const res = await client.get<{
    data: { items?: { field_name: string }[]; page_token?: string; has_more?: boolean };
  }>(`/open-apis/bitable/v1/apps/${baseToken}/tables/${tableId}/fields`, {
    page_size: 100,
  });
  const present = new Set((res.data.items ?? []).map((f) => f.field_name));
  for (const field of def.fields((name) => ids.get(name))) {
    if (present.has(field.field_name)) continue;
    await client.post(
      `/open-apis/bitable/v1/apps/${baseToken}/tables/${tableId}/fields`,
      field,
    );
  }
}

async function dropEmptyDefaultTables(
  client: FeishuClient,
  baseToken: string,
  keepIds: Set<string>,
): Promise<void> {
  for (const t of await listTables(client, baseToken)) {
    if (keepIds.has(t.tableId)) continue;
    const res = await client.get<{ data: { total?: number } }>(
      `/open-apis/bitable/v1/apps/${baseToken}/tables/${t.tableId}/records`,
      { page_size: 1 },
    );
    if ((res.data.total ?? 0) === 0) {
      await client
        .delete(`/open-apis/bitable/v1/apps/${baseToken}/tables/${t.tableId}`)
        .catch(() => undefined); // 删不掉就算了，无害
    }
  }
}

async function ensureDefaultList(client: FeishuClient, baseToken: string, listsTableId: string): Promise<void> {
  const res = await client.get<{ data: { total?: number } }>(
    `/open-apis/bitable/v1/apps/${baseToken}/tables/${listsTableId}/records`,
    { page_size: 1 },
  );
  if ((res.data.total ?? 0) === 0) {
    await client.post(`/open-apis/bitable/v1/apps/${baseToken}/tables/${listsTableId}/records`, {
      fields: { [F.listName]: DEFAULT_LIST_NAME },
    });
  }
}
