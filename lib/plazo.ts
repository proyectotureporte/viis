/**
 * El plazo para avisar el siniestro del seguro de terremoto.
 *
 * Es el dato más importante de la página —hay plata real detrás y una fecha
 * que se vence— así que la aritmética vive acá, aislada y con pruebas, en vez
 * de dentro del componente donde nadie la puede verificar.
 *
 * 🔴 `estadoDelPlazo` recibe el "hoy" como PARÁMETRO. Eso es lo que permite
 * probarla contra fechas futuras, y es también lo que obliga a que el
 * componente la llame en el cliente al montar: en un export estático, hornear
 * la fecha en el build haría que la página siguiera anunciando los días que
 * faltaban el día que se compiló.
 */

const MS_POR_DIA = 86_400_000;

/** 10 de agosto de 2026: el sismo. */
export const SISMO = new Date(2026, 7, 10);

/** ~8 de noviembre de 2026: 90 días para avisar el siniestro. */
export const VENCE_AVISO = new Date(2026, 10, 8);

export const TOTAL_DIAS_AVISO = Math.round(
  (VENCE_AVISO.getTime() - SISMO.getTime()) / MS_POR_DIA,
);

export interface EstadoPlazo {
  /** Días que faltan. Cero o negativo cuando ya pasó. */
  diasRestantes: number;
  /** Porcentaje de la ventana ya consumido, acotado a 0–100. */
  avance: number;
  vencido: boolean;
}

/**
 * Lleva una fecha a la medianoche de su propio día.
 *
 * 🔑 Sin esto el contador MIENTE según la hora: comparando instantes crudos,
 * el mismo 4 de septiembre decía "65 días" a las 9 de la mañana y "64" a las
 * 11 de la noche. Lo que la persona cuenta son días de calendario, no
 * fracciones, así que ambos extremos se normalizan antes de restar.
 */
function aMedianoche(fecha: Date): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
}

export function estadoDelPlazo(hoy: Date): EstadoPlazo {
  const diasRestantes = Math.round(
    (aMedianoche(VENCE_AVISO).getTime() - aMedianoche(hoy).getTime()) / MS_POR_DIA,
  );
  const consumidos = TOTAL_DIAS_AVISO - diasRestantes;
  const avance = Math.min(100, Math.max(0, (consumidos / TOTAL_DIAS_AVISO) * 100));
  return { diasRestantes, avance, vencido: diasRestantes <= 0 };
}
