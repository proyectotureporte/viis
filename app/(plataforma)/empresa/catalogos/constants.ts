import { PRODUCTS } from '@/lib/labels';

/** Productos seleccionables en un tipo documental (los del catálogo + soportes). */
export const DOC_PRODUCTS: Record<string, string> = { ...PRODUCTS, PAYMENT_SUPPORT: 'Soporte de pago', OTHER: 'Otros' };
export const DOC_PRODUCT_CODES = Object.keys(DOC_PRODUCTS);

export const CATALOG_TABS = [
  { key: 'entidades', label: 'Entidades' },
  { key: 'tasas', label: 'Tasas de referencia' },
  { key: 'parametros', label: 'Parámetros financieros' },
  { key: 'documentos', label: 'Tipos documentales' },
  { key: 'cursos', label: 'Academia' },
] as const;
