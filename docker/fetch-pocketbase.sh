#!/bin/sh
# 预下载 PocketBase 二进制到 docker/pocketbase，供 Dockerfile 构建时直接复制。
# 用于无法直连 GitHub（代理 / 内网）的构建环境；能直连的环境无需运行此脚本。
#
# 用法：./docker/fetch-pocketbase.sh [版本] [目标架构]
#   版本默认 0.39.11（与 Dockerfile ARG PB_VERSION 保持一致）
#   架构默认按 Docker 构建目标：arm64 / amd64

set -eu

VERSION="${1:-0.39.11}"
ARCH="${2:-$(uname -m)}"
case "$ARCH" in
    arm64 | aarch64) ARCH="arm64" ;;
    x86_64 | amd64) ARCH="amd64" ;;
    *) echo "不支持的架构：$ARCH（仅支持 arm64 / amd64）" >&2; exit 1 ;;
esac

DIR="$(cd "$(dirname "$0")" && pwd)"
URL="https://github.com/pocketbase/pocketbase/releases/download/v${VERSION}/pocketbase_${VERSION}_linux_${ARCH}.zip"

echo "下载 $URL"
curl -fL --retry 3 --connect-timeout 20 -o "$DIR/pocketbase.zip" "$URL"
unzip -o "$DIR/pocketbase.zip" pocketbase -d "$DIR"
rm "$DIR/pocketbase.zip"
chmod +x "$DIR/pocketbase"
ls -la "$DIR/pocketbase"
echo "完成。现在可以重新执行 docker build / docker compose build。"
