import { describe, expect, it } from 'vitest';
import { compareTasks, formatDue, sortSubtasks } from '../src/lib/sort';
import type { Subtask, Task } from '../src/lib/api';

const t = (over: Partial<Task>): Task => ({
  id: Math.random().toString(36).slice(2),
  listId: 'l1',
  title: '任务',
  completed: false,
  dueDate: null,
  createdAt: 1000,
  ...over,
});

describe('任务排序（CONTEXT.md：未完成 → 截止日期升序 → 创建时间）', () => {
  it('未完成排在已完成之前', () => {
    expect(compareTasks(t({ completed: true }), t({}))).toBe(1);
    expect(compareTasks(t({}), t({ completed: true }))).toBe(-1);
  });

  it('截止日期升序，无日期排最后', () => {
    expect(compareTasks(t({ dueDate: 200 }), t({ dueDate: 100 }))).toBeGreaterThan(0);
    expect(compareTasks(t({ dueDate: 100 }), t({ dueDate: 200 }))).toBeLessThan(0);
    expect(compareTasks(t({ dueDate: null }), t({ dueDate: 100 }))).toBeGreaterThan(0);
    expect(compareTasks(t({ dueDate: 100 }), t({ dueDate: null }))).toBeLessThan(0);
  });

  it('同日期按创建时间', () => {
    expect(compareTasks(t({ createdAt: 2 }), t({ createdAt: 1 }))).toBeGreaterThan(0);
  });

  it('子任务：未完成在前，其余按创建时间', () => {
    const s = (over: Partial<Subtask>): Subtask => ({
      id: Math.random().toString(36).slice(2),
      taskId: 't1',
      title: '子',
      completed: false,
      createdAt: 1,
      ...over,
    });
    const sorted = sortSubtasks([
      s({ id: 'b', createdAt: 2 }),
      s({ id: 'd', completed: true, createdAt: 1 }),
      s({ id: 'a', createdAt: 3 }),
    ]);
    expect(sorted.map((x) => x.id)).toEqual(['b', 'a', 'd']);
  });
});

describe('formatDue', () => {
  const day = 86400000;
  const startOfToday = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();

  it('今天/明天/后天与过期', () => {
    expect(formatDue(startOfToday).text).toBe('今天');
    expect(formatDue(startOfToday + day).text).toBe('明天');
    expect(formatDue(startOfToday + 2 * day).text).toBe('后天');
    const past = formatDue(startOfToday - 3 * day);
    expect(past.overdue).toBe(true);
    expect(formatDue(startOfToday + 30 * day).overdue).toBe(false);
  });
});
