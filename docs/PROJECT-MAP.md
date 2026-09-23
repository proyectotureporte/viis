# Project map — OpenV (rama `openv-plataforma`)

Actualizado: 23 de septiembre de 2026. Arquitectura y convenciones: `docs/PLATAFORMA.md`.

## Rutas públicas

| Ruta | Responsabilidad |
|---|---|
| `/`, `/contacto` | Landing original y formulario de captación (`/api/contacto`). |
| `/ingresar`, `/ingresar/verificar`, `/ingresar/configurar-mfa` | Contraseña → segundo factor TOTP obligatorio (o código de recuperación). |
| `/registro`, `/verificar-correo/[token]` | Alta de clientes con consentimientos versionados y confirmación de correo. |
| `/recuperar`, `/recuperar/[token]`, `/invitacion/[token]` | Recuperación de contraseña (30 min, un uso) e invitaciones de equipo/aliados (72 h). |
| `/legal/privacidad`, `/legal/terminos` | Política de tratamiento (Ley 1581) y términos. |
| `/certificados/[code]` | Verificación pública de certificados de la Academia. |
| `/api/health` | Salud de app, BD y latido del worker. |
| `/api/v1`, `/api/v1/simulaciones/[tipo]` | API pública versionada de simulaciones (limitada por IP). |
| `/panel` | Redirige a `/empresa/leads` (el panel de contraseña única se retiró). |

## Portales privados (sesión + MFA + permiso)

- **Cliente** `/cliente`: inicio patrimonial (5 bloques), `/hogar`, `/credito`, `/decidir` (9 simuladores + Ruta Libre Antes, escenarios y PDF), `/vivienda`, `/gestiones` (pagos, solicitudes, casos, ofertas), `/documentos`, `/ayuda`.
- **Aliado** `/aliado`: resumen, `/clientes` (+ `/nuevo`, `/[id]` ficha 360), `/embudo`, `/agenda` (.ics), `/comisiones` (CSV), `/academia` (+ `/[slug]`, `/certificado/[code]`), `/equipo`.
- **Empresa** `/empresa`: operación, `/bandeja`, `/casos/[id]` (expediente 360), `/casos/nuevo`, `/leads`, `/clientes`, `/documentos`, `/pagos`, `/solicitudes`, `/aliados`, `/comisiones`, `/analitica`, `/auditoria`, `/catalogos`, `/usuarios`.
- **Común** `/cuenta` (contraseña, MFA, códigos, sesiones, consentimientos), `/cuenta/notificaciones`.
- Descargas: `/api/documentos/[id]` (enlace firmado 5 min, PDF con marca de agua), `/api/escenarios/[id]/pdf`, `/api/aliado/*`, `/api/empresa/*` (CSV auditados).

## Flujos críticos

1. **Cliente nuevo hasta desembolso**: aliado/asesor registra (dedupe por índice ciego del documento, titularidad 180 días) → caso `OV-####` en LEAD con SLA → documentos (antivirus, cifrado, revisión con motivo) → radicación (exige autorización ENTIDADES, entidad asignada, checklist aprobado y certificaciones críticas vigentes del aliado) → aprobación → firma → desembolso (causa comisión con la regla vigente al crear el caso) → posventa.
2. **Registro de pagos**: cliente reporta con soporte → revisión → validado (actualiza el crédito con instantánea antes/después) o rechazado con motivo → conciliado.
3. **Leads de viis.app**: el worker copia cada 2 min `contact_requests` del landing (rol de solo lectura) → `/empresa/leads` → conversión en caso.

## Operación

- `ssh restaurar`, `/var/www/viis-copia`, PM2 `viis-copia` (127.0.0.1:4012) y `viis-copia-worker`, Nginx `app.viis.app` + Certbot.
- BD `viis_copia_db` (usuario `viis_copia_user`); documentos en `/var/lib/viis-copia/documentos`; clamd en `/var/run/clamav/clamd.ctl`.
- Respaldo diario 02:30 `/usr/local/bin/viis-copia-backup` → `/var/backups/viis-copia`.
- Despliegue: push a `openv-plataforma` → CI (lint, tipos, pruebas) → `deploy.sh`.
