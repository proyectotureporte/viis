'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import { faseActual, type Fase } from '@/lib/fase';

/**
 * Los dos componentes que hacen que la página se transforme sola con la fecha.
 *
 * 🔑 AMBOS ARRANCAN EN LA FASE PERMANENTE y solo cambian a `ventana` si el
 * reloj del navegador lo confirma al montar. Esa inversión es a propósito:
 *   · si el JavaScript no corre → se ve la versión permanente, correcta siempre;
 *   · si el build quedó viejo → permanente, correcta;
 *   · dentro de la ventana → aparece la urgencia.
 * Lo contrario —renderizar la urgencia por defecto y quitarla con JS— dejaría
 * una página anunciando un plazo vencido cada vez que algo fallara.
 *
 * El "hoy" se lee en el cliente porque el sitio es un export estático: la
 * fecha del build no sirve para decidir nada.
 */
function useFase(): Fase {
  return useSyncExternalStore(
    () => () => undefined,
    () => faseActual(new Date()),
    () => 'permanente',
  );
}

/** Muestra a sus hijos SOLO mientras la ventana del sismo siga abierta. */
export function SoloEnVentana({ children }: { children: ReactNode }) {
  return useFase() === 'ventana' ? <>{children}</> : null;
}

/** Muestra a sus hijos SOLO cuando la ventana ya cerró. */
export function SoloPermanente({ children }: { children: ReactNode }) {
  return useFase() === 'permanente' ? <>{children}</> : null;
}

/**
 * Elige entre dos textos según la fase. Renderiza el permanente por defecto.
 */
export function TextoFase({ ventana, permanente }: { ventana: string; permanente: string }) {
  return <>{useFase() === 'ventana' ? ventana : permanente}</>;
}
