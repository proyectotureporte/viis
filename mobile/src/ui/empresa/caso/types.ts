import type { CasoResponse } from '@/lib/movil/contract-empresa';
import type { ActionResult } from '@/services/api';

/** Contexto que reciben las pestañas del expediente. */
export interface CasoCtx {
  d: CasoResponse;
  /** POST relativo al caso (`''` = raíz del caso); recarga el expediente si sale bien. */
  act(sub: string, body?: Record<string, unknown> | FormData): Promise<ActionResult>;
  pending: boolean;
  /** Muestra un mensaje local (p. ej. error al abrir un documento). */
  notify(result: { ok: boolean; message: string }): void;
}
