import type { DatosContacto } from '@/lib/contacto';
import type { Momento, Palanca, Reloj } from '@/lib/types';

/**
 * Fecha de corte de TODOS los datos de mercado de esta página. Se muestra en
 * pantalla. Actualizarla cada vez que se toque una cifra de mercado.
 */
export const FECHA_CORTE = '4 de septiembre de 2026';

/** Tasa de mercado de referencia: promedio ponderado SFC, corte 10-jul-2026. */
export const TASA_MERCADO = 0.1458;
export const TASA_OFERTA = 0.08;

export const marca = {
  nombre: 'OpenV',
  eslogan: 'Del lado de quien paga la casa',
} as const;

/**
 * PENDIENTE: OpenV no tiene celular todavía (Santiago, 2026-09-04).
 * Mientras `whatsapp` esté vacío, todos los CTA caen a correo con el mismo
 * mensaje. Para activar WhatsApp: poner el número internacional sin signos,
 * p. ej. '573151322640'. Una línea, y toda la página cambia de canal.
 */
export const contacto: DatosContacto = {
  whatsapp: '',
  correo: 'gerencia@viis.app',
};

export const navLinks = [
  { href: '/#relojes', label: 'Los plazos' },
  { href: '/#calculadora', label: 'Calculadora' },
  { href: '/#antes-de-firmar', label: 'Antes de firmar' },
  { href: '/#transparencia', label: 'Transparencia' },
] as const;

/**
 * 2026-09-04, segunda vuelta. Santiago vio la primera versión y dijo: "lo
 * siento sin alma y deshumanizante porque dice lo del sismo sin dolor".
 * Tenía razón y el error era estructural: la página abría hablando de tasas
 * a alguien que quizás no duerme en su casa, y el eyebrow ("Sismo del 10 de
 * agosto · vivienda") era una etiqueta de archivador.
 *
 * La idea que ordena todo el copy nuevo: SIGUES PAGANDO COMPLETO POR UNA
 * CASA EN LA QUE YA NO DUERMES IGUAL. Esa es la injusticia concreta, y es
 * lo que nadie está diciendo.
 */
export const hero = {
  eyebrow: 'Después del sismo del 10 de agosto',
  titularParte1: 'Tu casa cambió el 10 de agosto.',
  titularParte2: 'Tu cuota no.',
  /**
   * La primera frase dice QUIÉNES SOMOS. Se perdió al reescribir el hero en la
   * segunda vuelta y la revisión como cliente la echó de menos: a un público
   * que tiene miedo de que sea otra estafa, una página que nunca se presenta
   * le deja el hueco de confianza abierto. Solo profesión y alcance — nada de
   * años de experiencia ni número de casos, que no están verificados.
   *
   * OJO: decía "en Cali" y Santiago lo corrigió el 4-sep. No es solo Cali:
   * hay casos en Armenia, Popayán, Cartago, Puerto López y Bucaramanga, y el
   * sismo se declaró desastre de carácter NACIONAL (Decreto 1171).
   */
  bajada:
    'Somos peritos financieros y abogados, y atendemos casos en todo el país. No te vamos a decir que esto se resuelve de un día para otro: te vamos a decir qué puedes reclamar de verdad, qué llevas años pagando sin que nadie te lo explicara, y cuánto tiempo te queda para hacerlo.',
  preguntaSelector: 'Empieza por lo que te pasó',
  nota: 'Escribes una vez y te contestamos. Sin compromiso.',
} as const;

/**
 * El plazo del seguro, arriba y en tono de REGALO.
 *
 * Sale de dos hallazgos de la revisión como cliente que resultaron ser el
 * mismo problema: (a) el plazo de 90 días estaba enterrado en la tercera
 * sección siendo lo más urgente y lo más generoso de la página, y (b) pasar
 * de "sabemos cómo estás" directo a un recuadro rojo se leía como que la
 * empatía era la antesala de la presión.
 *
 * La solución no es subir la alarma: es subir la NOTICIA BUENA. Aparece
 * temprano y dice "ya lo pagaste, ve por él" en azul sereno, no en rojo.
 */
