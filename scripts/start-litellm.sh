#!/usr/bin/env bash
# Start LiteLLM proxy with local MLX upstream (see litellm_config.yaml)
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v litellm >/dev/null 2>&1; then
  echo "Installing litellm CLI (pip)…"
  pip install 'litellm[proxy]' -q
fi

echo "LiteLLM → http://127.0.0.1:4000  (upstream MLX http://127.0.0.1:52415)"
echo "Models: qwen3.6-35b-a3b | mlx-community/Qwen3.6-35B-A3B-4bit"
exec litellm --config litellm_config.yaml --host 127.0.0.1 --port 4000
