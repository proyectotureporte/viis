import { ENGINE_VERSION } from '@/lib/finance/version';

export const dynamic = 'force-dynamic';

/** Descubrimiento de la API pública v1. */
export function GET(): Response {
  return Response.json(
    {
      api: 'openv',
      version: 'v1',
      engineVersion: ENGINE_VERSION,
      endpoints: {
        'POST /api/v1/simulaciones/cuota': 'Cuota e ingreso requerido: principal, rateEa, termMonths, monthlyInsurance?, system',
        'POST /api/v1/simulaciones/estres': 'Capacidad ante choque: monthlyIncome, monthlyExpenses, payment, savings, incomeDropPct, newExpense',
        'POST /api/v1/simulaciones/arriendo-vs-compra': 'Comprar o seguir arrendando',
        'POST /api/v1/simulaciones/venta': 'Venta del inmueble: price, loanBalance, saleCostsPct, taxesEstimate',
        'POST /api/v1/simulaciones/fija-vs-uvr': 'principal, termMonths, rateFixedEa, rateUvrEa, inflationScenarios[]',
      },
      note: 'Tasas y porcentajes como fracción (0.12 = 12 %). Resultados ilustrativos, no vinculantes.',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
