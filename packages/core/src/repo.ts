/**
 * 仓库层：领域实体 ↔ 飞书记录的双向映射与 CRUD。
 * 读取策略：单用户数据量小，全量拉取（分页聚合）+ 内存组装。
 * 记录 meta 的 created_time / last_modified_time 单位为秒，统一转为毫秒。
 */
import { AppError, type AppData, type List, type Note, type Subtask, type Task } from './types';
import { FeishuClient } from './feishu/client';
import { F, getSchema, type SchemaTableIds } from './feishu/schema';
import { resolveBaseToken } from './feishu/base';

interface RawRecord {
  record_id: string;
  fields: Record<string, unknown>;
  created_time?: string | number;
  last_modified_time?: string | number;
}

function toMs(v: string | number | undefined): number {
  if (v === undefined) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  // 秒级时间戳（10 位）转毫秒
  return n < 1e12 ? n * 1000 : n;
}

/**
 * 解析关联字段的第一个关联记录 id。
 * 双向关联（type 21）读取形态：[{ record_ids: ['recX'], table_id, text, ... }]；
 * 单向关联（type 18）/部分接口形态：['recX'] 或 [{ record_id: 'recX' }]。
 */
function firstLink(v: unknown): string {
  if (Array.isArray(v) && v.length > 0) {
    const head = v[0]!;
    if (typeof head === 'string') return head;
    if (Array.isArray(head)) return firstLink(head);
    if (head && typeof head === 'object') {
      const o = head as { record_id?: string; id?: string; record_ids?: unknown[] };
      if (typeof o.record_ids === 'string') return o.record_ids;
      if (Array.isArray(o.record_ids) && o.record_ids.length > 0) {
        const first = o.record_ids[0];
        return typeof first === 'string' ? first : firstLink(o.record_ids);
      }
      if (typeof o.record_id === 'string') return o.record_id;
      if (typeof o.id === 'string') return o.id;
    }
  }
  return '';
}

function text(v: unknown): string {
  if (Array.isArray(v)) {
    // 多行文本读取形态可能是 [{type:'text', text:'...'}] 段落数组
    return v
      .map((seg) => {
        if (typeof seg === 'string') return seg;
        const s = seg as { text?: string };
        return s.text ?? '';
      })
      .join('');
  }
  return typeof v === 'string' ? v : '';
}

/**
 * 多选字段读取：['a','b'] 或 [{type:'text', text:'a'}, ...] → 去重后的标签名数组。
 */
function tagList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    const s = typeof item === 'string' ? item : text([item]);
    const t = s.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

export class Repo {
  private ids: SchemaTableIds | null = null;

  constructor(
    private client: FeishuClient,
    private appId: string,
    private envBaseToken: string,
  ) {}

  private async tableIds(): Promise<SchemaTableIds> {
    if (this.ids) return this.ids;
    const baseToken = await resolveBaseToken(this.client, this.appId, this.envBaseToken);
    this.ids = await getSchema(this.client, this.appId, baseToken);
    return this.ids;
  }

  private async base(): Promise<string> {
    return resolveBaseToken(this.client, this.appId, this.envBaseToken);
  }

  private async listAll(tableId: string): Promise<RawRecord[]> {
    const baseToken = await this.base();
    const out: RawRecord[] = [];
    let pageToken: string | undefined;
    do {
      const res = await this.client.get<{
        data: { items?: RawRecord[]; page_token?: string; has_more?: boolean };
      }>(`/open-apis/bitable/v1/apps/${baseToken}/tables/${tableId}/records`, {
        page_size: 500,
        page_token: pageToken,
      });
      out.push(...(res.data.items ?? []));
      pageToken = res.data.has_more ? res.data.page_token : undefined;
    } while (pageToken);
    return out;
  }

  private async createRecord(tableId: string, fields: Record<string, unknown>): Promise<string> {
    const baseToken = await this.base();
    const res = await this.client.post<{ data: { record: { record_id: string } } }>(
      `/open-apis/bitable/v1/apps/${baseToken}/tables/${tableId}/records`,
      { fields },
    );
    return res.data.record.record_id;
  }

