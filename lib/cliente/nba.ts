import type { ActionCode } from '@/lib/finance/nextBestAction';

/** A dónde lleva cada próxima mejor acción dentro del portal. */
export const ACTION_LINKS: Record<ActionCode, { href: string; label?: string }> = {
  PONERSE_AL_DIA: { href: '/cliente/gestiones?nueva=HARDSHIP#nueva', label: 'Pedir acompañamiento' },
  COMPLETAR_DATO_INGRESOS: { href: '/cliente/hogar', label: 'Completar ingresos' },
  COMPLETAR_DATO_SALDO: { href: '/cliente/credito', label: 'Registrar saldo' },
  COMPLETAR_DOCUMENTO: { href: '/cliente/documentos', label: 'Subir documento' },
  RUTA_PREVENTIVA: { href: '/cliente/gestiones?nueva=HARDSHIP#nueva', label: 'Abrir Modo Tranquilidad' },
  CONSERVAR_LIQUIDEZ: { href: '/cliente/decidir?sim=STRESS', label: 'Revisar mi colchón' },
  COMPARAR_COMPRA_CARTERA: { href: '/cliente/decidir?sim=PORTFOLIO', label: 'Simular compra de cartera' },
  REVISAR_SEGURO: { href: '/cliente/ayuda#asesor', label: 'Revisar seguros con un asesor' },
  CAMBIAR_FECHA_PAGO: { href: '/cliente/gestiones?nueva=TERM_CHANGE#nueva', label: 'Solicitar cambio' },
  ABONO_CAPITAL: { href: '/cliente/decidir?sim=PREPAYMENT', label: 'Simular abono' },
};
