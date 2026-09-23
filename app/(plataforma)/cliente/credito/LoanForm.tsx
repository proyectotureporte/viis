import type { Loan } from '@/app/generated/prisma/client';
import { KeepForm, Submit } from '@/components/cliente/Form';
import { isoDay, percentInputText, todayBogota } from '@/lib/cliente/format';
import { milesTexto } from '@/lib/formato';
import { toNumber } from '@/lib/labels';
import { saveLoanAction } from './actions';

/** Alta o edición del crédito declarado. Todo queda con confianza DECLARED y fuente "Declarado por el cliente". */
export function LoanForm({
  loan,
  entities,
  properties,
}: {
  loan?: Loan | null;
  entities: Array<{ id: string; name: string }>;
  properties: Array<{ id: string; alias: string }>;
}) {
  const today = todayBogota();
  const money = (v: bigint | null | undefined) => (v === null || v === undefined ? '' : milesTexto(toNumber(v)));
  return (
    <KeepForm action={saveLoanAction} className="ov-form ov-form--3" resetOnSuccess={!loan}>
      {loan && <input type="hidden" name="id" value={loan.id} />}
      <label className="ov-field">
        <span>Nombre del crédito</span>
        <input name="alias" required maxLength={80} defaultValue={loan?.alias ?? ''} placeholder="Crédito apartamento" />
      </label>
      <label className="ov-field">
        <span>Entidad</span>
        <select name="entityId" defaultValue={loan?.entityId ?? ''}>
          <option value="">Otra / no está en la lista</option>
          {entities.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </label>
      <label className="ov-field">
        <span>Sistema</span>
        <select name="system" defaultValue={loan?.system ?? 'FIXED_PESOS'} required>
          <option value="FIXED_PESOS">Tasa fija en pesos</option>
          <option value="UVR">UVR (se ajusta con la inflación)</option>
        </select>
        <small>Aparece en tu extracto o pagaré.</small>
      </label>
      <label className="ov-field">
        <span>Tasa efectiva anual (EA) %</span>
        <input name="rateEa" required inputMode="decimal" defaultValue={loan ? percentInputText(Number(loan.rateEa), 4) : ''} placeholder="12,5" />
        <small>En UVR, la tasa adicional a la UVR.</small>
      </label>
      <label className="ov-field">
        <span>Plazo total (meses)</span>
        <input name="termMonths" required type="number" min={12} max={480} defaultValue={loan?.termMonths ?? ''} placeholder="240" />
      </label>
      <label className="ov-field">
        <span>Cuotas ya pagadas</span>
        <input name="paidInstallments" required type="number" min={0} max={480} defaultValue={loan?.paidInstallments ?? 0} />
      </label>
      <label className="ov-field">
        <span>Monto original prestado ($)</span>
        <input name="originalAmount" required inputMode="numeric" defaultValue={money(loan?.originalAmount)} placeholder="200.000.000" />
      </label>
      <label className="ov-field">
        <span>Fecha de desembolso</span>
        <input name="disbursedAt" required type="date" max={today} defaultValue={loan ? isoDay(loan.disbursedAt) : ''} />
      </label>
      <label className="ov-field">
        <span>Día de pago de la cuota</span>
        <input name="paymentDay" required type="number" min={1} max={31} defaultValue={loan?.paymentDay ?? ''} placeholder="5" />
      </label>
      <label className="ov-field">
        <span>Saldo de capital actual ($)</span>
        <input name="balance" required inputMode="numeric" defaultValue={money(loan?.balance)} placeholder="150.000.000" />
        <small>El saldo de capital de tu último extracto.</small>
      </label>
      <label className="ov-field">
        <span>Fecha de ese saldo</span>
        <input name="balanceAsOf" required type="date" max={today} defaultValue={loan ? isoDay(loan.balanceAsOf) : today} />
      </label>
      <label className="ov-field">
        <span>Seguros mensuales ($)</span>
        <input name="monthlyInsurance" inputMode="numeric" defaultValue={money(loan?.monthlyInsurance)} placeholder="0" />
        <small>Vida + incendio y terremoto, según extracto.</small>
      </label>
      <label className="ov-field">
        <span>Inmueble que respalda el crédito</span>
        <select name="propertyId" defaultValue={loan?.propertyId ?? ''}>
          <option value="">{properties.length ? 'Sin asociar' : 'Aún no registras inmuebles'}</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>{p.alias}</option>
          ))}
        </select>
      </label>
      <p className="ov-meta full">
        Lo que registres queda como <strong>dato declarado por ti</strong>, con fecha y versión. Si un asesor lo verifica con tu extracto, pasa a confirmado.
      </p>
      <div className="full">
        <Submit pendingText="Guardando…">{loan ? 'Guardar cambios' : 'Registrar crédito'}</Submit>
      </div>
    </KeepForm>
  );
}
