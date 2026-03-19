#!/usr/bin/env bash
# Admin専用カスタム版 OpenClaw 起動スクリプト (Issue #15)
#
# RTX 3050 8GB VRAM向け最適化設定で起動する。
# - Ollama + 自前APIキーのみ（共有キー系プロバイダ無効化）
# - トレーディングBot暴走防止セーフティ有効
#
# 使い方:
#   ./scripts/start-custom.sh          # 通常起動
#   ./scripts/start-custom.sh --port 18789  # ポート指定

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# カスタム設定ファイルを使用
export OPENCLAW_CONFIG_PATH="${PROJECT_DIR}/openclaw.custom.json"

# Ollama接続確認
echo "[custom] Checking Ollama availability..."
if curl -sf http://localhost:11434/api/tags >/dev/null 2>&1; then
  OLLAMA_MODELS=$(curl -sf http://localhost:11434/api/tags | grep -o '"name":"[^"]*"' | wc -l)
  echo "[custom] Ollama is running with ${OLLAMA_MODELS} model(s)"
else
  echo "[custom] WARNING: Ollama is not running at http://localhost:11434"
  echo "[custom] Start Ollama first: ollama serve"
  echo "[custom] Then pull a model: ollama pull llama3.1:8b"
fi

# セーフティモジュール有効化フラグ
export OPENCLAW_SAFETY_TRADING_FILTER=1
export OPENCLAW_SAFETY_KILL_SWITCH=1
export OPENCLAW_SAFETY_RATE_LIMIT=1
export OPENCLAW_SAFETY_CONTEXT_ISOLATION=strict

echo "[custom] Starting OpenClaw with custom config..."
echo "[custom] Config: ${OPENCLAW_CONFIG_PATH}"
echo "[custom] Safety: trading-filter=ON, kill-switch=ON, rate-limit=ON, isolation=strict"
echo ""

# 1Password統合（利用可能な場合）
if command -v op &>/dev/null && [ -f "${PROJECT_DIR}/.env.1password" ]; then
  echo "[custom] Using 1Password for secrets..."
  exec op run --env-file="${PROJECT_DIR}/.env.1password" -- \
    node "${PROJECT_DIR}/openclaw.mjs" "$@"
else
  exec node "${PROJECT_DIR}/openclaw.mjs" "$@"
fi