  private async updateRecord(tableId: string, recordId: string, fields: Record<string, unknown>): Promise<void> {
    const baseToken = await this.base();
    await this.client.put(
      `/open-apis/bitable/v1/apps/${baseToken}/tables/${tableId}/records/${recordId}`,
      { fields },
    );
  }

  private async deleteRecords(tableId: string, recordIds: string[]): Promise<void> {
    const baseToken = await this.base();
    for (let i = 0; i < recordIds.length; i += 500) {
      const chunk = recordIds.slice(i, i + 500);
      await this.client.post(
        `/open-apis/bitable/v1/apps/${baseToken}/tables/${tableId}/records/batch_delete`,
        { records: chunk },
      );
    }
  }

  // ---------- 读取 ----------

  async getAll(): Promise<AppData> {
    const ids = await this.tableIds();
    const [listsRaw, tasksRaw, subtasksRaw, notesRaw] = await Promise.all([
      this.listAll(ids.lists),
      this.listAll(ids.tasks),
      this.listAll(ids.subtasks),
      this.listAll(ids.notes),
    ]);

    const lists: List[] = listsRaw.map((r) => ({ id: r.record_id, name: text(r.fields[F.listName]) }));
    const listIds = new Set(lists.map((l) => l.id));

    const tasks: Task[] = tasksRaw
      .map((r) => ({
        id: r.record_id,
        listId: firstLink(r.fields[F.taskList]),
        title: text(r.fields[F.taskTitle]),
        description: text(r.fields[F.description]),
        completed: r.fields[F.completed] === true,
        dueDate: typeof r.fields[F.dueDate] === 'number' ? (r.fields[F.dueDate] as number) : null,
        tags: tagList(r.fields[F.tags]),
        createdAt: toMs(r.created_time),
      }))
      .filter((t) => listIds.has(t.listId) && t.title !== '');

    const taskIds = new Set(tasks.map((t) => t.id));
    const subtasks: Subtask[] = subtasksRaw
      .map((r) => ({
        id: r.record_id,
        taskId: firstLink(r.fields[F.subtaskTask]),
        title: text(r.fields[F.taskTitle]),
        completed: r.fields[F.completed] === true,
        createdAt: toMs(r.created_time),
      }))
      .filter((s) => taskIds.has(s.taskId) && s.title !== '');

    const notes: Note[] = notesRaw
      .map((r) => ({
        id: r.record_id,
        title: text(r.fields[F.noteTitle]),
        content: text(r.fields[F.noteContent]),
        tags: tagList(r.fields[F.tags]),
        modifiedAt: toMs(r.last_modified_time),
      }))
      .filter((n) => n.title !== '' || n.content !== '');

    return { lists, tasks, subtasks, notes };
  }

  // ---------- 清单 ----------

  async createList(name: string): Promise<List> {
    const ids = await this.tableIds();
    const id = await this.createRecord(ids.lists, { [F.listName]: name });
    return { id, name };
  }

  async renameList(id: string, name: string): Promise<void> {
    const ids = await this.tableIds();
    await this.updateRecord(ids.lists, id, { [F.listName]: name });
  }

  /** 删除清单及其全部任务与子任务（级联）。 */
  async deleteList(id: string): Promise<void> {
    const ids = await this.tableIds();
    const all = await this.getAll();
    const taskIds = all.tasks.filter((t) => t.listId === id).map((t) => t.id);
    const subtaskIds = all.subtasks.filter((s) => taskIds.includes(s.taskId)).map((s) => s.id);
    if (subtaskIds.length > 0) await this.deleteRecords(ids.subtasks, subtaskIds);
    if (taskIds.length > 0) await this.deleteRecords(ids.tasks, taskIds);
    await this.deleteRecords(ids.lists, [id]);
  }

  // ---------- 任务 ----------

