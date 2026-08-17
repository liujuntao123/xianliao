#!/usr/bin/env bash
# 一键拉起闲记前后端 dev 服务：
#   后端  → http://localhost:3000（tsx watch 热重载，读根目录 .env）
#   前端  → http://localhost:5173（Vite HMR，/api 代理到 :3000，开发访问这个）
# Ctrl+C 或任一服务退出时，全部一起停止。
set -euo pipefail
cd "$(dirname "$0")/.."

BACKEND_PORT="${PORT:-3000}"
FRONTEND_PORT=5173

# 端口占用预检，避免与服务残留在后台时重复启动
for port in "$BACKEND_PORT" "$FRONTEND_PORT"; do
  if ss -tln 2>/dev/null | grep -qE ":${port}\b"; then
    echo "[dev] 错误：端口 ${port} 已被占用，请先停掉占用它的进程（ss -tlnp | grep ${port}）" >&2
    exit 1
  fi
done

PIDS=()

CLEANED=0

cleanup() {
  [ "$CLEANED" -eq 1 ] && return
  CLEANED=1
  echo ""
  echo "[dev] 正在停止所有服务..."
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  echo "[dev] 已全部退出，端口已释放"
}
trap cleanup EXIT INT TERM

echo "[dev] 后端  → http://localhost:${BACKEND_PORT}"
pnpm --filter @xianji/server-node dev &
PIDS+=($!)

echo "[dev] 前端  → http://localhost:${FRONTEND_PORT}（开发请访问这个）"
pnpm --filter @xianji/web dev &
PIDS+=($!)

# 阻塞等待；任一服务退出（或 Ctrl+C）即触发 cleanup 整体退出
wait -n
echo "[dev] 有服务提前退出，正在关闭其余服务..." >&2
