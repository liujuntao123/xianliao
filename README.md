# 闲记（XianJi）

单用户自托管的**待办清单 + 快捷笔记** Web 应用。没有数据库——所有数据都保存在**你自己的飞书多维表格（Base）**里，应用零本地持久化，重启即忘，唯一状态是环境变量。

类滴答清单的多端响应式界面：左侧清单栏、「全部」聚合视图、任务子任务一层拆解、截止日期、独立的快捷笔记速记模块。

## 功能边界（v1）

| 模块 | 支持 | 明确不做 |
|---|---|---|
| 任务 | 多清单、标题/完成/截止日期、「全部」聚合 | 优先级、标签、备注正文、日期智能清单 |
| 子任务 | 恰好一层、纯复选框、「n/m」进度提示 | 嵌套、子任务自身属性、自动完成父任务 |
| 笔记 | 快捷输入、标题+正文、修改时间倒序 | Markdown 渲染、置顶、分组、搜索 |
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
api/[[...route]].ts Vercel 适配器（catch-all 函数）
workers/xianji.ts   Cloudflare Workers 适配器（Static Assets + worker 处理 /api/*）
```

飞书侧数据模型（ADR-0002，四张中文数据表 + 双向关联）：

| 表 | 字段 |
|---|---|
| 清单 | 名称 |
| 任务 | 标题、已完成、截止日期、所属清单 → 关联清单 |
| 子任务 | 标题、已完成、所属任务 → 关联任务 |
| 笔记 | 标题、正文 |

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