  async createTask(input: {
    listId: string;
    title: string;
    description?: string;
    dueDate?: number | null;
    tags?: string[];
  }): Promise<void> {
    const ids = await this.tableIds();
    const all = await this.getAll();
    if (!all.lists.some((l) => l.id === input.listId)) {
      throw new AppError(400, '所属清单不存在');
    }
    const fields: Record<string, unknown> = {
      [F.taskTitle]: input.title,
      [F.description]: input.description ?? '',
      [F.completed]: false,
      [F.tags]: input.tags ?? [],
      [F.taskList]: [input.listId],
    };
    if (input.dueDate != null) fields[F.dueDate] = input.dueDate;
    await this.createRecord(ids.tasks, fields);
  }

  async updateTask(
    id: string,
    patch: {
      title?: string;
      description?: string;
      completed?: boolean;
      dueDate?: number | null;
      tags?: string[];
      listId?: string;
    },
  ): Promise<void> {
    const ids = await this.tableIds();
    const fields: Record<string, unknown> = {};
    if (patch.title !== undefined) fields[F.taskTitle] = patch.title;
    if (patch.description !== undefined) fields[F.description] = patch.description;
    if (patch.completed !== undefined) fields[F.completed] = patch.completed;
    if (patch.dueDate !== undefined) fields[F.dueDate] = patch.dueDate; // null=清空
    if (patch.tags !== undefined) fields[F.tags] = patch.tags; // []=清空标签
    if (patch.listId !== undefined) {
      const all = await this.getAll();
      if (!all.lists.some((l) => l.id === patch.listId)) throw new AppError(400, '目标清单不存在');
      fields[F.taskList] = [patch.listId];
    }
    if (Object.keys(fields).length === 0) return;
    await this.updateRecord(ids.tasks, id, fields);
  }

  async deleteTask(id: string): Promise<void> {
    const ids = await this.tableIds();
    const all = await this.getAll();
    const subtaskIds = all.subtasks.filter((s) => s.taskId === id).map((s) => s.id);
    if (subtaskIds.length > 0) await this.deleteRecords(ids.subtasks, subtaskIds);
    await this.deleteRecords(ids.tasks, [id]);
  }

  // ---------- 子任务 ----------

  async createSubtask(taskId: string, title: string): Promise<void> {
    const ids = await this.tableIds();
    const all = await this.getAll();
    if (!all.tasks.some((t) => t.id === taskId)) throw new AppError(400, '所属任务不存在');
    await this.createRecord(ids.subtasks, {
      [F.taskTitle]: title,
      [F.completed]: false,
      [F.subtaskTask]: [taskId],
    });
  }

  async updateSubtask(id: string, patch: { title?: string; completed?: boolean }): Promise<void> {
    const ids = await this.tableIds();
    const fields: Record<string, unknown> = {};
    if (patch.title !== undefined) fields[F.taskTitle] = patch.title;
    if (patch.completed !== undefined) fields[F.completed] = patch.completed;
    if (Object.keys(fields).length === 0) return;
    await this.updateRecord(ids.subtasks, id, fields);
  }

  async deleteSubtask(id: string): Promise<void> {
    const ids = await this.tableIds();
    await this.deleteRecords(ids.subtasks, [id]);
  }

  // ---------- 笔记 ----------

  async createNote(title: string, content: string, tags?: string[]): Promise<void> {
    const ids = await this.tableIds();
    await this.createRecord(ids.notes, {
      [F.noteTitle]: title,
      [F.noteContent]: content,
      [F.tags]: tags ?? [],
    });
  }

  async updateNote(id: string, patch: { title?: string; content?: string; tags?: string[] }): Promise<void> {
    const ids = await this.tableIds();
    const fields: Record<string, unknown> = {};
    if (patch.title !== undefined) fields[F.noteTitle] = patch.title;
    if (patch.content !== undefined) fields[F.noteContent] = patch.content;
    if (patch.tags !== undefined) fields[F.tags] = patch.tags;
    if (Object.keys(fields).length === 0) return;
    await this.updateRecord(ids.notes, id, fields);
  }

  async deleteNote(id: string): Promise<void> {
    const ids = await this.tableIds();
    await this.deleteRecords(ids.notes, [id]);
  }
}
