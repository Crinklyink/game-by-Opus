#!/usr/bin/env sh
cd "$(dirname "$0")"
if command -v node >/dev/null 2>&1; then
  (sleep 1; (xdg-open http://localhost:8080 || open http://localhost:8080) >/dev/null 2>&1) &
  node serve.mjs 8080
else
  echo "Node.js not found - open dist/larper48.html in your browser instead."
fi
