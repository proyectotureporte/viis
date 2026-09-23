# API móvil · Consola de empresa (`/api/movil/v1/empresa/**`)

API JSON que consume la app nativa (Expo) para el personal interno de OpenV. Es la misma consola web
`/empresa/**` expuesta como JSON: **mismas reglas, permisos, alcance y bitácora**.

- **Tipos de respuesta:** `lib/movil/contract-empresa.ts` (tipos puros; la app los importa con `import type`).
- **Lecturas:** `lib/movil/empresa/*.ts` (consultas Prisma equivalentes a las páginas web).
- **Mutaciones:** cada `POST` importa la **server action existente** de `app/(plataforma)/empresa/**` y la ejecuta
  con `runAction` (o una variante que además devuelve `id`). No se reimplementa ninguna regla.

## Autenticación

1. `POST /api/movil/v1/auth/login` `{ email, password }` → `{ ticket, next: 'mfa' | 'setup_mfa' }`
2. `POST /api/movil/v1/auth/mfa` `{ code }` con `Authorization: Bearer <ticket>` → `{ token }`
3. Todas las llamadas: `Authorization: Bearer <token>`.

Solo roles internos (portal `empresa`); un cliente o aliado recibe **403**.

## Convenciones

| Tema | Regla |
|---|---|
| Montos | `number` en pesos (enteros). |
| Tasas / porcentajes / ratios | Fracción: `0.125` = 12,5 %. **Excepción en entradas:** los formularios aceptan `%` como la web (`rateEa: "12,5"`). |
| Fechas | `ISODate` `YYYY-MM-DD` (columnas sin hora); `ISODateTime` ISO 8601 UTC. Operación en hora de Bogotá. |
| Documento de identidad | Solo `documentLast4`. El número completo solo con los endpoints `…/documento-completo` (auditados). |
| Paginación | `?pagina=N` (también `?p=N` como la web). Respuesta con `page: { page, pageSize, total, pages }`. Auditoría usa cursor (`?antes=` / `?despues=`). |
| Filtros | Mismos nombres de querystring que la web (`etapa`, `prioridad`, `responsable`, `vencidos=1`, …). |
| Cuerpo de mutaciones | JSON o multipart con los **mismos nombres de campo del formulario web**. Arreglo → campo repetido; `true` → casilla marcada (`"on"`); casilla ausente = `false`. Las acciones "sin cuerpo" aceptan cuerpo vacío. |
| Respuesta de mutaciones | `ActionResult { ok, message, id?, redirect? }` — **200** si `ok`, **422** si la acción rechazó los datos (mostrar `message` tal cual). |
| Errores | `{ ok:false, message }`: 400 cuerpo inválido · 401 sin sesión/vencida · 403 sin permiso del área/acción · 404 no existe o fuera de tu alcance · 422 validación · 423 documento en antivirus · 500. |

**Alcance:** el ASESOR solo ve casos asignados a él o sin responsable (`caseScope`). Un caso fuera de alcance
responde **404** tanto en lectura como en mutación (se verifica antes de ejecutar la acción, y la acción lo vuelve
a verificar dentro de su transacción).

**Permisos:** las lecturas exigen el permiso del área según `components/ov/nav.ts`; las mutaciones exigen el
permiso de la server action correspondiente (p. ej. `pagar` comisión → `commission.pay`). `GET empresa/menu`
devuelve las áreas visibles y `permissions` del rol para ocultar botones; cada respuesta de lectura trae además
`can: {…}` con las acciones disponibles.

## Endpoints

Rutas relativas a `/api/movil/v1`. Tipo de respuesta entre corchetes.

### Operación · (todo el personal interno)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `empresa/menu` | Áreas visibles del rol, permisos, badges de pendientes y avisos sin leer. [`MenuResponse`] |
| GET | `empresa/operacion` | KPIs (pipeline, desembolsos del mes vs meta, conversión 180 d, SLA 30 d), alertas SLA, casos urgentes, mis tareas, embudo del mes, operación por canal. [`OperacionResponse`] |
| POST | `empresa/tareas/{id}/cerrar` | Cierra una tarea propia `{ status?: 'DONE' (defecto) \| 'CANCELLED' }`. `case.note` |

