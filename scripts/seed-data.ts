/**
 * Catálogos base de producción. NO contiene clientes, tasas ni valores
 * ficticios: solo estructura (tipos documentales, entidades y cursos).
 * Las tasas de referencia, reglas de comisión y parámetros UVR los carga
 * Administración con su fuente y fecha.
 */

export const DOCUMENT_TYPES = [
  { code: 'IDENTIDAD', name: 'Documento de identidad', description: 'Cédula por ambas caras, legible y vigente.', validityDays: null, products: [], required: true, sortOrder: 10 },
  { code: 'CERT_LABORAL', name: 'Certificación laboral o de ingresos', description: 'Expedida hace máximo 30 días: cargo, salario, antigüedad y tipo de contrato. Independientes: certificado de contador con tarjeta profesional.', validityDays: 30, products: ['NEW_LOAN', 'PORTFOLIO_PURCHASE', 'TERM_CHANGE'], required: true, sortOrder: 20 },
  { code: 'DESPRENDIBLES', name: 'Desprendibles de nómina (últimos 3 meses)', description: 'O soportes de ingresos de los últimos 3 meses.', validityDays: 60, products: ['NEW_LOAN', 'PORTFOLIO_PURCHASE'], required: true, sortOrder: 30 },
  { code: 'EXTRACTOS', name: 'Extractos bancarios (últimos 3 meses)', description: 'De la cuenta donde recibes tus ingresos.', validityDays: 60, products: ['NEW_LOAN', 'PORTFOLIO_PURCHASE'], required: true, sortOrder: 40 },
  { code: 'CERT_DEUDA', name: 'Certificado de deuda del crédito actual', description: 'Expedido por tu banco hace máximo 30 días, con saldo, tasa, plazo y seguros.', validityDays: 30, products: ['PORTFOLIO_PURCHASE', 'TERM_CHANGE', 'RATE_REVIEW', 'PREPAYMENT_PLAN'], required: true, sortOrder: 50 },
  { code: 'CTL', name: 'Certificado de tradición y libertad', description: 'Del inmueble, expedido hace máximo 30 días.', validityDays: 30, products: ['NEW_LOAN', 'PORTFOLIO_PURCHASE'], required: true, sortOrder: 60 },
  { code: 'PROMESA', name: 'Promesa de compraventa', description: 'Firmada por las partes.', validityDays: null, products: ['NEW_LOAN'], required: true, sortOrder: 70 },
  { code: 'DECLARACION_RENTA', name: 'Declaración de renta', description: 'Último año gravable, si estás obligado a declarar.', validityDays: 400, products: ['NEW_LOAN', 'PORTFOLIO_PURCHASE'], required: false, sortOrder: 80 },
  { code: 'AVALUO', name: 'Avalúo comercial', description: 'Realizado por un avaluador inscrito en el RAA.', validityDays: 365, products: ['NEW_LOAN', 'PORTFOLIO_PURCHASE', 'ADVISORY'], required: false, sortOrder: 90 },
  { code: 'POLIZA', name: 'Póliza de seguros del crédito', description: 'Carátula y condiciones de las pólizas de vida e incendio/terremoto.', validityDays: null, products: ['INSURANCE_CLAIM', 'RATE_REVIEW'], required: true, sortOrder: 100 },
  { code: 'SOPORTE_PAGO', name: 'Soporte de pago', description: 'Comprobante de un pago o abono reportado.', validityDays: null, products: ['PAYMENT_SUPPORT'], required: false, sortOrder: 200 },
  { code: 'OTRO', name: 'Otro documento', description: 'Cualquier soporte adicional solicitado por tu asesor.', validityDays: null, products: ['OTHER'], required: false, sortOrder: 300 },
];

export const ENTITIES = [
  'Bancolombia', 'Davivienda', 'Banco de Bogotá', 'BBVA Colombia', 'Banco Caja Social', 'Banco AV Villas',
  'Banco de Occidente', 'Banco Popular', 'Scotiabank Colpatria', 'Itaú Colombia', 'Fondo Nacional del Ahorro',
  'Banco Agrario de Colombia', 'Banco GNB Sudameris', 'Banco Pichincha', 'Banco Falabella',
];

type Lesson = { title: string; body: string[] };
type Question = { q: string; options: string[]; answer: number };

