import type { Metadata } from 'next';
import Link from 'next/link';
import { KeepForm, Submit } from '@/components/cliente/Form';
import { NoPerson } from '@/components/cliente/ui';
import { Confidence, PageHeader } from '@/components/ov/ui';
import { clientPage } from '@/lib/cliente/page';
import { milesTexto } from '@/lib/formato';
import { fecha, toNumber } from '@/lib/labels';
import { saveHouseholdAction } from './actions';
import { GOALS } from './goals';

export const metadata: Metadata = { title: 'Mi hogar' };

export default async function HogarPage() {
  const { person } = await clientPage();
  if (!person) {
    return (
      <>
        <PageHeader title="Mi hogar" />
        <NoPerson />
      </>
    );
  }
  const [picked, note] = (person.goals ?? '').split(' | ');
  const pickedLabels = new Set((picked ?? '').split('; ').filter(Boolean));
  const freeNote = note ?? (picked && !GOALS.some((g) => pickedLabels.has(g.label)) ? picked : '');
  const amount = (v: bigint | null) => (v === null ? '' : milesTexto(toNumber(v)) || '0');

  return (
    <>
      <PageHeader title="Mi hogar" subtitle="Objetivos, ingresos y gastos: la base para que cada recomendación sea prudente." />
      <div className="ov-grid">
        <article className="ov-card s8">
          <KeepForm action={saveHouseholdAction} className="ov-form ov-form--2">
            <fieldset className="full" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend><h2 style={{ fontSize: 18, margin: '0 0 8px' }}>¿Qué quieres lograr?</h2></legend>
              <div className="ov-form ov-form--2">
                {GOALS.map((g) => (
                  <label className="ov-check" key={g.code}>
                    <input type="checkbox" name="goals" value={g.code} defaultChecked={pickedLabels.has(g.label)} />
                    <span>{g.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="ov-field full">
              <span>Algo más que debamos saber (opcional)</span>
              <textarea name="goalsNote" maxLength={500} defaultValue={freeNote} placeholder="Por ejemplo: queremos terminar antes de que los niños entren a la universidad." />
            </label>
            <h2 className="full" id="finanzas" style={{ fontSize: 18, margin: '8px 0 0' }}>Finanzas del hogar (mensual)</h2>
            <label className="ov-field">
              <span>Ingresos netos del hogar ($)</span>
              <input name="monthlyIncome" inputMode="numeric" defaultValue={amount(person.monthlyIncome)} placeholder="6.500.000" />
              <small>Lo que entra al mes, sumando a quienes aportan.</small>
            </label>
            <label className="ov-field">
              <span>Gastos del hogar sin la cuota ($)</span>
              <input name="monthlyExpenses" inputMode="numeric" defaultValue={amount(person.monthlyExpenses)} placeholder="3.200.000" />
              <small>Mercado, servicios, transporte, educación, otras deudas.</small>
            </label>
            <label className="ov-field">
              <span>Ahorros disponibles ($)</span>
              <input name="savings" inputMode="numeric" defaultValue={amount(person.savings)} placeholder="8.000.000" />
              <small>Dinero que podrías usar en una emergencia.</small>
            </label>
            <label className="ov-field">
              <span>Ciudad</span>
              <input name="city" maxLength={120} defaultValue={person.city ?? ''} />
            </label>
            <p className="ov-meta full">Estos datos son <strong>declarados por ti</strong> y solo se usan para tus cálculos y tu acompañamiento. En la bitácora de auditoría registramos qué campos cambiaron, no los montos.</p>
            <div className="full"><Submit pendingText="Guardando…">Guardar</Submit></div>
          </KeepForm>
        </article>
        <aside className="ov-card s4">
          <h2>¿Para qué lo usamos?</h2>
          <ul className="cl-plan">
            <li>Calcular qué parte de tu ingreso se va en la cuota.</li>
            <li>Saber si tienes un colchón de al menos 3 cuotas antes de sugerirte un abono.</li>
            <li>Activar a tiempo el Modo Tranquilidad si tu margen se estrecha.</li>
          </ul>
          <p style={{ marginTop: 12 }}><Confidence level="DECLARED" source="Declarado por ti" asOf={`actualizado ${fecha(person.updatedAt)}`} /></p>
          <div className="ov-actions">
            <Link className="ov-btn ov-btn--secondary" href="/cliente/vivienda">Siguiente: mi inmueble</Link>
          </div>
        </aside>
      </div>
    </>
  );
}
