# Plataforma OpenV — guía técnica

Implementa la especificación de producto y la guía de producción de OpenV (entregadas por el cliente; se guardan localmente en `docs/entrega/`, fuera del repositorio público) sobre la base de VIIS.
Producción: `https://app.viis.app` · rama `openv-plataforma` · VPS `restaurar` · `/var/www/viis-copia` · PM2 `viis-copia` (web, puerto 4012) y `viis-copia-worker` · BD `viis_copia_db`.

## Capas

| Capa | Dónde | Qué hace |
|---|---|---|
| Datos | `prisma/schema.prisma` | Expediente único (Person, Property, PropertyValuation, Loan, LoanSnapshot), originación (Opportunity, StageChange, Task, Interaction, Offer), documentos, pagos reportados, escenarios, gestiones, comisiones versionadas, academia, notificaciones, cola `Job`, bitácora `AuditEvent`. |
| Seguridad | `lib/security/` | `crypto` (AES-256-GCM en reposo, índice ciego, hash de IP), `password` (scrypt), `totp` (RFC 6238), `session` (sesiones en BD, MFA obligatorio, inactividad 30 min, absoluta 12 h), `rbac` (matriz de permisos y alcance por rol), `audit` (bitácora encadenada por hash; trigger SQL impide UPDATE/DELETE), `ratelimit`, `request`. |
| Dominio | `lib/domain/` | `cases` (alta sin duplicados + titularidad 180 días del aliado, creación de casos, motor de etapas con SLA y validaciones de radicación, causación de comisión con regla versionada), `documents` (checklist dinámico, carga con antivirus y cifrado), `access` (¿puede ver esta persona/caso?). |
| Motor financiero | `lib/finance/` | Amortización pesos/UVR, periodos irregulares, abonos, 9 simuladores, próxima mejor acción, hash de reproducibilidad. Versión `ENGINE_VERSION`. Importar submódulos (`@/lib/finance/simulators`) desde componentes cliente; `@/lib/finance` (index) solo en servidor. |
| Almacenamiento | `lib/storage.ts` | Tipo por firma de bytes (PDF/JPG/PNG, 10 MB), escaneo clamd, cifrado en disco (`STORAGE_DIR`), enlaces temporales firmados de 5 min, descarga como PDF con marca de agua. |
| Correo y cola | `lib/mail.ts`, `lib/jobs.ts`, `scripts/worker.ts` | Outbox transaccional (`enqueueEmail`, `notify`), worker con reintentos, barrido de SLA, vencimientos, re-escaneo y verificación diaria de la bitácora. |
| UI | `app/(plataforma)/`, `components/ov/` | `plataforma.css` (clases `ov-*`), `Shell` (barra lateral por portal), `ui.tsx` (PageHeader, Kpi, Status, Empty, Section, Confidence, Notice), `forms.tsx` (ActionForm, SubmitButton). |

## Convenciones obligatorias

1. **Toda página privada** empieza con `const session = await requireUser({ portal: 'cliente' | 'aliado' | 'empresa', permission? })` y se envuelve en `<Shell portal=… session={session}>`.
2. **Toda mutación** es una server action en un archivo `'use server'` construida con `secureAction(permiso, esquemaZod, handler)` de `lib/actions.ts` (verifica sesión+MFA+permiso, valida y devuelve `{ok,message}`), y se usa con `<ActionForm action={…}>`. Para botones simples sin estado se puede usar `form action` con una función que llame `assertPermission`.
3. **Alcance**: los listados de casos usan `where: { ...caseScope(session.user) }`. Las lecturas de una persona concreta verifican `canAccessPerson`.
4. **Auditoría**: cada cambio de datos llama `audit({...}, tx)` dentro de la misma transacción (`getPrisma().$transaction(async (tx) => …)`).
5. **Datos con fuente**: todo valor material (valor del inmueble, saldo, tasa) se muestra con `<Confidence level source asOf>`.
6. Montos en BD son `BigInt` (pesos); convertir con `toNumber()` y mostrar con `money()` de `lib/labels.ts`. Fechas `@db.Date` con `fechaDia()`.
7. Datos cifrados (`documentNumEnc`, `phoneEnc`) solo se descifran con `decryptText` cuando se muestran a quien tiene permiso; en listados usar `documentLast4`.
8. Nunca `console.log` de datos personales. Mensajes al usuario en español, tono claro y humano.

## Roles

Ver `ROLE_PERMISSIONS` en `lib/security/rbac.ts`. Portales: `CLIENT` → `/cliente`; `ALLY`, `ALLY_ADMIN` → `/aliado`; el resto → `/empresa`.
