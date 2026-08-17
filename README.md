# 闲记（XianJi）

> 在线部署（Cloudflare Pages）：https://xianliao-cjd.pages.dev

单用户自托管的**待办清单 + 快捷笔记** Web 应用。没有数据库——所有数据都保存在**你自己的飞书多维表格（Base）**里，应用零本地持久化，重启即忘，唯一状态是环境变量。

三栏式多端响应式界面：左栏清单导航、中栏任务/笔记列表（「全部」聚合视图尾部附速记区，桌面端任务 / 笔记各有一个就地新建入口）、右栏详情面板（任务详情或笔记详情）；任务属性（标题/描述/清单/截止/标签/完成）与笔记（标题/正文/标签）随时编辑并防抖自动保存，截止日期经日历弹窗点选。移动端详情以从下往上的底部抽屉呈现（内部可滚动），删除入口收在抽屉 Header 右上角菜单；移动端右下角有悬浮「新建」按钮，可快速新建任务或笔记。

## 功能边界（v1）

| 模块 | 支持 | 明确不做 |
|---|---|---|
| 任务 | 多清单、标题/描述/完成/截止日期/标签/所属清单随时编辑（自动保存）、子任务进度条、「全部」聚合 | 优先级、日期智能清单 |
| 子任务 | 恰好一层、右栏统一管理（勾选/改名自动保存）、「n/m」进度提示 | 嵌套、子任务自身属性、自动完成父任务 |
| 笔记 | 快捷输入、三栏式（列表→详情）、标题+正文+标签随时编辑（自动保存）、修改时间倒序 | Markdown 渲染、置顶、分组、搜索 |
| 标签 | 任务与笔记共用一套标签命名空间，输入即建、按名去重 | 标签层级、标签颜色自定义（本地按名生成稳定色） |
| 排序 | 未完成 → 截止日期 → 创建时间 | 拖拽手动排序 |
| 同步 | 进页拉取 + 手动刷新 + 60s 轮询 | 实时推送 |

## 架构

```
apps/web            前端 SPA：Vite + React + TS + Tailwind + shadcn 风格组件
packages/core       后端核心：Hono（Web 标准 API，平台无关）
  ├─ 飞书 OpenAPI 客户端（tenant_access_token 内存缓存 + 冷启动现取）
  ├─ 首启向导（Device Flow 扫码一键建应用，AES-GCM 密封句柄轮询，无服务端会话）
  ├─ Base 生命周期（创建 / 按名发现 / full_access 共享 / 四表幂等初始化）
  └─ 仓库层（领域实体 ↔ 多维表格记录映射）
apps/server-node    Docker/自托管适配器（@hono/node-server，静态托管 SPA）
api/[...route].ts   Vercel 适配器（catch-all 函数）
functions/api/[[route]].ts Cloudflare Pages 适配器（Pages Functions）
workers/xianji.ts   Cloudflare Workers 适配器（Static Assets + worker 处理 /api/*）
```

飞书侧数据模型（ADR-0002，四张中文数据表 + 双向关联）：

| 表 | 字段 |
|---|---|
| 清单 | 名称 |
| 任务 | 标题、描述、已完成、截止日期、标签（多选）、所属清单 → 关联清单 |
| 子任务 | 标题、已完成、所属任务 → 关联任务 |
| 笔记 | 标题、正文、标签（多选） |

任务与笔记的标签均为多维表格多选字段：写入新选项时飞书自动创建，两侧按名称共享同一套标签命名空间；字段缺失时（老部署升级）初始化流程会幂等补建。

## 快速开始（Docker）

```bash
docker build -t xianji .

# 最小启动（只设访问口令，进页面后扫码完成飞书接入）
docker run -d -p 3000:3000 \
  -e ACCESS_KEY=$(openssl rand -hex 32) \
  --name xianji xianji

# 或一次性把飞书凭证也配好
docker run -d -p 3000:3000 \
  -e ACCESS_KEY=<你的访问口令> \
  -e FEISHU_APP_ID=<向导生成的值> \
  -e FEISHU_APP_SECRET=<向导生成的值> \
  -e FEISHU_BASE_TOKEN=<向导生成的值> \
  --name xianji xianji
```

打开 `http://localhost:3000`，输入 ACCESS_KEY 解锁，按首启向导完成配置。

## 部署到 Vercel / Cloudflare