export const avisoSeguro = {
  texto:
    'Si tu casa se afectó: dentro de tu cuota vienes pagando un seguro de terremoto desde que firmaste. Puedes reclamarlo, y hay plazo.',
  enlaceTexto: 'Ver hasta cuándo',
} as const;

/**
 * El único momento deliberadamente cálido de la página, y va ANTES de pedir
 * nada — mismo patrón que la sección "Reconocimiento" que Santiago diseñó
 * para ARREGLA a partir del mapa de empatía.
 *
 * Regla que se respeta acá: empatía que DA, no empatía que extrae. Se valida
 * lo que la persona siente y de inmediato se le entrega algo útil; el dolor
 * nunca se usa como palanca de presión para que compre.
 */
export const reconocimiento = {
  eyebrow: 'Antes de hablar de plata',
  titulo: 'Sabemos más o menos cómo estás',
  puntos: [
    'Que nadie te haya dado una respuesta clara sobre si tu casa es segura.',
    'Que sigas pagando la cuota completa por una casa en la que ya no duermes igual.',
    'Que oigas en las noticias que hay créditos al 8% y a ti no te haya llamado nadie.',
    'Que estés cansado de que cada oficina te mande a otra oficina.',
  ],
  cierre:
    'Nada de eso es exageración tuya. Y no todo depende de que alguien te haga un favor: hay cosas que ya son tuyas y solo hay que reclamarlas a tiempo.',
} as const;

export const momentos: readonly Momento[] = [
  {
    id: 'sismo',
    titulo: 'Mi casa quedó afectada',
    resumen: 'Hay algo que ya venías pagando y que puedes reclamar. Tiene fecha.',
    mensaje: 'Hola, mi casa quedó afectada con el sismo y quiero saber qué puedo reclamar.',
    icono: 'sismo',
  },
  {
    id: 'comprar',
    titulo: 'Necesito comprar o reponer vivienda',
    resumen: 'Aquí el 8% sí aplica de frente. Lo que hay que mirar bien son las condiciones.',
    mensaje: 'Hola, necesito comprar o reponer vivienda y quiero saber a qué tasa puedo aspirar.',
    icono: 'comprar',
  },
  {
    id: 'credito',
    titulo: 'Ya tengo un crédito y me preocupa',
    resumen: 'El 8% se pensó para créditos nuevos. Pero tú tienes otras cuatro cartas.',
    mensaje: 'Hola, ya tengo un crédito hipotecario y quiero saber si puedo mejorar mis condiciones.',
    icono: 'credito',
  },
  {
    id: 'cuota',
    titulo: 'Se me está volviendo imposible pagar',
    resumen: 'No es falta de ganas y no eres el único. La norma exige que exista una salida.',
    mensaje: 'Hola, se me está haciendo imposible pagar la cuota de mi crédito de vivienda.',
    icono: 'cuota',
  },
  {
    id: 'cobros',
    titulo: 'Siento que me están cobrando de más',
    resumen: 'Recalculamos tu crédito desde cero y lo comparamos con lo que firmaste.',
    mensaje: 'Hola, creo que mi banco me está cobrando de más en mi crédito de vivienda.',
    icono: 'cobros',
  },
];

/**
 * 2026-09-04: esta sección se llamaba "Cuatro relojes ya empezaron a correr"
 * y pintaba cuatro cuentas regresivas en rojo. A alguien que ya está
 * aterrado eso es una máquina de ansiedad, no información. Se reencuadra:
 * son cosas que están A FAVOR de la persona y que tienen fecha — no
 * amenazas. La urgencia sigue siendo real, pero se comunica como quien
 * avisa, no como quien cobra.
 */
