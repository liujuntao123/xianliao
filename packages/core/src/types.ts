/** 部署配置：由各平台适配器从自己的环境源构造。 */
export interface AppConfig {
  /** 前端访问口令；未设置时整个应用处于「未完成部署」状态。 */
  accessKey: string;
  feishuAppId: string;
  feishuAppSecret: string;
  /** 多维表格 app_token；为空时后端尝试按名称自动发现（仅限应用自建的 Base）。 */
  feishuBaseToken: string;
  /** feishu（默认）| lark */
  feishuDomain: FeishuDomain;
}

export type FeishuDomain = 'feishu' | 'lark';

export function parseFeishuDomain(v: string | undefined): FeishuDomain {
  return v?.toLowerCase() === 'lark' ? 'lark' : 'feishu';
}

/** 领域实体（API 对外形状）。时间一律为 epoch 毫秒。 */
export interface List {
  id: string;
  name: string;
}

export interface Task {
  id: string;
  listId: string;
  title: string;
  /** 补充描述（可选，多行纯文本）。 */
  description: string;
  completed: boolean;
  /** 可选截止日期（epoch 毫秒，通常为某日零点）。 */
  dueDate: number | null;
  /** 标签名数组（多维表格多选字段，写入新选项时飞书自动创建）。 */
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
  /** 标签名数组（与任务共用同一套标签命名空间）。 */
  tags: string[];
  modifiedAt: number;
}

export interface AppData {
  lists: List[];
  tasks: Task[];
  subtasks: Subtask[];
  notes: Note[];
}

/** 首启向导所需的环境变量值。 */
export interface SetupEnv {
  FEISHU_APP_ID: string;
  FEISHU_APP_SECRET: string;
  FEISHU_BASE_TOKEN: string;
  FEISHU_DOMAIN: FeishuDomain;
}

export interface FeishuErrorPayload {
  code: number;
  msg: string;
  /** 缺少 scope 时飞书会附带这些提示字段 */
  missingScopes?: string[];
  consoleUrl?: string;
  hint?: string;
}

/** 统一的应用错误，路由层负责转成 HTTP 响应。 */
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public payload?: Record<string, unknown>,
  ) {
    super(message);
  }
}
