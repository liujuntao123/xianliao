/**
 * 标签工具：任务与快捷笔记共用的标签展示与输入辅助。
 * 标签即字符串（多维表格多选字段），颜色由名称哈希本地生成，不依赖飞书选项色。
 */
import * as React from 'react';

/** 标签名 → 稳定色相（0-359）。 */
export function tagHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

/** 跟随 html.dark class 的明暗模式（主题切换实时生效）。 */
export function useIsDark(): boolean {
  const [dark, setDark] = React.useState(() => document.documentElement.classList.contains('dark'));
  React.useEffect(() => {
    const ob = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')));
    ob.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => ob.disconnect();
  }, []);
  return dark;
}

export interface TagStyle {
  color: string;
  backgroundColor: string;
}

/** 标签 Badge 的前景/背景色：亮色与暗色模式都保证可读。 */
export function tagStyle(name: string, dark: boolean): TagStyle {
  const h = tagHue(name);
  return dark
    ? { color: `hsl(${h} 70% 76%)`, backgroundColor: `hsl(${h} 45% 20% / 0.9)` }
    : { color: `hsl(${h} 55% 34%)`, backgroundColor: `hsl(${h} 75% 93% / 0.9)` };
}

/** 从任务与笔记数据收集全部已用标签（去重、按名称排序）。 */
export function collectTags(items: { tags: string[] }[]): string[] {
  const s = new Set<string>();
  for (const it of items) for (const t of it.tags) if (t.trim()) s.add(t.trim());
  return [...s].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}
