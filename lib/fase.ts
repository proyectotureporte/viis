import { VENCE_AVISO } from './plazo';

/**
 * La página tiene dos fases y la FECHA decide cuál se ve.
 *
 *  - `ventana`     hasta el 8-nov-2026: abre con el sismo, el reloj del seguro
 *                  y la franja del plazo.
 *  - `permanente`  desde el 8-nov: abre con el mensaje del crédito de vivienda
 *                  y el reloj del seguro sale de la lista. Los otros tres no
 *                  tienen fecha de cierre publicada, así que se quedan.
 *
 * 🔑 LA INVERSIÓN DE RIESGO, que es lo que hace que esto sea seguro: el HTML
 * pre-renderizado lleva la fase PERMANENTE, y el JavaScript solo AGREGA la
 * urgencia cuando la fecha la confirma. Por eso:
 *   · si el JS falla → se ve la versión permanente, que es correcta siempre;
 *   · si el build quedó viejo (compilado en septiembre, visto en diciembre)
 *     → permanente, correcta;
 *   · dentro de la ventana → aparece la urgencia.
 * El modo por defecto es el único que no puede mentir.
 *
 * Solo 3 de 16 bloques de la página dependen de la fecha. El resto —la
 * calculadora, qué hacemos, las palancas legales, el dictamen, la
 * credibilidad, la transparencia— sirve igual dentro y fuera de la ventana.
 */

export type Fase = 'ventana' | 'permanente';

/** El fin de la ventana es el mismo plazo del seguro: no son dos fechas que mantener. */
export const FIN_VENTANA = VENCE_AVISO;

export function faseActual(hoy: Date): Fase {
  const hoyMedianoche = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const finMedianoche = new Date(
    FIN_VENTANA.getFullYear(),
    FIN_VENTANA.getMonth(),
    FIN_VENTANA.getDate(),
  );
  return hoyMedianoche.getTime() < finMedianoche.getTime() ? 'ventana' : 'permanente';
}
