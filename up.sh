#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")"

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8000}"
URL="http://${HOST}:${PORT}"

if command -v lsof >/dev/null 2>&1 && lsof -ti :"$PORT" >/dev/null 2>&1; then
  echo "Port $PORT is already in use. Try: PORT=8001 ./up.sh"
  exit 1
fi

echo "Starting Quiet Shelf at $URL"
echo "Press Ctrl+C to stop the server."

if command -v xdg-open >/dev/null 2>&1; then
  (sleep 1; xdg-open "$URL" >/dev/null 2>&1) &
elif command -v open >/dev/null 2>&1; then
  (sleep 1; open "$URL" >/dev/null 2>&1) &
fi

exec python3 -m http.server "$PORT" --bind "$HOST"
