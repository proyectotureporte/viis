# OpenV — app nativa (Expo)

App nativa para iOS y Android con los tres portales de OpenV: **cliente**, **aliado** y **consola de empresa**, según el rol de quien ingresa. Consume la API `/api/movil/v1` de `https://app.viis.app` y calcula las simulaciones en el teléfono con el mismo motor financiero de la web (`../lib/finance`).

- Convenciones y arquitectura: `AGENTS.md` (sección OpenV).
- API: `../docs/API-MOVIL.md` y `../docs/API-MOVIL-EMPRESA.md`.
- Seguridad: ingreso con contraseña + TOTP; "recordar este teléfono" guarda un token de dispositivo en el llavero protegido por Face ID / huella; bloqueo tras 5 min en segundo plano; revocable desde Mi cuenta.

## Compilación y publicación

Cada push a `openv-plataforma` que toque `mobile/` o el motor compartido ejecuta `.github/workflows/mobile.yml`:
1. **verify**: tipos, lint y exportación del bundle.
2. **android**: el VPS ejecuta `scripts/build-android.sh` → `eas build` (perfil `production`, APK) → publica `https://app.viis.app/app.apk`.
3. **ios**: runner macOS → `expo prebuild` → `xcodebuild` Release sin firma → `OpenV.ipa` → publica `https://app.viis.app/app.ipa` (instalación con SideStore).

Versiones publicadas: `https://app.viis.app/app-version.json` · página de descarga: `https://app.viis.app/descargar`.

## Desarrollo

```bash
npm ci
EXPO_PUBLIC_API_URL=http://localhost:3000 npx expo start
npx tsc --noEmit && npx expo lint
```
