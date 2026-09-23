#!/usr/bin/env bash
# Compila el APK de OpenV en EAS (nube de Expo) y lo publica en
# https://app.viis.app/app.apk. Se ejecuta EN EL VPS (lo invoca GitHub Actions
# por SSH): el token de Expo vive solo en /root/.viis-copia-expo-token.
set -euo pipefail

BRANCH="${1:-openv-plataforma}"
WORK=/var/www/viis-copia-mobile-build
DIST=/var/www/viis-copia-dist

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" || true
export EXPO_TOKEN="$(cat /root/.viis-copia-expo-token)"
export EAS_BUILD_NO_EXPO_GO_WARNING=1

rm -rf "$WORK"
git clone -q --depth 1 -b "$BRANCH" https://github.com/proyectotureporte/viis.git "$WORK"
COMMIT=$(git -C "$WORK" rev-parse --short HEAD)
cd "$WORK/mobile"
npm ci --no-audit --no-fund --loglevel=error

echo "▶ EAS build Android (commit $COMMIT)…"
npx -y eas-cli@latest build -p android --profile production --non-interactive --wait --json --message "OpenV $COMMIT" > "$WORK/eas-build.json"
URL=$(python3 -c "import json;b=json.load(open('$WORK/eas-build.json'));b=b[0] if isinstance(b,list) else b;print(b['artifacts']['buildUrl'])")
VERSION=$(python3 -c "import json;print(json.load(open('app.json'))['expo']['version'])")

curl -fsSL "$URL" -o "$DIST/app.apk.tmp"
unzip -tq "$DIST/app.apk.tmp" >/dev/null   # un APK es un zip: se valida antes de publicar
mv "$DIST/app.apk.tmp" "$DIST/app.apk"
chmod 644 "$DIST/app.apk"

python3 - "$DIST/app-version.json" "$VERSION" "$COMMIT" "$(sha256sum "$DIST/app.apk" | cut -d' ' -f1)" "$(stat -c %s "$DIST/app.apk")" <<'PY'
import json, sys, datetime
path, version, commit, sha, size = sys.argv[1:]
try: data = json.load(open(path))
except Exception: data = {}
data['android'] = {'version': version, 'commit': commit, 'sha256': sha, 'bytes': int(size), 'url': '/app.apk', 'builtAt': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')}
json.dump(data, open(path, 'w'), indent=2)
PY
rm -rf "$WORK"
echo "✔ APK publicado: https://app.viis.app/app.apk ($VERSION · $COMMIT)"