export const relojes = {
  eyebrow: 'Lo que nadie te está contando',
  titulo: 'Cuatro cosas están de tu lado. Tres tienen fecha.',
  bajada:
    'No son amenazas. Son derechos y ventanas que existen hoy y no van a existir siempre, y nadie te va a llamar a recordártelas.',
  items: [
    {
      id: 'seguro',
      titulo: 'El seguro de terremoto que llevas años pagando',
      fecha: 'Se avisa hasta ~8 de noviembre de 2026',
      resumen:
        'Ya lo pagaste: va dentro de tu cuota desde que firmaste. Tienes 90 días para avisar el siniestro.',
      detalle:
        'Va dentro de tu cuota, mes a mes, desde que firmaste — y es obligatorio por el artículo 17 de la Ley 546. O sea que ya lo pagaste. Tienes 90 días desde el sismo para avisar el siniestro. Por ejemplo, en el Fondo Nacional del Ahorro la cobertura llega hasta el 100% sin deducible, con anticipo del 50% y auxilio de arriendo de $2.200.000 mensuales por 3 meses. Es lo más valioso que tienes en la mano y casi nadie lo está usando.',
      urgente: true,
    },
    {
      id: 'rud',
      titulo: 'Estar inscrito en el RUD',
      fecha: 'Abierto, sin fecha de cierre publicada',
      resumen:
        'Reportar por WhatsApp no es estar censado. Son cuatro etapas distintas y nadie te inscribe solo.',
      detalle:
        'Reportar por WhatsApp a la alcaldía no es estar censado. Son cuatro etapas distintas: reporte, censo, valoración técnica y Registro Único de Damnificados. El RUD es el paso legal indispensable y el ciudadano no se inscribe solo.',
      urgente: false,
    },
    {
      id: 'tasa',
      titulo: 'La ventana del 8%',
      fecha: 'Sin fecha de cierre publicada',
      resumen:
        'Es un acuerdo entre el Gobierno y el sector, no una norma. Puede cerrarse cuando quieran.',
      detalle:
        'Es un acuerdo privado entre el Gobierno, la banca y Camacol anunciado el 23–24 de agosto, no una norma. No hay norma que obligue a mantenerlo abierto, así que conviene moverse mientras esté.',
      urgente: false,
    },
    {
      id: 'subsidio',
      titulo: 'Segunda postulación al subsidio de vivienda',
      fecha: 'Ley 2597 del 9 de julio de 2026',
      resumen:
        'Si perdiste la vivienda por el desastre, puedes volver a postularte al subsidio familiar.',
      detalle:
        'Permite volver a postularse al Subsidio Familiar de Vivienda cuando la vivienda se pierde por un desastre acreditado. Se sancionó un mes antes del sismo y casi nadie la conoce.',
      urgente: false,
    },
  ] as readonly Reloj[],
} as const;

export const calculadora = {
  eyebrow: 'Calculadora',
  titulo: '¿Cuánto cambia tu cuota?',
  bajada:
    'Corre los números con tu propio crédito. Es una estimación con sistema francés de cuota fija, no una oferta.',
  supuestos:
    'Sistema francés, cuota fija. Tasa de mercado de referencia: 14,58% E.A., promedio ponderado de la Superintendencia Financiera con corte al 10 de julio de 2026. Comparada contra 8,0% E.A.',
  /** Contradice a la prensa a propósito: es parte del posicionamiento. */
  notaPrensa:
    'Vas a leer titulares de "más de 30%". A 15 años no se cumple: la reducción real es del 28,3%. Preferimos que el número te lo digamos bien nosotros.',
  cta: 'Quiero que revisen mi caso',
} as const;

export const palancasComprar = {
  titulo: 'Vas a comprar o a reponer vivienda',
  bajada:
    'Aquí el 8% sí aplica de frente, porque es un desembolso nuevo. Lo que cambia es cuál banco y con qué condiciones.',
  puntos: [
    'Comparamos las ofertas vigentes con tus números, no con el titular de prensa.',
    'Revisamos las condiciones contigo antes de que firmes: plazos, avalúo, estudio de títulos, entrega del inmueble.',
    'Si eres damnificado acreditado, cruzamos la tasa con el subsidio y con el seguro.',
  ],
} as const;

