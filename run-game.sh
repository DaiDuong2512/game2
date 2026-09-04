#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if [ ! -f dist/index.html ]; then
  npm install --no-audit --no-fund
  npm run build
fi
printf '%s\n' 'Mở http://localhost:4173 trong trình duyệt.'
node scripts/dev-server.mjs
