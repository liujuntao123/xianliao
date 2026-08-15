import { beforeEach, describe, expect, it } from 'vitest';
import { Repo } from '../src/repo';
import { primeSchemaCache } from '../src/feishu/schema';
import type { FeishuClient } from '../src/feishu/client';

/** 飞书记录返回 → 领域实体的映射与过滤规则 */
function makeClient(pages: Record<string, unknown[]>) {
  return {
    get: async (path: string) => {
      for (const [key, items] of Object.entries(pages)) {
        if (path.includes(key)) {
          return { data: { items, total: items.length, has_more: false } };
        }
      }
      return { data: { items: [], total: 0, has_more: false } };
    },
    post: async () => ({ data: { record: { record_id: 'rec-new' } } }),
    put: async () => ({ data: {} }),
    delete: async () => ({ data: {} }),
    getTenantToken: async () => 't',
  } as unknown as FeishuClient;
}

describe('Repo.getAll 映射', () => {
  beforeEach(() => {
    primeSchemaCache('app1', 'b1', { lists: 'tblL', tasks: 'tblT', subtasks: 'tblS', notes: 'tblN' });
  });

  it('段落文本、关联数组、秒级时间戳正确映射；孤儿记录被过滤', async () => {
    const client = makeClient({
      '/tables/tblL/records': [
        { record_id: 'recL1', fields: { 名称: '工作' }, created_time: '1700000000' },
        { record_id: 'recL2', fields: { 名称: '生活' }, created_time: '1700000100' },
      ],
      '/tables/tblT/records': [
        {
          record_id: 'recT1',
          fields: {
            标题: [{ type: 'text', text: '写' }, { type: 'text', text: '周报' }],
            已完成: false,
            截止日期: 1700179200000,
            所属清单: [{ record_id: 'recL1' }],
          },
          created_time: '1700000001',
        },
        {
          record_id: 'recT2',
          fields: { 标题: '孤儿任务', 已完成: true, 所属清单: [{ record_id: 'recMissing' }] },
          created_time: '1700000002',
        },
      ],
      '/tables/tblS/records': [
        {
          record_id: 'recS1',
          fields: { 标题: '收集数据', 已完成: false, 所属任务: [{ record_id: 'recT1' }] },
          created_time: '1700000005',
        },
      ],
      '/tables/tblN/records': [
        {
          record_id: 'recN1',
          fields: { 标题: '想法', 正文: '正文内容' },
          created_time: '1700000000',
          last_modified_time: '1700000500',
        },
      ],
    });

    const repo = new Repo(client, 'app1', 'b1');
    const data = await repo.getAll();

    expect(data.lists).toEqual([
      { id: 'recL1', name: '工作' },
      { id: 'recL2', name: '生活' },
    ]);
    expect(data.tasks).toHaveLength(1);
    expect(data.tasks[0]).toMatchObject({
      id: 'recT1',
      listId: 'recL1',
      title: '写周报',
      completed: false,
      dueDate: 1700179200000,
      createdAt: 1700000001000, // 秒 → 毫秒
    });
    expect(data.subtasks).toHaveLength(1);
    expect(data.subtasks[0]?.taskId).toBe('recT1');
    expect(data.notes).toEqual([
      { id: 'recN1', title: '想法', content: '正文内容', modifiedAt: 1700000500000 },
    ]);
  });
});
