#!/usr/bin/env bash
set -euo pipefail

# Despliegue de la plataforma OpenV (rama openv-plataforma) → https://app.viis.app
APP="viis-copia"
PORT="4012"
BRANCH="openv-plataforma"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" || true

cd "/var/www/${APP}"
git fetch origin "${BRANCH}"
git reset --hard "origin/${BRANCH}"

corepack enable >/dev/null 2>&1 || true
pnpm install --frozen-lockfile
pnpm db:migrate:deploy
pnpm db:seed
pnpm build

pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

for i in $(seq 1 15); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null; then
    echo "Deploy OK -> https://app.viis.app"
    exit 0
  fi
  sleep 2
done
echo "Healthcheck FALLÓ tras el deploy"
pm2 logs "${APP}" --lines 60 --nostream || true
exit 1