Badges del menú: operación = mis tareas vencidas · bandeja = casos con SLA vencido en tu alcance · leads = por gestionar ·
documentos = pendientes de revisión · pagos = por revisar · solicitudes = abiertas con SLA vencido · comisiones = causadas.

### Bandeja · `case.read`

| Método | Ruta | Descripción |
|---|---|---|
| GET | `empresa/bandeja` | `?q` (OV-1001, nombre o últimos 4) `&etapa&prioridad&producto&responsable=<uuid>\|none&entidad&canal&vencidos=1&pagina`. Orden: crítica/alta por SLA, luego el resto por SLA. Incluye carga por responsable y catálogos de filtros. [`BandejaResponse`] |
| POST | `empresa/bandeja/asignar` | Masiva `{ ids[], assigneeId: uuid \| 'none' }`. `case.assign` |
| POST | `empresa/bandeja/escalar` | Masiva `{ ids[], reason }`. `case.stage` |
| POST | `empresa/bandeja/prioridad` | `{ ids[], priority }` (uno o varios; ejecuta la acción del expediente caso por caso). [`BulkActionResult`] `case.assign` |
| POST | `empresa/casos/{id}/tomar` | Tomar un caso sin responsable. `case.stage` |

### Casos · `case.read`

| Método | Ruta | Cuerpo / descripción | Permiso |
|---|---|---|---|
| GET | `empresa/casos/{id}` | Expediente 360: caso, cliente (últimos 4), hogar, inmuebles con valoración y confianza, créditos, consentimientos, etapa + línea de tiempo + transiciones permitidas, checklist con versiones, interacciones, tareas, ofertas con comparación normalizada del motor (mejor cuota / menor costo, ahorro vs crédito actual), comisiones, bitácora del caso (50 eventos) y catálogos de formularios. [`CasoResponse`] | `case.read` |
| POST | `empresa/casos/{id}/etapa` | `{ to, note?, disbursedAmount?, withdrawReason? }` | `case.stage` |
| POST | `empresa/casos/{id}/prioridad` | `{ priority }` | `case.assign` |
| POST | `empresa/casos/{id}/responsable` | `{ assigneeId: uuid \| '' }` | `case.assign` |
| POST | `empresa/casos/{id}/entidad` | `{ entityId: uuid \| '' }` | `case.stage` |
| POST | `empresa/casos/{id}/siguiente-accion` | `{ nextAction }` | `case.note` |
| POST | `empresa/casos/{id}/escalar` | `{ reason }` | `case.stage` |
| POST | `empresa/casos/{id}/interacciones` | `{ channel: LLAMADA\|WHATSAPP\|CORREO\|REUNION\|INTERNO, summary, visibleToClient? }` | `case.note` |
| POST | `empresa/casos/{id}/tareas` | `{ assigneeId, kind: TAREA\|LLAMADA\|CITA\|SEGUIMIENTO, title, detail?, dueAt: 'YYYY-MM-DDTHH:mm' (hora Colombia) }` | `case.note` |
| POST | `empresa/casos/{id}/tareas/{taskId}` | `{ status: DONE\|CANCELLED }` | `case.note` |
| POST | `empresa/casos/{id}/ofertas` | `{ entityName? \| entityOther?, rateEa: '12,5', system, termMonths, amount, monthlyInsurance?, upfrontCosts?, validUntil?, source, conditions? }` (se calcula con el motor) | `offer.manage` |
| POST | `empresa/casos/{id}/ofertas/{offerId}/aceptar` | `{ channel: PRESENCIAL\|LLAMADA\|VIDEOLLAMADA\|CORREO\|WHATSAPP, declaration }` | `offer.manage` |
| POST | `empresa/casos/{id}/documento-completo` | Sin cuerpo. Documento y teléfono completos en `message`; **queda en la bitácora** (`person.document_viewed`). | `person.read` |
| POST | `empresa/casos/{id}/documentos` | **multipart** `{ typeId, file }` (PDF/JPG/PNG, 10 MB; tipo por firma de bytes, antivirus, cifrado) | `doc.upload` |
| POST | `empresa/casos/{id}/documentos/{docId}/tomar` | Sin cuerpo. | `doc.review` |
| POST | `empresa/casos/{id}/documentos/{docId}/revision` | `{ decision: APPROVE\|REJECT, reason? (obligatorio al rechazar) }` | `doc.review` |
| GET | `empresa/casos/nuevo` | Catálogos del alta (tipos de documento, productos, entidades, responsables, canales de captura, textos de autorización con versión y la declaración del asesor). [`NuevoCasoResponse`] | `case.create` |
| POST | `empresa/casos/nuevo` | `{ documentType, documentNumber, firstName, lastName, email?, phone?, city?, monthlyIncome?, product, amount?, entityId?, assigneeId?, nextAction?, consents[] (incluye TRATAMIENTO), captureChannel, declaration: true }` → `ActionResult` con `id` del caso. Sin duplicados (índice ciego). El ASESOR queda como responsable. | `case.create` + `person.create` |

