import { describe, expect, it } from 'vitest';
import {
  amortize,
  ENGINE_VERSION,
  remainingSchedule,
  simulateExtraordinary,
  simulateFixedVsUvr,
  simulatePortfolioPurchase,
  simulatePrepayment,
  simulateRentVsBuy,
  simulateSale,
  simulateStress,
  simulateTargetPayment,
  simulateTermChange,
  type LoanState,
} from '@/lib/finance';

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

describe('cronograma restante', () => {
  it('amortiza el saldo actual en las cuotas restantes', () => {
    const s = remainingSchedule(loan);
    expect(s.months).toBe(190);
    expect(s.rows[0].date).toBe('2026-10-10');
    expect(s.rows[0].openingBalance).toBe(180_000_000);
    expect(s.totals.principal).toBe(180_000_000);
  });

  it('en UVR proyecta la UVR a la fecha de corte si no se informa', () => {
    const uvrLoan: LoanState = { ...loan, system: 'UVR', rateEa: 0.075, uvr: { initialValue: 300, annualInflation: 0.05 } };
    const s = remainingSchedule(uvrLoan);
    expect(s.rows[0].uvrValue! / 300).toBeGreaterThan(1.2);
    expect(s.rows[s.rows.length - 1].closingBalanceUvr).toBe(0);
  });
});

describe('simulatePrepayment', () => {
  it('TERM: ahorra intereses y reduce meses; PAYMENT: baja la cuota con la misma fecha final', () => {
    const term = simulatePrepayment(loan, { amount: 20_000_000, date: '2026-12-01', mode: 'TERM' });
    expect(term.results.monthsReduced).toBeGreaterThan(0);
    expect(term.results.interestSaved).toBeGreaterThan(0);
    expect(term.results.newPayment).toBe(term.results.basePayment);
    expect(term.engineVersion).toBe(ENGINE_VERSION);
    expect(term.assumptions.length).toBeGreaterThan(0);

    const pay = simulatePrepayment(loan, { amount: 20_000_000, date: '2026-12-01', mode: 'PAYMENT' });
    expect(pay.results.monthsReduced).toBe(0);
    expect(pay.results.newEndDate).toBe(pay.results.baseEndDate);
    expect(pay.results.newPayment).toBeLessThan(pay.results.basePayment);
    // Reducir plazo ahorra más intereses que reducir cuota.
    expect(term.results.interestSaved).toBeGreaterThan(pay.results.interestSaved);
  });

  it('un abono mayor al saldo liquida el crédito', () => {
    const r = simulatePrepayment(loan, { amount: 999_000_000, date: '2026-10-01', mode: 'TERM' });
    expect(r.results.paidOff).toBe(true);
    expect(r.results.scenario.months).toBe(1);
    expect(r.warnings.some((w) => w.includes('saldar'))).toBe(true);
  });
});

