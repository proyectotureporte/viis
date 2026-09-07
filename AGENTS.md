# VIIS / OpenV

## Objetivo

Landing de captación de OpenV para personas con créditos de vivienda y afectados por el sismo del 10 de agosto de 2026. Todos los CTA llevan a un formulario contextual que registra la solicitud antes de intentar notificarla por correo.

## Stack y producción

- Next.js 16 App Router, React 19 y TypeScript.
- PostgreSQL 17 con Prisma ORM 7.
- `pnpm` y Node.js 22.
- Producción: `/var/www/viis`, PM2 `viis`, puerto `4005`, Nginx, `https://viis.app`.
- GitHub: `proyectotureporte/viis`; cada push a `main` ejecuta `deploy.sh` por SSH.

## Comandos

- `pnpm dev`: desarrollo en `127.0.0.1:3000`.
- `pnpm check`: lint, tipos, pruebas y build.
- `pnpm db:migrate:deploy`: aplica migraciones pendientes.
- `pnpm start`: producción, leyendo `PORT`.

## Estructura esencial

- `app/page.tsx`: landing original.
- `app/contacto/page.tsx`: formulario de captación.
- `app/api/contacto/route.ts`: validación, límite antiabuso, persistencia y correo SMTP.
- `app/panel/page.tsx`: panel privado de solicitudes.
- `app/api/panel/`: inicio y cierre de la sesión privada del panel.
- `app/api/health/route.ts`: salud de app y base de datos.
- `content/sitio.ts`: fuente única de textos, cifras y fechas de campaña.
- `components/`: secciones visuales y formulario.
- `lib/credito.ts`: matemática financiera con pruebas.
- `prisma/`: modelo y migraciones.
- `docs/PROJECT-MAP.md`: mapa vivo de rutas, datos y flujos.

## Reglas

1. No cambiar cifras financieras, fechas ni afirmaciones jurídicas sin actualizar su fuente y sus pruebas.
2. El HTML permanente es el fallback; JavaScript solo activa la ventana temporal del sismo cuando la fecha lo confirma.
3. Mantener tema claro, paleta de marca y tipografías Atkinson Hyperlegible/Sora.
4. Un contacto debe persistirse antes de enviar correos; una caída de SMTP nunca puede perder el lead.
5. Nunca registrar datos personales ni secretos en consola, código o Git.
6. Toda modificación de esquema requiere una migración SQL versionada.
7. Mantener `.env*` ignorado salvo `.env.example`.
8. Actualizar `docs/PROJECT-MAP.md` cuando cambien rutas, modelos o flujos.
