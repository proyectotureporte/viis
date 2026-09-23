/**
 * Motor financiero de OpenV. Módulo puro: sin Prisma, Next ni red.
 * Nota: `hash` usa node:crypto; desde componentes de cliente importe los
 * submódulos (p. ej. '@/lib/finance/amortization') en lugar de este índice.
 */
export * from './version';
export * from './types';
export * from './dates';
export * from './rates';
export * from './amortization';
export * from './simulators';
export * from './nextBestAction';
export * from './hash';
