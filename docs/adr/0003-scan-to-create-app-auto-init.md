# 扫码一键创建飞书应用并全自动初始化

首启向导采用飞书官方「一键创建智能体应用」能力（`@larksuiteoapi/node-sdk` 的 `registerApp`，OAuth 2.0 Device Flow / RFC 8628）：后端生成二维码 → 用户飞书扫码确认 → 自动创建**最小权限**智能体应用（`addons: { preset: false, scopes: { tenant: ['bitable:app', 'drive:drive.metadata:readonly'] } }`，`createOnly: true`）→ 同一流程内用返回的凭证与 `user_info.open_id` 一口气创建 Base、建四张表、把 Base 以 full_access 共享给扫码用户 → 前端展示 FEISHU_APP_ID / FEISHU_APP_SECRET / FEISHU_BASE_TOKEN 三个环境变量值及各部署平台的设置指引。不采用「凭证存 localStorage 免重部署」捷径（安全差）；保留手动在开发者后台建应用作为高级备选路径。Device Flow 是前端轮询模型，无需公网回调，Docker / Vercel / Cloudflare 三种部署形态都成立。

## Considered Options

- 懒建（首次真实请求时再建 Base）：被否决——彼时无 open_id，无法共享给用户，用户在飞书里看不到自己的数据。
- Base 归属用户、应用为协作者（半自动）：被否决——用户明确选择全自动；归属问题通过 full_access 共享解决。

## Consequences

- 应用云文档归应用所有、用户为 full_access 协作者；用户如需彻底迁移可走飞书所有权转移。
- 后续环境变量缺失 FEISHU_BASE_TOKEN 时，后端按 Base 名称自动发现（scope `drive:drive.metadata:readonly`）或引导重建。
