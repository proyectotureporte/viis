# Project map — VIIS

Actualizado: 7 de septiembre de 2026.

## Rutas web

| Ruta | Tipo | Responsabilidad |
|---|---|---|
| `/` | Página | Landing completa de OpenV y calculadora financiera. |
| `/contacto` | Página | Formulario con mensaje precargado por el CTA de origen. |
| `/api/contacto` | POST | Valida, limita abuso, guarda el lead y notifica por email. |
| `/panel` | Página privada | Acceso por contraseña y consulta de las 250 solicitudes más recientes. |
| `/api/panel/login` | POST | Valida la contraseña y crea una cookie firmada de 12 horas. |
| `/api/panel/logout` | POST | Elimina la sesión del panel. |
| `/api/health` | GET | Comprueba proceso y conectividad con PostgreSQL. |

## Modelo de datos

`ContactRequest` (`contact_requests`): nombre, correo/teléfono, ciudad, mensaje, origen, estado comercial, hash no reversible de IP para límite antiabuso, estado de la notificación y marcas de tiempo.

No se guarda la IP en claro. El hash usa `AUTH_SECRET` como sal. El panel no crea usuarios: usa `PANEL_PASSWORD` y una cookie HTTP-only firmada. No hay pagos ni archivos.

## Flujo principal

1. El visitante pulsa cualquiera de los CTA de la landing.
2. `enlaceContacto()` abre `/contacto` con el mensaje adecuado en la URL.
3. El formulario envía JSON a `POST /api/contacto`.
4. El servidor valida contenido, consentimiento, honeypot, tiempo mínimo y frecuencia por hash de IP.
5. PostgreSQL recibe el contacto con estado `NEW`.
6. El buzón `contacto@viis.app` envía un aviso a `EMAIL_TO` y, cuando el visitante dejó correo, una confirmación al cliente.
7. Se registra `SENT`, `FAILED` o `SKIPPED`; aunque SMTP falle o no esté configurado, el contacto queda preservado.
8. El equipo consulta los registros persistentes desde `/panel` con una sesión firmada y de duración limitada.

## Operación

- Producción: `ssh restaurar`, `/var/www/viis`, PM2 `viis`, `127.0.0.1:4005`.
- Proxy/SSL: Nginx + Certbot para `viis.app` y `www.viis.app`.
- Base de datos: `viis_db`, propietario `viis_user`, PostgreSQL local.
- Despliegue: GitHub Actions llama `/var/www/viis/deploy.sh` en cada push a `main`.

## Variables requeridas

- `DATABASE_URL`, `AUTH_SECRET`, `PANEL_PASSWORD`, `PORT`, `APP_URL`.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM_NAME` y `EMAIL_TO` para correos; sin credenciales, el formulario sigue guardando.
