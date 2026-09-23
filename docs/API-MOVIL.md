# API móvil OpenV — `/api/movil/v1`

API JSON que consume la app nativa (Expo/React Native) de **clientes** y **aliados**. Los tipos de cada respuesta están en [`lib/movil/contract.ts`](../lib/movil/contract.ts) (tipos puros: `import type { … }` desde la app).

## Reglas generales

- **Autenticación**: `Authorization: Bearer <token>` (flujo `auth/login` → `auth/mfa`; ver `app/api/movil/v1/auth/*`). La sesión es la misma de la web: MFA obligatorio, 30 min de inactividad, 12 h absolutas.
- **Mutaciones = server actions de la web.** Cada `POST` ejecuta la MISMA acción que el formulario web (`runAction`), con los mismos nombres de campo, permisos, validación, alcance y auditoría. El cuerpo puede ser JSON o `multipart/form-data` (obligatorio si hay archivo). En JSON: arreglos → campos repetidos, `true` → `"on"`, `false`/`null` se omiten, objetos → texto JSON.
- **Respuesta de mutación** (`ActionResult`): `{ ok, message, at?, id?, href?, linkLabel?, redirect? }` con **200** si `ok` y **422** si la acción rechazó los datos (`message` se muestra tal cual). `id` = registro creado cuando aplica.
- **Errores**: `{ ok: false, message }` — 400 cuerpo inválido · 401 sesión vencida o sin token · 403 perfil/permiso (p. ej. un cliente en `/aliado/*`) · 404 no existe **o está fuera de tu alcance** (nunca se distingue) · 409 cliente sin expediente · 423 documento en antivirus · 500.
- **Formatos**: montos en pesos (`number`), tasas y porcentajes como fracción (0,125 = 12,5 %) en lecturas; fechas `YYYY-MM-DD` (columnas de día) o ISO 8601 UTC (instantes). En los **cuerpos** se aceptan los formatos de la web: `"4.500.000"`, `"12,5"` (porcentaje), `"YYYY-MM-DD"`, `"HH:MM"` (Bogotá).
- **Privacidad**: nunca viajan `documentNumEnc`, `phoneEnc`, hashes ni secretos; el documento de identidad solo como últimos 4 (`CC ···1234`). El celular del cliente se revela solo con `POST aliado/clientes/{id}/telefono` (auditado).
- **Alcance**: el cliente solo ve su expediente (`ownPerson`); el aliado, los casos de `caseScope` (ALLY: los suyos; ALLY_ADMIN: los de su organización). Los `POST` con `{id}` verifican el alcance antes de ejecutar la acción (404 si no).
- Todas las rutas: `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`, `Cache-Control: no-store`.

## Común

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| GET | `/api/movil/v1` | — | versión, `minAppVersion`, descargas |
| GET | `yo` | — | perfil y portal (`cliente`/`aliado`/`empresa`) |
| GET | `notificaciones` | — | `NotificacionesResponse` (100 más recientes, `unread`) |
| POST | `notificaciones/leidas` | `{ ids?: uuid[] }` (vacío = todas) | `{ ok, updated }` |

## Cliente — `/api/movil/v1/cliente/...` (rol CLIENT)

