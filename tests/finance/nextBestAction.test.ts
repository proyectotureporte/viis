import { describe, expect, it } from 'vitest';
import { nextBestActions, type LoanState } from '@/lib/finance';

const loan: LoanState = {
  principal: 200_000_000,
  rateEa: 0.14,
  termMonths: 240,
  system: 'FIXED_PESOS',
  startDate: '2022-03-10',
  monthlyInsurance: 60_000,
  balance: 180_000_000,
  remainingMonths: 190,
  asOf: '2026-09-10',
};

describe('nextBestActions', () => {
  it('sin ingresos NO recomienda abono y pide el dato primero', () => {
    const acciones = nextBestActions({
      loanState: loan,
      household: { savings: 500_000_000 },
      missing: [],
      paymentsOverdue: false,
    });
    const codes = acciones.map((a) => a.code);
    expect(codes).not.toContain('ABONO_CAPITAL');
    expect(codes).toContain('COMPLETAR_DATO_INGRESOS');
  });

  it('sin saldo NO recomienda abono', () => {
    const acciones = nextBestActions({
      loanState: { ...loan, balance: 0 },
      household: { income: 20_000_000, expenses: 5_000_000, savings: 500_000_000 },
      missing: [],
      paymentsOverdue: false,
    });
    expect(acciones.map((a) => a.code)).not.toContain('ABONO_CAPITAL');
    expect(acciones.map((a) => a.code)).toContain('COMPLETAR_DATO_SALDO');
  });

  it('con ahorro menor a 3 cuotas prioriza conservar liquidez, no abonar', () => {
    const acciones = nextBestActions({
      loanState: loan,
      household: { income: 15_000_000, expenses: 5_000_000, savings: 1_000_000 },
      missing: [],
      paymentsOverdue: false,
    });
    const codes = acciones.map((a) => a.code);
    expect(codes).toContain('CONSERVAR_LIQUIDEZ');
    expect(codes).not.toContain('ABONO_CAPITAL');
  });

  it('con datos completos y holgura sugiere abono con impacto en pesos y meses, además de otras opciones', () => {
    const acciones = nextBestActions({
      loanState: loan,
      referenceRate: { rateEa: 0.115, source: 'Superfinanciera', asOf: '2026-09-01' },
      household: { income: 20_000_000, expenses: 5_000_000, savings: 150_000_000 },
      missing: ['certificado laboral'],
      paymentsOverdue: false,
    });
    const codes = acciones.map((a) => a.code);
    expect(codes).toContain('ABONO_CAPITAL');
    expect(codes).toContain('COMPARAR_COMPRA_CARTERA');
    expect(codes).toContain('REVISAR_SEGURO');
    expect(codes).toContain('COMPLETAR_DOCUMENTO');
    const abono = acciones.find((a) => a.code === 'ABONO_CAPITAL')!;
    expect(abono.impact).toMatch(/\$[\d.]+/);
    expect(abono.impact).toMatch(/meses/);
    // Orden por puntaje descendente.
    for (let k = 1; k < acciones.length; k++) expect(acciones[k - 1].score).toBeGreaterThanOrEqual(acciones[k].score);
  });

  it('no sugiere compra de cartera si la referencia no está al menos 1 punto por debajo', () => {
    const acciones = nextBestActions({
      loanState: loan,
      referenceRate: { rateEa: 0.135, source: 'Superfinanciera', asOf: '2026-09-01' },
      household: { income: 20_000_000, expenses: 5_000_000, savings: 150_000_000 },
      missing: [],
      paymentsOverdue: false,
    });
    expect(acciones.map((a) => a.code)).not.toContain('COMPARAR_COMPRA_CARTERA');
  });

  it('con atrasos prioriza ponerse al día y la ruta preventiva, sin abonos', () => {
    const acciones = nextBestActions({
      loanState: loan,
      household: { income: 6_000_000, expenses: 4_500_000, savings: 150_000_000 },
      missing: [],
      paymentsOverdue: true,
    });
    const codes = acciones.map((a) => a.code);
    expect(codes[0]).toBe('PONERSE_AL_DIA');
    expect(codes).toContain('RUTA_PREVENTIVA');
    expect(codes).toContain('CAMBIAR_FECHA_PAGO');
    expect(codes).not.toContain('ABONO_CAPITAL');
  });
});