export const palancasCredito = {
  titulo: 'Ya tienes crédito hipotecario',
  bajada:
    'No te vamos a prometer que te pasan al 8%: ese acuerdo se diseñó para desembolsos nuevos. Estas cuatro sí las tienes tú.',
  items: [
    {
      numero: 1,
      titulo: 'El seguro de terremoto que ya pagas',
      descripcion:
        'Va dentro de tu cuota y es obligatorio. Si tu vivienda se afectó, hay una indemnización que reclamar y un reloj de 90 días corriendo.',
      fundamento: 'Ley 546 de 1999, art. 17',
    },
    {
      numero: 2,
      titulo: 'Tu tasa solo se puede mover hacia abajo',
      descripcion:
        'La ley dice que la tasa es fija toda la vigencia del crédito, salvo que las partes acuerden reducirla. Una vez bajada, no se puede volver a subir. Por eso pedir una reducción siempre es una conversación que se puede dar.',
      fundamento: 'Ley 546 de 1999, art. 17 num. 2',
    },
    {
      numero: 3,
      titulo: 'Hay programas de refinanciación que la norma exige',
      descripcion:
        'La circular obliga a las entidades a tener programas de refinanciación por el desastre y protege tu reporte a centrales 12 meses. Las tasas especiales las deja como facultad: esa es la diferencia entre lo exigible y lo anunciado, y conviene saberla antes de pedir.',
      fundamento:
        'Circular Externa 007 del 26-ago-2026 de la Superfinanciera, por el Decreto 1171 del 11-ago-2026',
    },
    {
      numero: 4,
      titulo: 'Puedes volver a postularte al subsidio',
      descripcion:
        'Si perdiste la vivienda por el desastre y lo acreditas, la ley permite una segunda postulación al Subsidio Familiar de Vivienda.',
      fundamento: 'Ley 2597 del 9 de julio de 2026',
    },
  ] as readonly Palanca[],
} as const;

/**
 * 2026-09-04, segunda vuelta. Acá había una matriz "banco por banco" que
 * nombraba a cada entidad con su letra chica al lado. Santiago la mandó
 * quitar: "no expongas a los bancos".
 *
 * Y tiene razón de negocio, no solo de tono: las entidades financieras son
 * la contraparte comercial de OpenV en la colocación de crédito.
 * Publicar una tabla señalándolas quema la relación que sostiene la meta.
 *
 * El valor NO se pierde: la letra chica sigue siendo lo útil, pero ahora se
 * entrega como "qué revisar en cualquier oferta", sin nombrar a nadie. Y la
 * comparación pasa a ser nuestro servicio en vez de una denuncia pública.
 */
export const antesDeFirmar = {
  eyebrow: 'Antes de firmar',
  titulo: 'Las ofertas no son iguales, y cambian casi cada semana',
  bajada: `El 8% no viene solo: viene con condiciones que cambian mucho de una entidad a otra y que se mueven todo el tiempo. Estas son las que más mueven el resultado final. Corte al ${FECHA_CORTE}.`,
  items: [
    'El plazo máximo al que te sostienen esa tasa.',
    'Si aplica a comprar, a reponer la vivienda afectada, o a las dos cosas.',
    'Quién asume el avalúo y el estudio de títulos.',
    'Si hay tope de monto, y cuál es.',
    'Si te piden plazos para entregar o escriturar el inmueble.',
    'Si está limitado a vivienda de interés social.',
    'Cómo se cruza con tu seguro y con el subsidio al que puedes postularte.',
  ],
  cierre:
    'Nosotros comparamos las ofertas vigentes con tus números el día que las necesites, y te explicamos cada condición antes de que firmes. Eso sí: tal como está diseñado, el programa apunta a desembolsos nuevos — si ya tienes crédito, tu camino son las cuatro palancas de arriba.',
} as const;