### Leads web · `lead.manage`

| Método | Ruta | Descripción |
|---|---|---|
| GET | `empresa/leads` | `?estado=NEW\|CONVERTED\|DISCARDED&pagina`. Incluye nombre partido sugerido, motivo de descarte y catálogos del formulario de conversión. [`LeadsResponse`] |
| POST | `empresa/leads/{id}/convertir` | Mismos campos que `casos/nuevo`; devuelve `id` del caso (canal WEB). Bloqueo optimista: si otro lo gestionó, 422. |
| POST | `empresa/leads/{id}/descartar` | `{ reason }` |

### Clientes · `person.read`

| Método | Ruta | Descripción |
|---|---|---|
| GET | `empresa/clientes` | `?q` (nombre, correo o últimos 4) o `?tipo=CC&doc=<número>` (búsqueda exacta por índice ciego, sin descifrar) `&pagina`. [`ClientesResponse`] |
| POST | `empresa/clientes/buscar-documento` | `{ tipo, doc, pagina? }` → igual que GET, **sin dejar el número en la URL** (recomendado en la app). |
| GET | `empresa/clientes/{id}` | Ficha: datos (últimos 4), hogar, casos en tu alcance, créditos, inmuebles, documentos, solicitudes, autorizaciones vigentes e historial. [`ClienteFichaResponse`] |
| POST | `empresa/clientes/{id}/documento-completo` | Sin cuerpo; auditado. |
| POST | `empresa/clientes/{id}/consentimientos/revocar` | `{ purpose, channel: ESCRITO\|CORREO\|TELEFONICO\|PRESENCIAL\|SOLICITUD_PLATAFORMA, evidence }` — `consent.manage` |

### Documentos · `doc.review`

| Método | Ruta | Descripción |
|---|---|---|
| GET | `empresa/documentos` | Cola (más antiguos primero): `?estado=UPLOADED\|IN_REVIEW&tipo=<uuid>&mios=1&pagina`; conteos y cuarentena antivirus. [`DocumentosResponse`] |
| POST | `empresa/documentos/{id}/tomar` | Sin cuerpo. |
| POST | `empresa/documentos/{id}/aprobar` | Sin cuerpo (vence = hoy + vigencia del tipo). |
| POST | `empresa/documentos/{id}/rechazar` | `{ reason }` (lo recibe el cliente). |
| GET | `empresa/documentos/{id}/enlace` | `{ url, absoluteUrl, expiresAt }` firmada 5 min **para este usuario**; se verifica acceso antes de firmar. Abrir con el **mismo Bearer**: `/api/documentos/{id}` devuelve PDF con marca de agua y registra `document.viewed`. 404 sin acceso, 423 en antivirus. Permiso `person.read` (también para soportes de pago y ficha del cliente). |

### Pagos · `payment.review`

