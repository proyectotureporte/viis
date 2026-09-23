import { describe, expect, it } from 'vitest';
import { amortize, ENGINE_VERSION, type LoanInput, type Schedule } from '@/lib/finance';
import { cuotaMensual } from '@/lib/credito';

const sumCents = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

/** Invariantes de toda tabla: saldo encadenado, capital total exacto, saldo final cero. */
function expectConsistent(s: Schedule, principal: number) {
  expect(sumCents(s.rows.map((r) => r.principal + r.extra))).toBe(principal);
  expect(s.rows[s.rows.length - 1].closingBalance).toBe(0);
  for (let k = 1; k < s.rows.length; k++) {
    expect(s.rows[k].openingBalance).toBe(s.rows[k - 1].closingBalance);
  }
  for (const r of s.rows) {
    expect(Math.round((r.openingBalance - r.principal - r.extra) * 100) / 100).toBe(r.closingBalance);
  }
}

const base: LoanInput = {
  principal: 100_000_000,
  rateEa: 0.12,
  termMonths: 180,
  system: 'FIXED_PESOS',
  startDate: '2026-01-15',
};

describe('sistema francés en pesos', () => {
  it('$100M al 12% EA a 180 meses coincide con la fórmula cerrada', () => {
    const s = amortize(base);
    const i = Math.pow(1.12, 1 / 12) - 1;
    expect(s.monthlyRate).toBeCloseTo(0.009488793, 9);
    const cuota = (base.principal * i) / (1 - Math.pow(1 + i, -180));
    expect(Math.abs(s.basePayment - cuota)).toBeLessThan(1);
    expect(s.months).toBe(180);
    expect(s.totals.principal).toBe(100_000_000);
    expectConsistent(s, 100_000_000);
    // Última cuota ajustada: difiere de la regular solo por centavos de redondeo.
    expect(Math.abs(s.rows[179].payment - s.basePayment)).toBeLessThan(1);
    expect(s.engineVersion).toBe(ENGINE_VERSION);
    expect(s.assumptions.some((a) => a.includes('30E/360'))).toBe(true);
  });

  it('reproduce las cifras del repositorio: $200M a 20 años al 14,58% y al 8%', () => {
    const mercado = amortize({ ...base, principal: 200_000_000, rateEa: 0.1458, termMonths: 240 });
    const oferta = amortize({ ...base, principal: 200_000_000, rateEa: 0.08, termMonths: 240 });
    expect(Math.round(mercado.basePayment)).toBe(2_441_820);
    expect(Math.round(oferta.basePayment)).toBe(1_638_300);
    expect(Math.abs(mercado.basePayment - cuotaMensual(200_000_000, 0.1458, 20))).toBeLessThan(0.01);
    expect(Math.round(mercado.basePayment - oferta.basePayment)).toBe(803_520);
    expect((mercado.totals.paid - oferta.totals.paid) / 1e6).toBeCloseTo(192.8, 1);
    expectConsistent(mercado, 200_000_000);
    expectConsistent(oferta, 200_000_000);
  });

  it('tabla bancaria: $1.000.000 al 1% mensual a 12 meses, fila a fila', () => {
    const s = amortize({
      principal: 1_000_000,
      rateEa: Math.pow(1.01, 12) - 1,
      termMonths: 12,
      system: 'FIXED_PESOS',
      startDate: '2026-01-31',
    });
    expect(s.basePayment).toBe(88_848.79);
    const esperado = [
      // [interés, capital, saldo]
      [10_000.0, 78_848.79, 921_151.21],
      [9_211.51, 79_637.28, 841_513.93],
      [8_415.14, 80_433.65, 761_080.28],
      [7_610.8, 81_237.99, 679_842.29],
    ];
    esperado.forEach(([interes, capital, saldo], k) => {
      expect(s.rows[k].interest).toBe(interes);
      expect(s.rows[k].principal).toBe(capital);
      expect(s.rows[k].closingBalance).toBe(saldo);
    });
    expect(s.totals.interest).toBeCloseTo(66_185.45, 2);
    expectConsistent(s, 1_000_000);
    // Fin de mes: desembolso el 31 → cuotas el último día de cada mes.
    expect(s.rows.slice(0, 4).map((r) => r.date)).toEqual(['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
  });

  it('seguros: fijo mensual y de vida sobre saldo se suman a la cuota', () => {
    const s = amortize({ ...base, monthlyInsurance: 50_000, insuranceRateMonthly: 0.0002 });
    const sin = amortize(base);
    expect(s.rows[0].insurance).toBe(50_000 + 20_000);
    expect(s.basePayment).toBeCloseTo(sin.basePayment + 70_000, 2);
    expect(s.rows[100].insurance).toBeCloseTo(50_000 + 0.0002 * s.rows[100].openingBalance, 2);
    expect(s.totals.interest).toBe(sin.totals.interest);
  });

  it('tasa cero reparte el capital en cuotas iguales', () => {
    const s = amortize({ ...base, principal: 1_200_000, rateEa: 0, termMonths: 12 });
    expect(s.basePayment).toBe(100_000);
    expect(s.totals.interest).toBe(0);
  });

  it('rechaza entradas inválidas', () => {
    expect(() => amortize({ ...base, principal: 0 })).toThrow(RangeError);
    expect(() => amortize({ ...base, termMonths: 12.5 })).toThrow(RangeError);
    expect(() => amortize({ ...base, system: 'UVR' })).toThrow(/UVR/);
    expect(() => amortize({ ...base, startDate: '2026-02-30' })).toThrow(RangeError);
  });
});

describe('periodos irregulares (30E/360)', () => {
  it('un primer periodo de 45 días genera más interés que uno de 30', () => {
    const p30 = amortize({ ...base, startDate: '2026-01-01', firstPaymentDate: '2026-02-01' });
    const p45 = amortize({ ...base, startDate: '2026-01-01', firstPaymentDate: '2026-02-16' });
    expect(p30.firstPeriodDays).toBe(30);
    expect(p45.firstPeriodDays).toBe(45);
    expect(p45.rows[0].interest).toBeGreaterThan(p30.rows[0].interest);
    const i = p30.monthlyRate;
    expect(p45.rows[0].interest).toBeCloseTo(base.principal * (Math.pow(1 + i, 1.5) - 1), 1);
    expect(p45.totals.interest).toBeGreaterThan(p30.totals.interest);
    // La diferencia es exactamente el interés de los 15 días adicionales.
    expect(p45.totals.interest - p30.totals.interest).toBeCloseTo(p45.rows[0].interest - p30.rows[0].interest, 2);
    expect(p45.rows[1].payment).toBe(p30.rows[1].payment);
    expect(p45.rows[0].payment).toBeGreaterThan(p30.rows[0].payment);
    expectConsistent(p45, base.principal);
    // Las cuotas siguientes vencen el día 16 de cada mes.
    expect(p45.rows[1].date).toBe('2026-03-16');
  });

  it('un primer periodo corto genera menos interés', () => {
    const p20 = amortize({ ...base, startDate: '2026-01-10', firstPaymentDate: '2026-01-30' });
    expect(p20.firstPeriodDays).toBe(20);
    expect(p20.rows[0].interest).toBeLessThan(amortize(base).rows[0].interest);
    expectConsistent(p20, base.principal);
  });

  it('rechaza una primera cuota anterior al desembolso', () => {
    expect(() => amortize({ ...base, firstPaymentDate: '2026-01-10' })).toThrow(RangeError);
  });
});

describe('UVR (cuota constante en UVR)', () => {
  const uvrBase: LoanInput = { ...base, principal: 150_000_000, rateEa: 0.075, termMonths: 240 };

  it('con inflación 0 coincide con la tabla en pesos', () => {
    const pesos = amortize(uvrBase);
    const uvr = amortize({ ...uvrBase, system: 'UVR', uvr: { initialValue: 392.5731, annualInflation: 0 } });
    expect(uvr.months).toBe(pesos.months);
    expect(Math.abs(uvr.basePayment - pesos.basePayment)).toBeLessThan(1);
    expect(Math.abs(uvr.totals.interest - pesos.totals.interest)).toBeLessThan(240);
    uvr.rows.forEach((r, k) => expect(Math.abs(r.closingBalance - pesos.rows[k].closingBalance)).toBeLessThan(1));
  });

  it('con inflación > 0 la cuota en pesos crece cada mes y el saldo final en UVR es 0', () => {
    const s = amortize({ ...uvrBase, system: 'UVR', uvr: { initialValue: 392.5731, annualInflation: 0.05 } });
    const cuotas = s.rows.map((r) => r.payment);
    for (let k = 1; k < cuotas.length - 1; k++) expect(cuotas[k]).toBeGreaterThan(cuotas[k - 1]);
    // Cuota constante en UVR (salvo el ajuste de la última).
    const enUvr = new Set(s.rows.slice(0, -1).map((r) => r.paymentUvr));
    expect(enUvr.size).toBe(1);
    expect(s.rows[s.rows.length - 1].closingBalanceUvr).toBe(0);
    expect(s.rows[s.rows.length - 1].closingBalance).toBe(0);
    // UVR a 12 meses = UVR₀·1,05.
    expect(s.rows[11].uvrValue).toBeCloseTo(392.5731 * 1.05, 3);
    // La cuota final en pesos ≈ inicial × 1,05^(239/12).
    expect(cuotas[238] / cuotas[0]).toBeCloseTo(Math.pow(1.05, 238 / 12), 3);
    expect(s.assumptions.some((a) => a.includes('UVR(t)'))).toBe(true);
  });
});

describe('abonos extraordinarios', () => {
  const abono = (mode: 'TERM' | 'PAYMENT', amount = 10_000_000) =>
    amortize({ ...base, extraPayments: [{ date: '2027-01-10', amount, mode }] });

  it('TERM mantiene la cuota, reduce meses y ahorra intereses', () => {
    const sin = amortize(base);
    const con = abono('TERM');
    expect(con.months).toBeLessThan(sin.months);
    expect(con.totals.interest).toBeLessThan(sin.totals.interest);
    expect(con.rows[13].payment).toBe(sin.rows[13].payment);
    const fila = con.rows.find((r) => r.extra > 0)!;
    expect(fila.date).toBe('2027-01-15');
    expect(fila.extra).toBe(10_000_000);
    expectConsistent(con, base.principal);
  });

  it('PAYMENT mantiene la fecha final y baja la cuota', () => {
    const sin = amortize(base);
    const con = abono('PAYMENT');
    expect(con.months).toBe(sin.months);
    expect(con.payoffDate).toBe(sin.payoffDate);
    expect(con.rows[12].payment).toBeLessThan(sin.rows[12].payment);
    expect(con.totals.interest).toBeLessThan(sin.totals.interest);
    expectConsistent(con, base.principal);
  });

  it('un abono mayor al saldo liquida el crédito', () => {
    const con = abono('TERM', 500_000_000);
    expect(con.months).toBe(12);
    expect(con.rows[11].closingBalance).toBe(0);
    expect(con.totals.extra + con.totals.principal).toBe(base.principal);
    expect(con.warnings.some((w) => w.includes('supera el saldo'))).toBe(true);
  });

  it('abono recurrente anual reduce el plazo', () => {
    const con = amortize({
      ...base,
      recurringExtra: { amount: 2_000_000, everyMonths: 12, startDate: '2026-12-15', mode: 'TERM' },
    });
    expect(con.months).toBeLessThan(180);
    expect(con.rows.filter((r) => r.extra > 0).length).toBeGreaterThan(5);
    expectConsistent(con, base.principal);
  });

  it('abono en UVR se convierte a UVR en la fecha y deja saldo 0', () => {
    const s = amortize({
      ...base,
      system: 'UVR',
      uvr: { initialValue: 390, annualInflation: 0.04 },
      extraPayments: [{ date: '2028-01-15', amount: 20_000_000, mode: 'TERM' }],
    });
    expect(s.months).toBeLessThan(180);
    expect(s.rows[s.rows.length - 1].closingBalanceUvr).toBe(0);
  });
});

describe('reproducibilidad', () => {
  it('el mismo input produce exactamente la misma tabla', () => {
    const input: LoanInput = { ...base, monthlyInsurance: 30_000, extraPayments: [{ date: '2030-05-01', amount: 5e6, mode: 'PAYMENT' }] };
    expect(amortize(input)).toEqual(amortize(structuredClone(input)));
  });
});