export const dictamen = {
  eyebrow: 'El hueco que nadie te explica',
  titulo: 'El sticker de tu edificio no es un dictamen',
  cuerpo:
    'Los stickers verde, amarillo y rojo salen del protocolo ATC-20, que es una inspección visual rápida. La propia Alcaldía advierte que "pueden existir signos no detectados a simple vista" y que no constituye valoración técnica especializada, ni informe estructural, ni orden de demolición.',
  cierre:
    'Entre ese sticker y lo que te van a exigir un banco, una aseguradora o una segunda postulación al subsidio hay un vacío que solo llena el dictamen de un ingeniero. Eso lo hacemos nosotros.',
  cta: 'Necesito un dictamen técnico',
  mensaje: 'Hola, necesito un dictamen técnico sobre el estado de mi vivienda tras el sismo.',
} as const;

export const porQueExistimos = {
  eyebrow: 'Por qué existimos',
  titulo: 'Hasta el desembolso están todos. Después quedas solo.',
  cuerpo:
    'Cuando compras vivienda te acompañan la constructora, el banco, la aseguradora y la fiduciaria. El día que entregan el dinero, todos se van y quedas solo con una deuda de 15 o 20 años que nadie te ayuda a entender, verificar ni mejorar.',
  cuerpoDos:
    'El sismo del 10 de agosto no creó ese abandono: solo lo hizo visible de golpe, y todos al tiempo. Por eso tanta gente descubrió esta semana que llevaba años pagando un seguro que no sabía que tenía.',
  cierre:
    'OpenV existe para esa etapa: del lado de quien paga la casa, de principio a fin.',
} as const;

export const transparencia = {
  eyebrow: 'Transparencia',
  titulo: 'Esto lo decimos siempre, no solo cuando preguntas',
  puntos: [
    'No prometemos bajarte al 8%. Es un acuerdo entre el Gobierno y el sector, y cada entidad define a quién y cómo. Lo que sí hacemos es acompañarte en las palancas que sí son exigibles.',
    'No somos la Superintendencia Financiera ni hablamos en su nombre.',
    'El censo y el Registro Único de Damnificados los tramita la alcaldía. Te acompañamos, no los reemplazamos.',
    /*
     * El precio. La revisión como cliente lo marcó como el silencio más caro
     * de la página: es la primera pregunta de cualquiera, y no responderla
     * genera justo la sospecha que esta sección intenta desactivar. Santiago
     * definió la regla el 4-sep: no se da un número por anticipado, se da el
     * orden — primero revisar, después el alcance y el valor por escrito.
     */
    'No te damos un precio antes de conocer tu caso. Primero lo revisamos, después te decimos por escrito qué se puede hacer y cuánto vale, y ahí decides. Nunca al revés.',
  ],
} as const;

export const empresas = {
  eyebrow: 'Empresas y colegios',
  titulo: 'Una charla de 20 minutos que le ahorra millones a tu gente',
  cuerpo:
    'Llevamos la charla de financiación de vivienda a reuniones de entrega de boletines, comités de seguridad y salud en el trabajo o espacios de bienestar. Explicamos en lenguaje claro qué se puede exigir tras el sismo y cómo leer un crédito hipotecario.',
  cta: 'Quiero la charla en mi empresa',
  mensaje: 'Hola, quiero coordinar la charla de financiación de vivienda para mi empresa o colegio.',
} as const;

export const ctaFinal = {
  titulo: 'Cuéntanos qué te pasó',
  bajada:
    'No necesitas tener los papeles en orden ni saber términos técnicos. Con que nos cuentes tu situación en dos líneas, arrancamos.',
  cta: 'Hablemos hoy',
  mensaje: 'Hola, quiero que revisen mi situación de vivienda.',
} as const;

/** Mensaje del botón del header y de cualquier CTA genérico. */
export const MENSAJE_GENERICO = 'Hola, quiero que revisen mi situación de vivienda.';

