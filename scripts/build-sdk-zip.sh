#!/bin/bash
# Generates dashboard/public/authward-sdk-v1_beta.zip (TypeScript sources + README + example).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_ZIP_NAME="authward-sdk-v1_beta.zip"
STAGING="/tmp/authward-sdk-zip-staging"
PKG_DIR="$STAGING/authward-sdk"

rm -f "$ROOT/dashboard/public/$OUT_ZIP_NAME"

rm -rf "$STAGING"
mkdir -p "$PKG_DIR"

# Preserve src/ so index.ts imports (./src/...) resolve inside the archive.
cp -r "$ROOT/sdk/src" "$PKG_DIR/src"
cp "$ROOT/sdk/index.ts" "$PKG_DIR/"
cp "$ROOT/sdk/package.json" "$PKG_DIR/"
cp "$ROOT/sdk/SDK_README.md" "$PKG_DIR/README.md"
cp "$ROOT/sdk/example.tsx" "$PKG_DIR/"

mkdir -p "$ROOT/dashboard/public"
(
  cd "$STAGING"
  zip -r -q "$OUT_ZIP_NAME" authward-sdk/
)
mv "$STAGING/$OUT_ZIP_NAME" "$ROOT/dashboard/public/"

rm -rf "$STAGING"

echo "✅ $OUT_ZIP_NAME created in dashboard/public/"
