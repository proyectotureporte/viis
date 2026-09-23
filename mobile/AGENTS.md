This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## OpenV — convenciones de la app (obligatorias)

Producción real enterprise. Tres portales nativos según el rol del usuario: `src/app/(cliente)`, `src/app/(aliado)`, `src/app/(empresa)`. El guardado de rutas por estado de sesión y rol está en `src/app/_layout.tsx` (no tocar sin coordinar).

- **Datos**: solo por `src/services/api.ts` (`api.get`, `api.post`, `formData`) contra `/api/movil/v1`. Tipos de respuesta: `import type { … } from '@/lib/movil/contract'` (cliente/aliado) y `@/lib/movil/contract-empresa` (empresa). Documentación: `../docs/API-MOVIL.md`, `../docs/API-MOVIL-EMPRESA.md`.
- **Hooks**: `useApi<T>(path)` (carga al enfocar la pantalla, `refresh` para "tirar para actualizar") y `useAction()` (POST → `{ok, message}` con vibración). Mostrar SIEMPRE el mensaje del servidor con `<ResultBanner>`.
- **Sesión**: `useAuth()` de `src/services/auth.tsx` (usuario, `permissions`, `logout`). La autorización real la hace el servidor; en la app se ocultan acciones según `user.permissions`.
- **UI**: usar SOLO `src/ui/kit.tsx` (Screen, Card, Kpi, Grid, Row, KeyValue, Section, Pill, Empty, Notice, Confidence, ResultBanner, Progress, Button, Field, MoneyField, Select, Checkbox, Segmented, Loading, ErrorState, T) y `src/ui/theme.ts`. Íconos: `lucide-react-native`. Si falta un componente genérico, añadirlo al kit sin romper los existentes. Estética: la del MVP (navy `#0c2b3b`, menta `#18c6a3`, tarjetas blancas), tipografías Sora/Atkinson ya cargadas.
- **Formatos**: `src/services/format.ts` (pesos, pesosCortos, pct, fecha, fechaHora, milesInput, soloDigitos, hoyIso). Montos se envían como texto de dígitos o con puntos (el servidor los normaliza).
- **Motor financiero compartido con la web**: `import { … } from '@/lib/finance/simulators'` / `@/lib/finance/amortization` y `@/lib/cliente/simulate` (runSimulation, summarizeResults, describeParams). NUNCA importar `@/lib/finance` (index) ni `hash`: usan `node:crypto`.
- **Archivos**: cámara/galería con `expo-image-picker`, PDF con `expo-document-picker`; subir con `formData()` + `new File(uri)` de `expo-file-system` (ver docs SDK 57). Ver documentos: pedir el enlace temporal a la API y descargar con `File.downloadFileAsync(url, new Directory(Paths.cache, 'docs'), { headers: { Authorization: 'Bearer …' } })` y abrir con `expo-sharing` (`shareAsync`, que ofrece Vista previa / visor del sistema).
- **Navegación**: expo-router. Cada portal: `_layout.tsx` con `Tabs` (máx. 5 pestañas; lo demás en una pestaña "Más") y pantallas de detalle en rutas anidadas (`clientes/[id].tsx`) con `Stack` si hace falta encabezado con "atrás". Pantallas comunes (`src/app/notificaciones.tsx`, `src/app/cuenta.tsx`) están fuera de los grupos.
- **Calidad**: estados de carga, error con reintento, vacío útil y "tirar para actualizar" en toda lista; teclado que no tape campos (Screen ya usa KeyboardAvoidingView); accesibilidad (`accessibilityLabel`, roles); textos en español claro; nada de datos inventados.
- **Verificación antes de terminar**: `npx tsc --noEmit`, `npx expo lint` (0 errores y 0 advertencias), `npx expo export --platform android` y `--platform ios`. Prueba visual: API local `cd .. && pnpm dev -p 3000` (CORS abierto solo en desarrollo). Cada agente usa sus propios puertos para no chocar, app con `EXPO_PUBLIC_API_URL=http://localhost:3000 npx expo start --web --port 8081` y Playwright a 390×844. En web no hay biometría: el flujo es correo → contraseña → código TOTP.