export const pie = {
  descripcion:
    'Peritos financieros y abogados. Atendemos casos en todo el país. OpenV acompaña al deudor en la etapa que nadie cubre: después del desembolso.',
  aviso: `La información de esta página es orientativa y tiene corte al ${FECHA_CORTE}. No constituye asesoría jurídica ni financiera individual, ni una oferta de crédito. Las condiciones de cada banco cambian sin previo aviso.`,
} as const;

/**
 * QUÉ HACEMOS, en concreto.
 *
 * 2026-09-04, quinta vuelta. Santiago: "investiga biennnnnn, infórmate de todo
 * lo que hace OpenV, genérale confianza a nuestros clientes".
 *
 * Tenía razón en que la página no generaba confianza, y la causa era que
 * NUNCA DECÍA QUÉ HACE la empresa. Solo "te decimos qué puedes reclamar", que
 * es vago — y lo vago es exactamente lo que un público con miedo a la estafa
 * lee como humo. La confianza no se declara: se produce siendo específico.
 *
 * Esto sale de la reunión del 3-sep, donde se revisaron los créditos vivos
 * uno por uno: se presenta el caso a varias entidades a la vez, se maneja el
 * trámite completo (seguros, pólizas, pagaré, avalúo) y se acompaña después.
 */
export const queHacemos = {
  eyebrow: 'Qué hacemos',
  titulo: 'Esto es exactamente lo que hacemos por ti',
  bajada:
    'Sin humo. Estas son las cinco cosas concretas, y en todas trabajamos para ti, no para quien presta.',
  items: [
    {
      numero: 1,
      titulo: 'Presentamos tu caso a varias entidades a la vez',
      descripcion:
        'No te mandamos a una sola puerta. Armamos tu carpeta, la presentamos donde tenga sentido y tú te quedas con la oferta que más te convenga.',
    },
    {
      numero: 2,
      titulo: 'Nos encargamos del trámite completo',
      descripcion:
        'Seguros, pólizas, pagaré, avalúo, estudio de títulos y el papeleo que se atraviese. Es la parte que hace que la gente se rinda a mitad de camino.',
    },
    {
      numero: 3,
      titulo: 'Revisamos el crédito que ya tienes',
      descripcion:
        'Reconstruimos tu tabla de amortización desde cero y la comparamos contra lo que firmaste. Si hay cobros que no cuadran, aparecen ahí.',
    },
    {
      numero: 4,
      titulo: 'Te acompañamos después del desembolso',
      descripcion:
        'La etapa que nadie cubre. Cuándo conviene abonar a capital, qué pasa si sube el UVR, cuándo vale la pena renegociar y cuándo no.',
    },
    {
      numero: 5,
      titulo: 'Llevamos la charla a tu empresa o colegio',
      descripcion:
        'Veinte minutos en lenguaje claro sobre cómo se lee un crédito de vivienda y qué se puede exigir después del sismo.',
    },
  ],
} as const;

/**
 * POR QUÉ SABEMOS DE ESTO — el ancla de credibilidad.
 *
 * Santiago pidió generar confianza y la respuesta no era inventar sellos ni
 * testimonios: era MOSTRAR LA PROFUNDIDAD QUE YA EXISTE. OpenV es el
 * artefacto tecnológico de una tesis doctoral en curso sobre exactamente
 * este problema, y detrás hay cifras con fuente citada.
 *
 * Regla: cada número lleva su fuente en pantalla. Un dato sin fuente en una
 * página que pide confianza vale menos que no ponerlo.
 */
