# ---- 构建阶段 ----
FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable

# 先装依赖（利用层缓存）
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/web/package.json apps/web/
COPY apps/server-node/package.json apps/server-node/
RUN pnpm install --frozen-lockfile

# 再拷源码并构建
COPY . .
RUN pnpm --filter @xianji/core build && pnpm --filter @xianji/web build

# ---- 运行阶段：单镜像自包含（tsx 随依赖安装） ----
FROM node:20-alpine
WORKDIR /app
RUN corepack enable
COPY --from=build /app /app
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["pnpm", "--filter", "@xianji/server-node", "start"]
