#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
if ! command -v ollama >/dev/null 2>&1; then echo "Cài Ollama từ ollama.com trước khi bật AI local."; exit 1; fi
if [ ! -x backend/.venv/bin/python ]; then echo "Chạy npm run setup trước."; exit 1; fi
backend/.venv/bin/python -m pip install -r backend/requirements-ai.txt
ollama pull "${LECTURE_LLM_MODEL:-qwen2.5:3b}"
ollama pull "${LECTURE_EMBEDDING_MODEL:-bge-m3}"
echo "AI local đã cài. Chạy npm run dev:ai; mô hình ASR tải ở lần nhận dạng đầu tiên."