export const porQueSabemos = {
  eyebrow: 'Por qué sabemos de esto',
  titulo: 'No es una corazonada nuestra. Es el resultado de una investigación universitaria.',
  cuerpo:
    'OpenV nació de un proyecto de investigación universitaria sobre la etapa post-desembolso del crédito de vivienda, que se desarrolla en la Universidad de los Andes. Estas son algunas de las cifras que lo sustentan.',
  cifras: [
    {
      dato: '131 puntos',
      texto: 'por debajo está la satisfacción con el servicio DESPUÉS del desembolso, frente al momento en que te venden el crédito.',
      fuente: 'J.D. Power, U.S. Mortgage Servicer Satisfaction 2025',
    },
    {
      dato: '17% → 30%',
      texto: 'creció en cuatro años la proporción de deudores que creen estar en riesgo de perder su vivienda.',
      fuente: 'J.D. Power 2025',
    },
    {
      dato: '~50%',
      texto: 'de quienes enfrentan perder su casa cumplen criterios clínicos de depresión.',
      fuente: 'Yale School of Public Health',
    },
    {
      dato: '5% y 50%',
      texto: 'en el estudio de Polonia: solo el 5% estaba en mora, pero el 50% decía estar pasándola mal, haciendo sacrificios extremos para pagar. La mora no mide el sufrimiento.',
      fuente: 'Citado en la investigación',
    },
  ],
  cierre:
    'Por eso no te hablamos solo de tasas. La cuota que puedes sostener sin dejar de comer bien es un dato tan importante como la tasa que te dan.',
} as const;

/**
 * El estándar de carga habitacional. Es un criterio documentado (HUD), no una
 * invención nuestra: pasar del 30% del ingreso del hogar en vivienda es
 * sobrecarga, y del 50% es sobrecarga severa. Se muestra junto a la
 * calculadora porque es la pregunta que el banco NO te hace.
 */
export const cargaHabitacional = {
  titulo: '¿Y esa cuota la puedes sostener?',
  cuerpo:
    'Hay un criterio internacional para responderlo: si la cuota de vivienda se lleva más del 30% del ingreso de tu hogar, hay sobrecarga; pasado el 50%, la sobrecarga es severa. Es la pregunta que casi nadie te hace antes de firmar.',
  fuente: 'Estándar de carga habitacional 30/50 (HUD)',
  etiquetaIngreso: 'Ingreso mensual de tu hogar',
} as const;

/**
 * LA VERSIÓN PERMANENTE de los tres bloques que están amarrados al sismo.
 *
 * Auditando el contenido, 11 de 16 bloques ya sirven igual dentro y fuera de
 * la ventana. Solo el hero, el reconocimiento y la franja del seguro
 * envejecen — así que solo ellos necesitan una segunda redacción.
 *
 * Cuando pase el 8-nov, la página abre con esto en vez de con el sismo, y el
 * reloj del seguro sale de la lista. Los otros tres relojes (RUD, ventana del
 * 8% y Ley 2597) no tienen fecha de cierre publicada, así que se quedan.
 *
 * El centro de gravedad se mueve del damnificado urgente al deudor de
 * vivienda de todo el año, que es el negocio permanente: conseguir el crédito,
 * revisar el que ya se tiene y acompañar después del desembolso.
 */
export const heroPermanente = {
  eyebrow: 'Crédito de vivienda en Colombia',
  titularParte1: 'Firmaste una deuda de 20 años.',
  titularParte2: 'Y después te dejaron solo.',
  bajada:
    'Somos peritos financieros y abogados, y atendemos casos en todo el país. Te ayudamos a conseguir el crédito en las mejores condiciones, a revisar el que ya tienes, y a no quedarte solo el resto de la vida del préstamo.',
} as const;

export const reconocimientoPermanente = {
  titulo: 'Sabemos más o menos cómo estás',
  puntos: [
    'Que firmaste sin entender del todo cómo se compone tu cuota.',
    'Que no sepas si te están cobrando lo que corresponde.',
    'Que te dé pereza pelear con el banco porque siempre ganan ellos.',
    'Que estés cansado de que cada oficina te mande a otra oficina.',
  ],
  cierre:
    'Nada de eso es exageración tuya. Y no todo depende de que alguien te haga un favor: hay cosas que ya son tuyas y solo hay que reclamarlas.',
} as const;

export const avisoPermanente = {
  texto:
    'Dentro de tu cuota hay un seguro que vienes pagando desde que firmaste, y casi nadie sabe qué cubre. Vale la pena revisarlo.',
  enlaceTexto: 'Ver qué más es tuyo',
} as const;