- **Vercel**：导入仓库直接部署（`vercel.json` 已配置构建与 SPA 回退），在项目环境变量中设置 `ACCESS_KEY` 等变量后 Redeploy。
- **Cloudflare Pages**：在 Dashboard 连接 GitHub 仓库创建 Pages 项目，构建配置如下——Build command `pnpm build`、Build output directory `apps/web/dist`、production branch `master`；`functions/api/[[route]].ts` 自动承载 `/api/*`，SPA 回退由 `apps/web/public/_redirects` 提供。变量在 Settings → Environment variables 设置（建议仅设 Production，公开仓库的 PR 预览环境勿放凭证）。
- **Cloudflare Workers**：`pnpm build` 后 `npx wrangler deploy`（`wrangler.jsonc` 已配置 Static Assets 与 `/api/*` worker 优先）。变量用 `wrangler secret put` 或控制台设置。

## 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `ACCESS_KEY` | ✅ | 访问口令。前端输入后随每次请求携带，后端常量时间比较 |
| `FEISHU_APP_ID` / `FEISHU_APP_SECRET` | ✅* | 飞书自建应用凭证，由首启向导扫码自动生成 |
| `FEISHU_BASE_TOKEN` | 可空 | 多维表格 app_token；留空时后端按名称「闲记」自动发现（限应用自建的 Base） |
| `FEISHU_DOMAIN` | 可空 | `feishu`（默认）/ `lark`（国际版） |
| `PORT` | 可空 | Node 适配器监听端口，默认 3000 |

\* 也可走「手动路径」：在[飞书开发者后台](https://open.feishu.cn/app)自建应用并开通 `bitable:app`（及可选 `drive:drive.metadata:readonly`），手动新建空 Base 并把应用添加为文档应用协作者，再提取 app_token——向导里有分步指引。

## 首启向导

首次进入且缺少飞书配置时自动出现：

1. **扫码**——基于飞书官方「一键创建智能体应用」能力（OAuth 2.0 Device Flow），扫码确认后自动创建**最小权限**应用（仅 `bitable:app` + `drive:drive.metadata:readonly`）；
2. **自动初始化**——同一流程内自动创建 Base、四张数据表，并把 Base 以**可管理（full_access）**权限共享给扫码者——数据主权在你手里，随时可在飞书里直接打开、导出、自动化；
3. **配置环境变量**——页面展示 `FEISHU_APP_ID / FEISHU_APP_SECRET / FEISHU_BASE_TOKEN` 三个值与各部署平台的设置指引，配置完成重部署后自动进入应用。

> 兼容性说明：扫码流程由前端驱动轮询 + 服务端密封句柄（密钥由 ACCESS_KEY 派生），无服务端会话状态，Serverless 平台（Vercel/Workers）与 Docker 完全一致可用。

> 手动路径补充：若已自行配置 `FEISHU_APP_ID/APP_SECRET`，向导会提供「用已配置的应用自动创建数据表」一键补齐 Base，并在页面展示全部环境变量值供复制。注意：该表格由应用账号持有，不会出现在个人云空间（数据读写不受影响）；如需在飞书中直接查看，请使用扫码方式（自动以可管理权限共享给你）或手动在自己空间建表。

## 本地开发

```bash
pnpm install
pnpm build          # core + web 构建
pnpm test           # 单元测试（鉴权/加密/设备流/仓库映射/排序）
pnpm dev            # Node 后端（:3000，读 .env）
pnpm dev:web        # Vite 前端（:5173，代理 /api → :3000）
```

`.env` 参考 `.env.example`。

## 设计决策

见 [CONTEXT.md](./CONTEXT.md)（领域词汇表）与 [docs/adr/](./docs/adr/)：

- [ADR-0001](./docs/adr/0001-bitable-as-sole-persistence.md) 飞书多维表格作为唯一持久化存储
- [ADR-0002](./docs/adr/0002-base-data-model.md) 四张数据表 + 双向关联 + 中文表名字段名
- [ADR-0003](./docs/adr/0003-scan-to-create-app-auto-init.md) 扫码一键建应用并全自动初始化
- [ADR-0004](./docs/adr/0004-hono-multi-platform-runtime.md) Hono + Web 标准 API 一套代码三平台部署

## 安全提示

- Access Key 以 Bearer 明文传输，请确保部署在 HTTPS 或可信内网环境。
- 扫码创建的飞书应用权限极小（仅多维表格读写），凭证只应放在部署平台的环境变量中。
