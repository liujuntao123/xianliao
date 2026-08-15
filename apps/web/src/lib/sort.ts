import type { Subtask, Task } from './api';

/**
 * 任务固定排序（CONTEXT.md）：
 *   未完成在前 → 截止日期升序（无日期最后）→ 创建时间升序。
 * 「全部」视图内再按清单分组时，组内沿用同一规则，组间按清单创建序。
 */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort(compareTasks);
}

export function compareTasks(a: Task, b: Task): number {
  if (a.completed !== b.completed) return a.completed ? 1 : -1;
  if (a.dueDate !== b.dueDate) {
    if (a.dueDate == null) return 1;
    if (b.dueDate == null) return -1;
    return a.dueDate - b.dueDate;
  }
  return a.createdAt - b.createdAt;
}

export function sortSubtasks(subtasks: Subtask[]): Subtask[] {
  return [...subtasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return a.createdAt - b.createdAt;
  });
}

/** 截止日期展示：今天/明天/后天 + 日期；过期标红 */
export function formatDue(ts: number): { text: string; overdue: boolean } {
  const d = new Date(ts);
  const today = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(d) - startOfDay(today)) / 86400000);
  const md = `${d.getMonth() + 1}月${d.getDate()}日`;
  if (diffDays === 0) return { text: '今天', overdue: false };
  if (diffDays === 1) return { text: '明天', overdue: false };
  if (diffDays === 2) return { text: '后天', overdue: false };
  if (diffDays === -1) return { text: '昨天', overdue: true };
  if (diffDays < -1) return { text: md, overdue: true };
  return { text: md, overdue: false };
}
