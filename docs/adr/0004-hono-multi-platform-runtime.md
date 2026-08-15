# Hono + Web 标准 API，一套后端代码部署三平台

后端框架选 Hono（TypeScript）：同一套 core 路由代码通过三个薄适配入口分别跑在 Docker/Node（`@hono/node-server`）、Vercel（serverless functions）、Cloudflare Workers/Pages（Web 标准 runtime）上，前端 SPA 作为静态资产由三平台各自托管。否决 Express/Fastify：它们依赖 Node API，上 Cloudflare 需要整套重写。飞书 tenant_access_token（约 2 小时有效、无刷新机制）采用「实例内存缓存 + 冷启动现取」策略，不引入 KV——单用户请求量下冷启动多一次飞书往返（100–300ms）完全可接受，避免为 token 缓存引入有状态依赖、破坏零持久化原则。
