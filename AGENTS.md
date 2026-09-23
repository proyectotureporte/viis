# VIIS / OpenV — plataforma (rama `openv-plataforma`)

## Objetivo

OpenV, plataforma integral de gestión hipotecaria, construida según `docs/entrega/` (especificación de producto y guía de producción). Incluye:
- la landing de captación original (`/`, `/contacto`);
- el portal del **cliente** (`/cliente`), el portal del **aliado** (`/aliado`) y la **consola de empresa** (`/empresa`), con MFA obligatorio, permisos por rol en el servidor, expediente único, auditoría inmutable, motor financiero versionado y documentos cifrados con antivirus.

## Stack y producción

- Next.js 16 App Router, React 19, TypeScript, PostgreSQL + Prisma 7, `pnpm`, Node 22.
- Producción: `https://app.viis.app`, VPS `restaurar`, `/var/www/viis-copia`, PM2 `viis-copia` (puerto 4012) y `viis-copia-worker`, BD `viis_copia_db`, documentos en `/var/lib/viis-copia/documentos`, antivirus `clamav-daemon`, Nginx + Certbot.
- GitHub `proyectotureporte/viis`, rama `openv-plataforma`: cada push ejecuta lint + tipos + pruebas y luego `deploy.sh` por SSH. La rama `main` sigue desplegando la landing `viis.app` sin cambios.
- Respaldos: `/usr/local/bin/viis-copia-backup` (cron 02:30) → `/var/backups/viis-copia` (14 días). Claves en `/root/.viis-copia-keys`: **perder `DATA_ENCRYPTION_KEY` es perder los datos cifrados**; guardar copia fuera del servidor.

## Comandos

- `pnpm dev` · `pnpm check` (lint, tipos, pruebas, build) · `pnpm db:migrate:deploy` · `pnpm db:seed` (catálogos, idempotente).
- `pnpm worker`: cola de correos, SLA, vencimientos, antivirus, sincronización de leads de viis.app y verificación de la bitácora.
- `pnpm user:invite --email x@viis.app --name "Nombre" --role ADMIN`: alta de usuarios internos desde el servidor.

## Estructura esencial

Ver `docs/PLATAFORMA.md` (capas y convenciones obligatorias) y `docs/PROJECT-MAP.md` (rutas, datos y flujos).

## Reglas

1. Toda página privada usa `requireUser`; toda mutación usa `secureAction` o `assertPermission`. La interfaz nunca es la única barrera.
2. Todo cambio de datos se audita en la misma transacción (`audit(..., tx)`). `audit_events` es de solo inserción.
3. Ningún dato material sin fuente, fecha y nivel de confianza. Ninguna simulación es oferta vinculante.
4. No cambiar el motor financiero sin subir `ENGINE_VERSION` y sus pruebas.
5. Nunca registrar datos personales ni secretos en consola, código o Git. Documento y teléfono se guardan cifrados.
6. Toda modificación de esquema requiere una migración SQL versionada.
7. Los textos de autorización (`lib/consent.ts`) se versionan; deben validarse con el abogado antes de operar.
8. Mantener `.env*` ignorado salvo `.env.example`. Actualizar `docs/PROJECT-MAP.md` cuando cambien rutas, modelos o flujos.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
