#!/usr/bin/env bash
# 打包三档 apk（原生 WebView 壳）。用法：bash pack-apk.sh
# 前序：ANDROID_HOME 含 build-tools 34.0.0 + platforms;android-34；JAVA_HOME=17
set -euo pipefail

ROOT="${HICODE_SITE:-/workspace/hicodehc-site}"
OFF="$ROOT/download"
SRC="$(dirname "$(readlink -f "$0")")"
OUT_DIR="$SRC/app/build/outputs/apk/debug"
ASSETS="$SRC/app/src/main/assets"
GRADLE_USER_HOME="${GRADLE_USER_HOME:-/workspace/.gradle}"

mkdir -p "$ASSETS"
for KEY in M R X; do
  file="HiCode-v3.66${KEY}-offline.html"
  [ -f "$OFF/$file" ] || { echo "缺少 $file"; exit 1; }
  cp "$OFF/$file" "$ASSETS/index.html"
  echo "▶ 构建 $KEY apk …"
  ( cd "$SRC" && GRADLE_USER_HOME="$GRADLE_USER_HOME" \
      /root/.local/share/mise/shims/gradle assembleDebug \
      -PappId=com.hicode.android.$(echo $KEY | tr A-Z a-z) \
      -PappLabel="HiCode-v3.66${KEY}" )
  apk=$(find "$OUT_DIR" -name "app-debug.apk" | head -1)
  [ -n "$apk" ] || { echo "$KEY 打包失败：未找到 app-debug.apk"; exit 1; }
  cp "$apk" "$OFF/HiCode-v3.66${KEY}-android.apk"
  echo "✓ $KEY → HiCode-v3.66${KEY}-android.apk（$(du -m "$OFF/HiCode-v3.66${KEY}-android.apk" | cut -f1) MB）"
done
echo "全部 apk 完成：" ; ls -la "$OFF"/HiCode-v3.66?-android.apk