describe('simulateTermChange', () => {
  it('ampliar el plazo baja la cuota pero sube el costo total', () => {
    const r = simulateTermChange(loan, { newTermMonths: 240, costs: { notariales: 500_000 } });
    expect(r.results.paymentDifference).toBeLessThan(0);
    expect(r.results.totalCostDifference).toBeGreaterThan(0);
    expect(r.results.costs).toBe(500_000);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe('simulatePortfolioPurchase', () => {
  it('con 3 puntos menos y costos moderados conviene revisar, con punto de equilibrio', () => {
    const r = simulatePortfolioPurchase(loan, {
      newRateEa: 0.11,
      costs: { estudio: 300_000, avaluo: 450_000, notariales: 1_800_000 },
    });
    expect(r.results.monthlySavings).toBeGreaterThan(0);
    expect(r.results.netSavings).toBe(Math.round((r.results.grossSavings - 2_550_000) * 100) / 100);
    expect(r.results.breakEvenMonths).not.toBeNull();
    expect(r.results.breakEvenMonths!).toBeLessThan(12);
    expect(r.results.recommendation).toBe('conviene revisar');
    expect(r.results.recommendationText).not.toMatch(/garantiza|seguro que/i);
  });

  it('con costos que superan el ahorro no parece conveniente', () => {
    const r = simulatePortfolioPurchase(loan, { newRateEa: 0.1395, costs: 20_000_000 });
    expect(r.results.recommendation).toBe('no parece conveniente');
    expect(r.results.netSavings).toBeLessThan(0);
  });
});

describe('simulateTargetPayment', () => {
  it('ingreso mínimo = cuota / 30 %', () => {
    const r = simulateTargetPayment({ principal: 200_000_000, rateEa: 0.1458, termMonths: 240, monthlyInsurance: 0, system: 'FIXED_PESOS' });
    expect(Math.round(r.results.payment)).toBe(2_441_820);
    expect(r.results.minIncome).toBeCloseTo(r.results.payment / 0.3, 1);
    expect(r.assumptions.some((a) => a.includes('30 %'))).toBe(true);
  });

  it('el límite es parametrizable', () => {
    const r = simulateTargetPayment({ principal: 100_000_000, rateEa: 0.12, termMonths: 180, system: 'FIXED_PESOS', incomeRatioLimit: 0.4 });
    expect(r.results.minIncome).toBeCloseTo(r.results.payment / 0.4, 1);
  });
});

describe('simulateFixedVsUvr', () => {
  it('devuelve rangos por escenario y advierte que no es certeza', () => {
    const r = simulateFixedVsUvr(150_000_000, 240, 0.13, 0.08, [0.03, 0.05, 0.07]);
    expect(r.results.scenarios).toHaveLength(3);
    const [bajo, , alto] = r.results.scenarios;
    // La primera cuota ya lleva un mes de UVR proyectada.
    expect(alto.initialPayment / bajo.initialPayment).toBeCloseTo(Math.pow(1.07 / 1.03, 1 / 12), 5);
    expect(alto.finalPayment).toBeGreaterThan(bajo.finalPayment);
    expect(alto.totalPaid).toBeGreaterThan(bajo.totalPaid);
    expect(r.results.range.finalMax).toBe(alto.finalPayment);
    expect(r.results.fixed.payment).toBeCloseTo(amortize({ principal: 150_000_000, rateEa: 0.13, termMonths: 240, system: 'FIXED_PESOS', startDate: '2026-01-01' }).basePayment, 2);
    expect(r.warnings.some((w) => w.includes('no es una certeza'))).toBe(true);
  });
});

describe('simulateExtraordinary', () => {
  it('abonos anuales adelantan la fecha de terminación', () => {
    const r = simulateExtraordinary(loan, { amount: 3_000_000, everyMonths: 12, mode: 'TERM' });
    expect(r.results.monthsReduced).toBeGreaterThan(0);
    expect(r.results.newEndDate < r.results.baseEndDate).toBe(true);
    expect(r.results.monthlyEquivalentEffort).toBe(250_000);
    expect(r.results.interestSaved).toBeGreaterThan(0);
  });
});

describe('simulateStress', () => {
  it('clasifica OK, VIGILAR y RIESGO con plan en español', () => {
    const ok = simulateStress({ monthlyIncome: 10_000_000, monthlyExpenses: 4_000_000, payment: 2_000_000, savings: 30_000_000, incomeDropPct: 0, newExpense: 0 });
    expect(ok.results.alert).toBe('OK');
    expect(ok.results.monthlyMargin).toBe(4_000_000);
    expect(ok.results.coverageMonths).toBeNull();

    const vigilar = simulateStress({ monthlyIncome: 10_000_000, monthlyExpenses: 4_000_000, payment: 2_000_000, savings: 30_000_000, incomeDropPct: 0.35, newExpense: 0 });
    expect(vigilar.results.alert).toBe('VIGILAR');

    const riesgo = simulateStress({ monthlyIncome: 6_000_000, monthlyExpenses: 3_500_000, payment: 2_000_000, savings: 2_000_000, incomeDropPct: 0.3, newExpense: 500_000 });
    expect(riesgo.results.alert).toBe('RIESGO');
    expect(riesgo.results.monthlyMargin).toBeLessThan(0);
    expect(riesgo.results.coverageMonths).toBeLessThan(6);
    expect(riesgo.results.plan.some((p) => p.includes('banco'))).toBe(true);
  });

  it('rechaza porcentajes expresados como enteros', () => {
    expect(() => simulateStress({ monthlyIncome: 1, monthlyExpenses: 0, payment: 0, savings: 0, incomeDropPct: 20, newExpense: 0 })).toThrow(RangeError);
  });
});

describe('simulateRentVsBuy', () => {
  it('produce flujos anuales y patrimonio al horizonte', () => {
    const r = simulateRentVsBuy({
      rent: 1_800_000,
      rentIncreasePct: 0.05,
      price: 300_000_000,
      downPayment: 90_000_000,
      rateEa: 0.12,
      termMonths: 240,
      appreciationPct: 0.05,
      maintenancePct: 0.01,
      horizonYears: 10,
      opportunityRatePct: 0.08,
    });
    expect(r.results.years).toHaveLength(10);
    const y10 = r.results.years[9];
    expect(y10.homeValue).toBeCloseTo(300_000_000 * Math.pow(1.05, 10), 0);
    expect(y10.loanBalance).toBeGreaterThan(0);
    expect(r.results.difference).toBeCloseTo(r.results.buyerNetWorth - r.results.renterNetWorth, 1);
    expect(['COMPRAR', 'ARRENDAR', 'SIMILAR']).toContain(r.results.favored);
  });
});

describe('simulateSale', () => {
  it('disponible neto = precio − saldo − gastos − impuestos', () => {
    const r = simulateSale({ price: 400_000_000, loanBalance: 150_000_000, saleCostsPct: 0.03, taxesEstimate: 10_000_000 });
    expect(r.results.saleCosts).toBe(12_000_000);
    expect(r.results.netAvailable).toBe(228_000_000);
    const neg = simulateSale({ price: 100_000_000, loanBalance: 120_000_000, saleCostsPct: 0.03, taxesEstimate: 0 });
    expect(neg.results.netAvailable).toBeLessThan(0);
    expect(neg.warnings.some((w) => w.includes('faltaría'))).toBe(true);
  });
});
