#!/usr/bin/env bash
# Vercel Ignored Build Step:仅当 apps/server 或其依赖 packages/types 有变更时才继续部署;
# 其余变更(如 apps/desktop、docs)直接跳过本次部署。
#
# 在 Vercel 项目 Settings → Git → Ignored Build Step 填:
#   bash apps/server/vercel-ignored-build-step.sh
#
# 退出码语义(反直觉):exit 0 → 跳过本次部署;非 0 → 继续部署。
set -eo pipefail

# 非 Vercel 环境(本地手跑)直接放行
[ -n "$VERCEL" ] || { echo "not vercel → proceed"; exit 1; }

# 没有父提交(首次部署 / 强制推送)→ 保守部署
git rev-parse --verify HEAD^ >/dev/null 2>&1 || { echo "no HEAD^ → proceed"; exit 1; }

# 列出本次提交变更的文件;命中 apps/server 或 packages/types 才部署
if git diff HEAD^ HEAD --name-only | grep -qE '^(apps/server|packages/types)/'; then
  echo "▶ changes under apps/server or packages/types — proceed"
  exit 1
else
  echo "↩ no relevant changes — skip deploy"
  exit 0
fi