| Método | Ruta | Cuerpo | Respuesta / notas |
|---|---|---|---|
| GET | `inicio` | — | `ClienteInicioResponse`: patrimonio (valor, rango, variación, fuente, fecha, confianza), avance, próxima mejor acción + otras (con `link` a pantalla de la app), próximo pago (desglose capital/intereses/seguros y estado del reporte del periodo), radar, avisos del motor, casos activos con faltantes y flags de onboarding. Sin expediente: `hasPerson: false`. |
| GET | `hogar` | — | `HogarResponse` |
| POST | `hogar` | `{ goals: string[], goalsNote?, monthlyIncome?, monthlyExpenses?, savings?, city? }` | `ActionResult` |
| GET | `vivienda` | — | `ViviendaResponse`: inmuebles con valoraciones, deuda, LTV y serie de patrimonio; solicitudes de avalúo; documentos del inmueble (CTL, avalúo, póliza) |
| POST | `vivienda` | `{ id?, alias, address?, city?, kind, stratum?, areaM2?: "72,5", isVis? }` — sin `id` crea, con `id` reemplaza la ficha | `ActionResult` + `id` |
| POST | `vivienda/valor` | `{ propertyId, value, low?, high?, asOf, basis, note? }` (`basis` en `catalogos.valueBases`) | `ActionResult` (queda DECLARED) |
| POST | `vivienda/avaluo` | `{ propertyId, detail? }` | `ActionResult` + `id` de la solicitud |
| GET | `credito?id=&pagina=` | — | `CreditoResponse`: créditos activos y detalle del elegido: condiciones, `state` (para simular local), próxima cuota con desglose, totales restantes, intereses evitados por abonos validados, tabla restante paginada (24 filas), línea de tiempo y pagos |
| POST | `credito` | `{ id?, alias, entityId?, propertyId?, system: FIXED_PESOS\|UVR, rateEa: "12,5", termMonths, originalAmount, disbursedAt, balance, balanceAsOf, paidInstallments, monthlyInsurance, paymentDay }` | `ActionResult` + `id` |
| POST | `credito/cerrar` | `{ id, reason: PAID_OFF\|TRANSFERRED\|ERROR }` | `ActionResult` |
| GET | `escenarios` | — | `EscenariosResponse`: tipos de simulación, contexto (créditos con `state`, hogar, tasa de referencia, inflación, valor de la vivienda, hoy) y escenarios guardados (entradas, resultados, resumen legible, supuestos, `pdfUrl`) |
| POST | `escenarios` | `{ kind, name, loanId?, params: {…} }` (`params` según `lib/cliente/schemas.ts`; fracciones para porcentajes) | `ActionResult` + `id`. El servidor recalcula con el crédito de la BD. |
| POST | `escenarios/{id}/renombrar` | `{ name }` | `ActionResult` |
| POST | `escenarios/{id}/duplicar` | — | `ActionResult` + `id` de la copia |
| POST | `escenarios/{id}/compartir` | `{ note? }` | `ActionResult` + `id` de la solicitud |
| GET | `/api/escenarios/{id}/pdf` | — | PDF (acepta el mismo Bearer) |
| GET | `parametros` | — | `ParametrosResponse`: UVR, inflación proyectada, tasas de referencia (pesos y UVR) con fuente/fecha, versión del motor. La app simula localmente con `lib/finance` (submódulos) y `lib/cliente/simulate.ts`. |
| GET | `gestiones` | — | `GestionesResponse`: créditos para reportar, canales, pagos reportados, solicitudes, tipos de solicitud y casos con etapas, interacciones visibles al cliente y ofertas (`canAccept`) |
| POST | `pagos` | **multipart**: `loanId, kind: INSTALLMENT\|PREPAYMENT, applyMode?: TERM\|PAYMENT (abonos), paidOn, amount, channel, reference?, file, ack=on` | `ActionResult` |
| POST | `solicitudes` | `{ kind, subject, detail, incomeDrop?: "30", newExpense? }` (HARDSHIP adjunta el resumen del Modo Tranquilidad) | `ActionResult` + `id` |
| GET | `solicitudes/{id}` | — | `RequestDetailResponse` (hilo SIN mensajes internos) |
| POST | `solicitudes/{id}/mensajes` | `{ body }` | `ActionResult` |
| POST | `ofertas/{id}/aceptar` | `{ confirm: true }` | `ActionResult` (guarda la evidencia de aceptación) |
| GET | `documentos` | — | `DocumentosResponse`: checklist por caso (estado, versión, motivo de rechazo, vencimiento, `needsUpload`), tipos para cargar, expediente completo con versiones |
| POST | `documentos` | **multipart**: `typeId, opportunityId?, file` (PDF/JPG/PNG ≤ 10 MB) | `ActionResult` |
| GET | `documentos/{id}/enlace` | — | `DocumentLinkResponse` `{ url, absoluteUrl, expiresAt }`: enlace firmado de 5 min y solo para este usuario; abrirlo con el mismo Bearer (devuelve PDF con marca de agua). 423 si está en antivirus. |
| GET | `catalogos` | — | `CatalogosResponse`: entidades activas, tipos de solicitud, productos, canales de pago, tipos documentales, tipos de inmueble, bases de valor, objetivos, motivos de cierre, simulaciones, etapas, tipos de documento de identidad, finalidades de consentimiento, canales de interacción y tipos de actividad. (También en `aliado/catalogos`.) |

## Aliado — `/api/movil/v1/aliado/...` (roles ALLY y ALLY_ADMIN)