| Método | Ruta | Descripción |
|---|---|---|
| GET | `empresa/pagos` | `?tab=cola\|conciliar\|historico&pagina`; posibles duplicados, soporte, referencia de conciliación. [`PagosResponse`] |
| POST | `empresa/pagos/{id}/tomar` · `validar` | Sin cuerpo. Validar aplica el pago al gemelo del crédito. |
| POST | `empresa/pagos/{id}/rechazar` | `{ reason }` |
| POST | `empresa/pagos/{id}/conciliar` | `{ reference }` |

### Solicitudes · `request.manage`

| Método | Ruta | Descripción |
|---|---|---|
| GET | `empresa/solicitudes` | `?estado&tipo&resp=yo\|ninguno\|<uuid>&vencidas=1&pagina` (por SLA). [`SolicitudesResponse`] |
| GET | `empresa/solicitudes/{id}` | Detalle, conversación (con notas internas marcadas) y escenario adjunto del cliente. [`SolicitudResponse`] |
| POST | `empresa/solicitudes/{id}/tomar` | Sin cuerpo. |
| POST | `empresa/solicitudes/{id}/asignar` | `{ assigneeId: uuid \| '' }` |
| POST | `empresa/solicitudes/{id}/estado` | `{ status: OPEN\|IN_PROGRESS\|WAITING_CLIENT }` |
| POST | `empresa/solicitudes/{id}/mensajes` | `{ body, internal? }` (cerrada: solo nota interna) |
| POST | `empresa/solicitudes/{id}/resolver` | `{ outcome: RESOLVED\|REJECTED, resolution }` |

### Aliados · `ally.manage`

| Método | Ruta | Descripción |
|---|---|---|
| GET | `empresa/aliados` | Ranking responsable (conversión, calidad documental, desistimiento, desembolsos, meta, puntaje) con su definición. [`AliadosResponse`] |
| POST | `empresa/aliados` | Crea: `{ kind: ALLY_COMPANY\|ALLY_PERSON, name, taxId?, territory?, tier, monthlyGoal?, active? }` |
| GET | `empresa/aliados/{id}` | Ficha: desempeño, usuarios con estado y certificaciones (bloqueo por curso crítico), casos recientes. [`AliadoResponse`] |
| POST | `empresa/aliados/{id}` | Edita (mismos campos; `active` ausente = inactivar y cerrar sesiones de sus usuarios). |
| POST | `empresa/aliados/{id}/invitar` | `{ name, email, role: ALLY\|ALLY_ADMIN }` |
| POST | `empresa/aliados/usuarios/{userId}/reenviar` | Sin cuerpo. |
| POST | `empresa/aliados/usuarios/{userId}/estado` | `{ active: '1'\|'0', reason? }` |

### Comisiones · `commission.approve`

| Método | Ruta | Descripción | Permiso |
|---|---|---|---|
| GET | `empresa/comisiones` | `?tab=liquidacion` (`estado, aliado, desde, hasta, pagina`, totales) · `resumen` (`desde, hasta, estado`, neto por aliado y estado + `csvPath`) · `reglas` (versiones, vigencia, usos). [`ComisionesResponse`] | `commission.approve` |
| POST | `empresa/comisiones/aprobar` | `{ ids[] }` | `commission.approve` |
| POST | `empresa/comisiones/{id}/programar` | `{ payDate }` | `commission.approve` |
| POST | `empresa/comisiones/{id}/pagar` | `{ paymentRef }` | `commission.pay` |
| POST | `empresa/comisiones/{id}/reversar` | `{ reason }` | `commission.approve` |
| POST | `empresa/comisiones/reglas` | `{ name, organizationId? \| tier?, product?, percent: '1,2', withholdingPct, paymentDays, validFrom, validTo? }` | `commission.rules` |
| POST | `empresa/comisiones/reglas/{id}/version` | `{ percent, withholdingPct, paymentDays, validFrom, validTo?, note? }` | `commission.rules` |
| POST | `empresa/comisiones/reglas/{id}/cerrar` | `{ validTo, reason }` | `commission.rules` |

