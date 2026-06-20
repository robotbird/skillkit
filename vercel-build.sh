#!/usr/bin/env bash
# Vercel 函数构建脚本(由 vercel.json#buildCommand 调用)。
#
# 背景:Vercel Node.js runtime 只编译 /api 内的 TS;server/src 与 shared 在
# /api 之外,includeFiles 只原样拷贝 .ts 不会编译成 .js,运行时 import
# '../server/src/app.js' 会 ERR_MODULE_NOT_FOUND。这里在部署期先编译出 .js。
#
# 为什么用隔离 prefix 装 typescript:installCommand 用了 --omit=dev,而 npm 会把
# 显式指定、但属于 devDependencies 的包(typescript/@types/node)也剪掉。装到
# /tmp/tsc-deps 不受项目 devDep 剪枝影响,也不污染部署的 node_modules。
set -euo pipefail

TSC_DEPS=/tmp/tsc-deps

npm install --prefix "$TSC_DEPS" --no-save --ignore-scripts --no-audit --no-fund \
  typescript@5.5.4 @types/node@20.16.5

# 让项目 tsconfig 能解析 node 类型:把 @types/node 软链进 node_modules/@types。
mkdir -p node_modules/@types
rm -rf node_modules/@types/node
ln -s "$TSC_DEPS/node_modules/@types/node" node_modules/@types/node

# 原地编译 server/src + shared → .js(server/tsconfig.vercel.json, noEmit:false)。
"$TSC_DEPS/node_modules/.bin/tsc" -p server/tsconfig.vercel.json