export const COURSES: Array<{ slug: string; title: string; summary: string; mandatory: boolean; critical: boolean; validityDays: number; passScore: number; sortOrder: number; lessons: Lesson[]; quiz: Question[] }> = [
  {
    slug: 'induccion-conducta',
    title: 'Inducción OpenV: servicio y conducta comercial',
    summary: 'Cómo acompañamos a un hogar con crédito de vivienda sin presionar, sin prometer y con trazabilidad.',
    mandatory: true,
    critical: true,
    validityDays: 365,
    passScore: 80,
    sortOrder: 10,
    lessons: [
      { title: 'El principio rector', body: ['Cada conversación con un cliente debe responder cuatro preguntas: qué tiene, qué significa, qué puede hacer hoy y cuál será el efecto.', 'OpenV no vende deuda: acompaña decisiones patrimoniales. Una simulación nunca es una oferta vinculante; la aprobación, la tasa y las condiciones las define la entidad financiera.'] },
      { title: 'Lo que nunca hacemos', body: ['No prometemos aprobación, tasa ni ahorro. Mostramos rangos, supuestos y la fuente de cada dato.', 'No recomendamos abonos o nuevas deudas que comprometan la liquidez del hogar. Si el cliente no tiene al menos tres cuotas de reserva, la prioridad es conservar liquidez.', 'No pedimos contraseñas, códigos de verificación ni dinero en efectivo. Ningún pago al acreedor pasa por el aliado.'] },
      { title: 'Registro y trazabilidad', body: ['Todo cliente se registra con su autorización de tratamiento de datos. Sin consentimiento no hay expediente.', 'Cada cambio de etapa, documento y comunicación queda en la bitácora del caso. Lo que no está registrado, no ocurrió.', 'El primer aliado que registra a un cliente queda protegido 180 días. Intentar registrar un cliente protegido por otro aliado queda auditado.'] },
    ],
    quiz: [
      { q: 'Un cliente pregunta si su crédito será aprobado. ¿Qué respondes?', options: ['Que sí, porque su perfil es bueno', 'Que la decisión es de la entidad y le explicas qué falta y los tiempos', 'Que depende de cuánto abone'], answer: 1 },
      { q: 'El cliente tiene ahorros equivalentes a una cuota y quiere abonar todo. ¿Qué haces?', options: ['Le recomiendo abonar para ahorrar intereses', 'Le explico la importancia de conservar una reserva antes de abonar', 'No opino'], answer: 1 },
      { q: '¿Qué pasa si no registras el consentimiento del cliente?', options: ['Nada, se registra después', 'No se puede crear el expediente', 'Solo aplica a clientes nuevos'], answer: 1 },
      { q: '¿Puede un aliado recibir dinero del cliente para pagar la cuota?', options: ['Sí, si da recibo', 'No, nunca', 'Solo en efectivo'], answer: 1 },
      { q: '¿Cuánto tiempo queda protegido un cliente para el aliado que lo registró?', options: ['30 días', '180 días', 'Para siempre'], answer: 1 },
    ],
  },
  {
    slug: 'proteccion-datos',
    title: 'Protección de datos personales y habeas data',
    summary: 'Ley 1581 de 2012, Ley 1266 de 2008 y cómo tratar la información financiera de los clientes.',
    mandatory: true,
    critical: true,
    validityDays: 365,
    passScore: 80,
    sortOrder: 20,
    lessons: [
      { title: 'Qué exige la ley', body: ['La Ley 1581 de 2012 exige autorización previa, expresa e informada para tratar datos personales, y que la finalidad sea legítima y comunicada al titular.', 'La Ley 1266 de 2008 (habeas data financiero) regula la consulta y reporte en centrales de información: se requiere autorización específica para consultar.', 'El titular puede conocer, actualizar, rectificar y suprimir sus datos, y revocar la autorización. Las consultas se responden en máximo 10 días hábiles y los reclamos en 15.'] },
      { title: 'Buenas prácticas en campo', body: ['Carga los documentos solo por la plataforma: nunca por WhatsApp, correo personal o memorias USB.', 'No tomes fotos de documentos con la galería del teléfono; usa la captura de la plataforma y verifica que sean legibles.', 'Comparte con la entidad financiera solo si el cliente otorgó esa autorización. La plataforma bloquea la radicación si falta.'] },
      { title: 'Incidentes', body: ['Si pierdes un dispositivo con sesión abierta, cierra las sesiones desde Mi cuenta y avisa de inmediato a cumplimiento.', 'Un incidente de seguridad debe reportarse a la SIC dentro de los 15 días hábiles siguientes a su detección; por eso debes avisar en el mismo día.'] },
    ],
    quiz: [
      { q: '¿Qué autorización necesitas para consultar centrales de riesgo?', options: ['Ninguna', 'La autorización específica de consulta en centrales', 'Basta con la cédula'], answer: 1 },
      { q: 'Un cliente te envía su cédula por WhatsApp. ¿Qué haces?', options: ['La reenvío al analista', 'Le pido que la cargue en la plataforma y borro el mensaje', 'La guardo en mi galería'], answer: 1 },
      { q: '¿En cuánto tiempo máximo se responde una consulta de habeas data?', options: ['10 días hábiles', '30 días', '6 meses'], answer: 0 },
      { q: '¿Qué haces si pierdes tu celular con sesión abierta?', options: ['Espero a que aparezca', 'Cierro las sesiones desde Mi cuenta y aviso a cumplimiento', 'Nada, tiene clave'], answer: 1 },
      { q: '¿Se puede radicar un caso sin la autorización de compartir con entidades?', options: ['Sí', 'No, la plataforma lo bloquea', 'Solo si el cliente lo dice por teléfono'], answer: 1 },
    ],
  },
  {
    slug: 'compra-cartera',
    title: 'Compra de cartera responsable',
    summary: 'Cuándo conviene y cuándo no: ahorro neto, costos y punto de equilibrio.',
    mandatory: false,
    critical: false,
    validityDays: 730,
    passScore: 80,
    sortOrder: 30,
    lessons: [
      { title: 'El ahorro que importa es el neto', body: ['Una tasa más baja no basta. Hay que restar los costos: estudio de crédito, avalúo, gastos notariales, registro y posibles diferencias de seguros.', 'El punto de equilibrio es el mes en que el ahorro acumulado supera los costos. Si el cliente piensa vender antes de ese mes, no conviene.'] },
      { title: 'Plazo y cuota', body: ['Ampliar el plazo baja la cuota pero puede aumentar el costo total. Muestra siempre ambos efectos.', 'La Ley 546 de 1999 permite prepagar créditos de vivienda sin penalidad: el cliente puede abonar a capital en cualquier momento.'] },
      { title: 'Cómo presentarlo', body: ['Usa el simulador de compra de cartera de la plataforma: guarda los supuestos, la fecha y la versión del motor.', 'Presenta la recomendación como "conviene revisar" o "no parece conveniente", nunca como garantía.'] },
    ],
    quiz: [
      { q: '¿Qué define si una compra de cartera conviene?', options: ['La tasa nueva', 'El ahorro neto después de costos y el punto de equilibrio', 'El banco más grande'], answer: 1 },
      { q: 'El cliente venderá en 2 años y el punto de equilibrio es a los 40 meses. ¿Conviene?', options: ['Sí', 'Probablemente no', 'Siempre conviene'], answer: 1 },
      { q: '¿Hay penalidad por prepagar un crédito de vivienda en Colombia?', options: ['Sí, 3%', 'No, la Ley 546 de 1999 lo permite sin penalidad', 'Depende del banco'], answer: 1 },
      { q: 'Ampliar el plazo…', options: ['Siempre ahorra', 'Baja la cuota pero puede subir el costo total', 'No cambia nada'], answer: 1 },
      { q: '¿Cómo presentas la recomendación?', options: ['Como garantía de ahorro', 'Como análisis con supuestos, sin prometer', 'Solo verbalmente'], answer: 1 },
    ],
  },
  {
    slug: 'pesos-vs-uvr',
    title: 'Tasa fija en pesos frente a UVR',
    summary: 'Explicar la UVR en pesos, tiempo y riesgo, sin tecnicismos.',
    mandatory: false,
    critical: false,
    validityDays: 730,
    passScore: 80,
    sortOrder: 40,
    lessons: [
      { title: 'Qué es la UVR', body: ['La UVR (Unidad de Valor Real) se ajusta diariamente con la inflación; la certifica el Banco de la República.', 'En un crédito en UVR la deuda se expresa en UVR: la cuota en pesos arranca más baja pero sube con la inflación, y el saldo en pesos puede crecer los primeros años.'] },
      { title: 'Cómo compararlos', body: ['Compara siempre con varios escenarios de inflación: nunca con una sola cifra.', 'Pregunta al cliente cómo espera que crezcan sus ingresos: si crecen con la inflación, la UVR puede ser manejable; si no, la cuota fija da certeza.'] },
    ],
    quiz: [
      { q: 'En un crédito UVR, la cuota en pesos…', options: ['Nunca cambia', 'Tiende a subir con la inflación', 'Baja cada mes'], answer: 1 },
      { q: '¿Quién certifica la UVR?', options: ['Cada banco', 'El Banco de la República', 'La DIAN'], answer: 1 },
      { q: '¿Cómo se compara pesos vs UVR correctamente?', options: ['Con un solo escenario', 'Con varios escenarios de inflación', 'Solo por la cuota inicial'], answer: 1 },
      { q: 'El saldo en pesos de un crédito UVR en los primeros años…', options: ['Siempre baja', 'Puede crecer', 'Es igual al de pesos'], answer: 1 },
      { q: 'Para un hogar con ingresos fijos que no suben con inflación, suele dar más certeza…', options: ['La cuota fija en pesos', 'La UVR', 'Da igual'], answer: 0 },
    ],
  },
];