### Analítica · `analytics.read`

`GET empresa/analitica?desde=YYYY-MM-DD&hasta=YYYY-MM-DD` (por defecto últimos 90 días) → métrica norte (ventana de 90 días
hasta `hasta`, numerador/denominador, acciones por tipo y **definición** textual), KPIs, embudo acumulado, desistimiento
por causa, tiempo por etapa vs SLA, conversión por canal/aliado/entidad, calidad documental, pagos y solicitudes.
[`AnaliticaResponse`]

### Auditoría · `audit.read`

| Método | Ruta | Descripción |
|---|---|---|
| GET | `empresa/auditoria` | `?accion&entidad&id&actor=<correo\|uuid>&desde&hasta`; cursor `?antes=<id>` / `?despues=<id>` (50 por página). Incluye `csvPath`. [`AuditoriaResponse`] |
| POST | `empresa/auditoria/verificar` | Recalcula toda la cadena de hash (queda auditado). 422 con alerta si está rota. |

### Catálogos · `catalog.manage`

| Método | Ruta | Cuerpo |
|---|---|---|
| GET | `empresa/catalogos` | Todo: entidades, tasas (100 últimas), parámetros con historial, tipos documentales, cursos con contenido. [`CatalogosResponse`] |
| POST | `empresa/catalogos/entidades` | `{ name, slaHours, agreement?, notes? }` |
| POST | `empresa/catalogos/entidades/{id}` | `{ slaHours, active?, agreement?, notes? }` |
| POST | `empresa/catalogos/tasas` | `{ entityId?, product, system, rateEa: '12,5', source, asOf, validUntil? }` |
| POST | `empresa/catalogos/parametros` | `{ key, value, source, asOf }` (INFLACION_PROYECTADA en %) |
| POST | `empresa/catalogos/tipos-documentales` | `{ code, name, description?, validityDays?, products?[], required?, active?, sortOrder }` |
| POST | `empresa/catalogos/tipos-documentales/{id}` | Mismos campos salvo `code`. |
| POST | `empresa/catalogos/cursos/{id}` | `{ validityDays, passScore, active?, critical?, mandatory? }` |
| POST | `empresa/catalogos/cursos/{id}/contenido` | `{ title, summary, content: { lessons, quiz } }` (objeto o JSON en texto; nueva versión). |

### Usuarios · `user.manage`

| Método | Ruta | Cuerpo / descripción |
|---|---|---|
| GET | `empresa/usuarios` | `?q&rol&estado=activos\|inactivos\|pendientes\|sin-mfa&pagina`, con sesiones activas por usuario. [`UsuariosResponse`] |
| POST | `empresa/usuarios` | Invitar `{ name, email, role }` |
| POST | `empresa/usuarios/{id}/rol` | `{ role }` (cierra sus sesiones) |
| POST | `empresa/usuarios/{id}/estado` | `{ active: '1'\|'0', reason? }` |
| POST | `empresa/usuarios/{id}/reenviar` | Sin cuerpo. |
| POST | `empresa/usuarios/{id}/mfa` | `{ reason }` — restablece el segundo factor. |
| POST | `empresa/usuarios/sesiones/{sessionId}/cerrar` | Cierra una sesión de un usuario interno. |

### Exportaciones CSV

`/api/empresa/comisiones/csv` y `/api/empresa/auditoria/csv` (fuera de esta API) aceptan el mismo `Bearer`
porque `getSession()` lo lee; las rutas llegan en `csvPath`.

## Pruebas

Verificado end-to-end contra la BD de desarrollo (login real + TOTP) con usuarios `@prueba-empresa.invalid`
(ADMIN, ADVISOR, TREASURY, DOC_ANALYST): todas las lecturas y mutaciones (incluida la carga multipart de PDF y la
descarga firmada), 401 sin token, 404 del ASESOR fuera de alcance, 403 de TESORERÍA al revisar documentos.
Los datos de prueba se borran al final; la bitácora es inmutable y conserva sus eventos.
