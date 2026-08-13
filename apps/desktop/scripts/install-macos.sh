#!/usr/bin/env bash
#
# Skillkit macOS 一键安装脚本（针对未签名 app）
# 用法:
#   curl -fsSL https://raw.githubusercontent.com/robotbird/skillkit/main/apps/desktop/scripts/install-macos.sh | bash
#
# 自动:查最新 release → 按架构下载 dmg → 挂载 → 拷到 /Applications →
# 清除 com.apple.quarantine(未签名 app 必需)→ 卸载 → 启动。
# 省去手动右键「打开」/敲 xattr 的步骤。

set -euo pipefail

OWNER="robotbird"
REPO="skillkit"
APP_NAME="Skillkit.app"
INSTALL_DIR="/Applications"

# ---- 选架构对应的 dmg 后缀 ----
ARCH=$(uname -m)
case "$ARCH" in
  arm64 | aarch64) SUFFIX="-arm64.dmg" ;;
  x86_64) SUFFIX="-x64.dmg" ;;
  *)
    echo "✗ 不支持的架构: ${ARCH}"
    exit 1
    ;;
esac

echo "→ 查询 ${OWNER}/${REPO} 最新版本..."
API="https://api.github.com/repos/${OWNER}/${REPO}/releases/latest"
# 从 release assets 里挑匹配当前架构的 dmg 直链
DMG_URL=$(curl -fsSL -H "Accept: application/vnd.github+json" "$API" \
  | grep -oE "https://[^\"]+${SUFFIX}" | head -n 1 || true)

if [ -z "${DMG_URL}" ]; then
  echo "✗ 未找到匹配架构(${ARCH})的 dmg。请到 https://github.com/${OWNER}/${REPO}/releases 手动下载。"
  exit 1
fi

DMG_FILE=$(basename "${DMG_URL}")
TMP_DMG="$(mktemp -t skillkit).dmg"
MOUNT_POINT=""

cleanup() {
  if [ -n "${MOUNT_POINT}" ]; then
    hdiutil detach "${MOUNT_POINT}" -force -quiet 2>/dev/null || true
  fi
  rm -f "${TMP_DMG}"
}
trap cleanup EXIT

echo "→ 下载 ${DMG_FILE} ..."
curl -fSL --retry 3 -o "${TMP_DMG}" "${DMG_URL}"

echo "→ 挂载 dmg ..."
# hdiutil 挂载行形如: /dev/diskNsI<TAB>GUID<TAB>/Volumes/Skillkit
MOUNT_POINT=$(hdiutil attach "${TMP_DMG}" -nobrowse | grep -o '/Volumes/.*' | head -n 1)
if [ -z "${MOUNT_POINT}" ]; then
  echo "✗ dmg 挂载失败"
  exit 1
fi

APP_SRC=$(find "${MOUNT_POINT}" -maxdepth 2 -name "${APP_NAME}" -print -quit 2>/dev/null || true)
if [ -z "${APP_SRC}" ]; then
  echo "✗ dmg 内未找到 ${APP_NAME}"
  exit 1
fi

echo "→ 安装到 ${INSTALL_DIR} ..."
# 旧版本可能正在运行,先退出再覆盖
if [ -d "${INSTALL_DIR}/${APP_NAME}" ]; then
  osascript -e 'quit app "Skillkit"' 2>/dev/null || true
  rm -rf "${INSTALL_DIR}/${APP_NAME}"
fi
cp -R "${APP_SRC}" "${INSTALL_DIR}/"

echo "→ 清除 quarantine 标记(未签名 app 必需,这一步让你免右键打开)..."
xattr -dr com.apple.quarantine "${INSTALL_DIR}/${APP_NAME}" 2>/dev/null || true

echo "✓ 安装完成,正在打开 Skillkit ..."
open -a "${INSTALL_DIR}/${APP_NAME}"
