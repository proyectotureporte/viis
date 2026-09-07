#!/usr/bin/env bash
set -euo pipefail

APP="viis"
PORT="4005"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" || true

cd "/var/www/${APP}"
git fetch origin main
git reset --hard origin/main

corepack enable >/dev/null 2>&1 || true
pnpm install --frozen-lockfile
pnpm db:migrate:deploy
pnpm build

pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

sleep 2
if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null; then
  echo "Deploy OK -> https://viis.app"
else
  echo "Healthcheck FALLÓ tras el deploy"
  pm2 logs "${APP}" --lines 40 --nostream || true
  exit 1
fi
