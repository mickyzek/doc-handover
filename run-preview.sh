#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-4173}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Starting preview server..."
echo "Root: ${ROOT_DIR}"
echo "URL : http://localhost:${PORT}/preview.html"
echo ""
echo "Press Ctrl+C to stop."

cd "${ROOT_DIR}"
python3 -m http.server "${PORT}"
