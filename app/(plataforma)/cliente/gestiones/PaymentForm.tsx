'use client';

import { useState } from 'react';
import { KeepForm, Submit } from '@/components/cliente/Form';
import type { FormAction } from '@/components/ov/forms';
import { PAYMENT_WARNING } from './channels';

/** Formulario de reporte de pago: si es abono, pide cómo aplicarlo. */
export function PaymentForm({
  action,
  loans,
  defaultLoanId,
  channels,
  today,
}: {
  action: FormAction;
  loans: Array<{ id: string; label: string }>;
  defaultLoanId?: string;
  channels: string[];
  today: string;
}) {
  const [kind, setKind] = useState<'INSTALLMENT' | 'PREPAYMENT'>('INSTALLMENT');
  return (
    <KeepForm action={action} className="ov-form ov-form--2" resetOnSuccess ariaLabel="Reportar un pago">
      <p className="ov-notice full" role="note"><strong>Importante:</strong> {PAYMENT_WARNING} Primero paga a tu entidad por sus canales; aquí solo nos cuentas que pagaste para acompañarte y actualizar tu crédito cuando se valide.</p>
      <label className="ov-field">
        <span>Crédito</span>
        <select name="loanId" required defaultValue={defaultLoanId ?? loans[0]?.id}>
          {loans.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
      </label>
      <label className="ov-field">
        <span>Tipo de pago</span>
        <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as 'INSTALLMENT' | 'PREPAYMENT')}>
          <option value="INSTALLMENT">Cuota mensual</option>
          <option value="PREPAYMENT">Abono extraordinario a capital</option>
        </select>
      </label>
      {kind === 'PREPAYMENT' && (
        <fieldset className="full" style={{ border: '1px solid var(--ov-line)', borderRadius: 12, padding: 12 }}>
          <legend className="ov-meta" style={{ padding: '0 6px' }}>¿Cómo pediste aplicar el abono?</legend>
          <label className="ov-check"><input type="radio" name="applyMode" value="TERM" required defaultChecked /> <span><strong>Reducir el plazo</strong> (misma cuota, terminas antes; suele ahorrar más intereses)</span></label>
          <label className="ov-check" style={{ marginTop: 8 }}><input type="radio" name="applyMode" value="PAYMENT" /> <span><strong>Reducir la cuota</strong> (mismo plazo, pagas menos cada mes)</span></label>
          <p className="ov-meta" style={{ margin: '8px 0 0' }}>Por ley, en créditos de vivienda puedes elegir cómo se aplica un abono. Pide a tu entidad que lo deje por escrito.</p>
        </fieldset>
      )}
      <label className="ov-field">
        <span>Fecha en que pagaste</span>
        <input type="date" name="paidOn" required max={today} defaultValue={today} />
      </label>
      <label className="ov-field">
        <span>Valor pagado ($)</span>
        <input name="amount" required inputMode="numeric" placeholder="2.450.000" />
      </label>
      <label className="ov-field">
        <span>Canal</span>
        <select name="channel" required defaultValue="">
          <option value="" disabled>Elige</option>
          {channels.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label className="ov-field">
        <span>Referencia o número de aprobación</span>
        <input name="reference" maxLength={80} placeholder="Opcional, ayuda a validar" />
      </label>
      <label className="ov-field full">
        <span>Soporte del pago (obligatorio)</span>
        <input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png" required />
        <small>Comprobante del banco en PDF, JPG o PNG · máximo 10 MB.</small>
      </label>
      <label className="ov-check full">
        <input type="checkbox" name="ack" required />
        <span>Entiendo que {PAYMENT_WARNING.charAt(0).toLowerCase() + PAYMENT_WARNING.slice(1)}</span>
      </label>
      <div className="full"><Submit pendingText="Enviando soporte…">Reportar pago</Submit></div>
    </KeepForm>
  );
}
