#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
if [ ! -x backend/.venv/bin/python ] || [ ! -d frontend/node_modules ]; then echo "Chạy npm run setup trước."; exit 1; fi
BACKEND_PID=""
cleanup() { if [ -n "$BACKEND_PID" ]; then kill "$BACKEND_PID" 2>/dev/null || true; fi; }
trap cleanup EXIT INT TERM
if curl -fsS http://127.0.0.1:8001/api/health 2>/dev/null | backend/.venv/bin/python -c 'import sys,json; sys.exit(0 if json.load(sys.stdin).get("service")=="LectureTwin-AI" else 1)' >/dev/null 2>&1; then
    echo "Dùng lại backend LectureTwin-AI trên cổng8001."
else
    (cd backend && exec .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8001) &
    BACKEND_PID=$!
fi
echo "LectureTwin-AI: http://127.0.0.1:5175 — ba vai trò demo, không cần API key."
npm --prefix frontend run dev
