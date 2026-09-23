import { ActionForm, SubmitButton } from '@/components/ov/forms';
import type { FormAction } from '@/components/ov/forms';

export interface OrgValues {
  id?: string;
  kind: string;
  name: string;
  taxId: string | null;
  territory: string | null;
  tier: string;
  monthlyGoal: bigint | null;
  active: boolean;
}

/** Formulario de alta/edición de organización aliada. */
export function OrgForm({ action, values, submit }: { action: FormAction; values?: OrgValues; submit: string }) {
  return (
    <ActionForm action={action} className="ov-form ov-form--3" resetOnSuccess={!values}>
      {values?.id && <input type="hidden" name="id" value={values.id} />}
      <label className="ov-field"><span>Tipo</span>
        <select name="kind" defaultValue={values?.kind ?? 'ALLY_COMPANY'} required>
          <option value="ALLY_COMPANY">Aliado empresa</option>
          <option value="ALLY_PERSON">Aliado persona natural</option>
        </select>
      </label>
      <label className="ov-field"><span>Nombre o razón social</span><input name="name" required minLength={2} maxLength={160} defaultValue={values?.name} /></label>
      <label className="ov-field"><span>NIT o documento</span><input name="taxId" maxLength={40} defaultValue={values?.taxId ?? ''} /></label>
      <label className="ov-field"><span>Territorio</span><input name="territory" maxLength={160} placeholder="Ej.: Cali y Valle del Cauca" defaultValue={values?.territory ?? ''} /></label>
      <label className="ov-field"><span>Nivel</span><input name="tier" required maxLength={24} list="ove-tiers" defaultValue={values?.tier ?? 'BASE'} /></label>
      <label className="ov-field"><span>Meta mensual de desembolsos ($)</span><input name="monthlyGoal" inputMode="numeric" placeholder="Ej.: 500.000.000" defaultValue={values?.monthlyGoal ? values.monthlyGoal.toString() : ''} /></label>
      <datalist id="ove-tiers"><option value="BASE" /><option value="PLATA" /><option value="ORO" /></datalist>
      <label className="ov-check full"><input type="checkbox" name="active" defaultChecked={values ? values.active : true} /><span>Activo (puede registrar clientes y radicar)</span></label>
      <div className="full"><SubmitButton>{submit}</SubmitButton></div>
    </ActionForm>
  );
}