| Método | Ruta | Cuerpo | Respuesta / notas |
|---|---|---|---|
| GET | `resumen` | — | `AliadoResumenResponse`: KPIs (cartera, desembolsado del mes vs meta, comisiones, conversión), urgentes (SLA y faltantes), tareas de hoy, certificaciones y bloqueo de radicación, avisos |
| GET | `clientes?q=&etapa=&pagina=` | — | `AliadoClientesResponse` (50 por página; `q` = nombre, `OV-1001` o últimos 4 del documento) |
| POST | `clientes` | `{ documentType: CC\|CE\|PPT\|PA, documentNumber, firstName, lastName, email?, phone?, city?, monthlyIncome?, product, amount?, consents: string[] (debe incluir TRATAMIENTO), declaration: true, invite?: true }` | `ActionResult` + `id` del caso (sin duplicar personas; titularidad 180 días) |
| GET | `clientes/{id}` | — | `AliadoFichaResponse` (ficha 360: etapa y `allowedMoves`, línea de tiempo, checklist, interacciones, tareas, ofertas, comisión, consentimientos) |
| POST | `clientes/{id}/telefono` | — | `ActionResult` con el celular en `message` (auditado) |
| POST | `clientes/{id}/documentos` | **multipart**: `typeId, file` (foto de la cámara en JPG/PNG o PDF) | `ActionResult` |
| POST | `clientes/{id}/interacciones` | `{ channel: LLAMADA\|VISITA\|WHATSAPP\|CORREO\|NOTA, summary, visibleToClient? }` | `ActionResult` |
| POST | `clientes/{id}/etapa` | `{ to: CONTACTED\|PROFILED, note? }` o `{ to: WITHDRAWN, reason }` | `ActionResult` (400 para otras etapas) |
| POST | `clientes/{id}/consentimientos` | `{ consents: string[], declaration: true }` | `ActionResult` |
| POST | `clientes/{id}/invitar` | — | `ActionResult` (máx. una vez cada 24 h) |
| GET | `documentos/{id}/enlace` | — | `DocumentLinkResponse` para documentos de clientes en su alcance |
| GET | `embudo` | — | `AliadoEmbudoResponse`: columnas por etapa (25 casos visibles), desistidos, conversión y tiempo promedio por etapa |
| GET | `agenda` | — | `AliadoAgendaResponse`: vencidas, hoy + 7 días (hora de Bogotá), cerradas recientes, casos para vincular |
| POST | `agenda` | `{ kind: TAREA\|CITA\|LLAMADA, title, date, time: "HH:MM", detail?, opportunityId? }` | `ActionResult` + `id` |
| POST | `agenda/{id}/completar` | — | `ActionResult` |
| POST | `agenda/{id}/reprogramar` | `{ date, time }` | `ActionResult` |
| POST | `agenda/{id}/cancelar` | — | `ActionResult` |
| GET | `/api/aliado/agenda/{id}/ics` | — | iCalendar (acepta Bearer) |
| GET | `comisiones` | — | `AliadoComisionesResponse`: totales por estado, liquidaciones con desglose del snapshot de la regla, reglas vigentes por producto con ejemplo sobre $100 M, `csvUrl` |
| GET | `academia` | — | `AliadoAcademiaResponse` |
| GET | `academia/{slug}` | — | `AliadoCursoResponse`: lecciones y preguntas **sin** la respuesta correcta, intentos del día |
| POST | `academia/{slug}/leccion` | `{ lesson: 0 }` | `ActionResult` |
| POST | `academia/{slug}/evaluacion` | `{ answers: number[] }` (o `a0, a1…`) | `ActionResult`: 200 aprobado (`href` al certificado), 422 reprobado o sin lecciones vistas. Calificación en servidor, máx. 5 intentos/día. |

## Código

- Rutas: `app/api/movil/v1/**/route.ts` (delgadas: sesión → lectura o `runAction`).
- Lecturas: `lib/movil/cliente.ts` y `lib/movil/aliado.ts` (equivalentes a las páginas de `app/(plataforma)/cliente/**` y `app/(plataforma)/aliado/**`; si cambias la lógica de una página, refleja el cambio aquí).
- Utilidades: `lib/movil/http.ts` (`apiSession`, `handler`, `json`, `bodyAsForm`, `runAction`), `lib/movil/actions.ts` (`runActionWithId`), `lib/movil/util.ts`, `lib/movil/documents.ts`.
- Contrato: `lib/movil/contract.ts`.

## Equipo del aliado (solo ALLY_ADMIN)

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| GET | `aliado/equipo` | — | `AliadoEquipoResponse` (meta, consolidado por aliado, casos activos para reasignar) |
| POST | `aliado/equipo/invitar` | `{ name, email }` | `{ ok, message }` |
| POST | `aliado/equipo/reasignar` | `{ opportunityId, allyUserId }` | `{ ok, message }` |
| POST | `aliado/equipo/meta` | `{ monthlyGoal }` (pesos; vacío = sin meta) | `{ ok, message }` |
