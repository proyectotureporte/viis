import { useState } from 'react';
import type { ActionResult } from '@/services/api';
import { milesInput } from '@/services/format';
import { Button, Checkbox, Field, MoneyField, Notice, Select, T, type Option } from '@/ui/kit';
import { Sheet } from './ui';

export interface OrgValues {
  kind: string;
  name: string;
  taxId: string;
  territory: string;
  tier: string;
  monthlyGoal: string;
  active: boolean;
}

/** Crear o editar una organización aliada (mismos campos que la web). */
export function OrgForm({
  visible,
  onClose,
  title,
  initial,
  kinds,
  tiers,
  onSubmit,
  pending,
  confirmDeactivate,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  initial?: Partial<Omit<OrgValues, 'monthlyGoal'>> & { monthlyGoal?: number | null };
  kinds: Option[];
  tiers: string[];
  onSubmit: (v: Record<string, unknown>) => Promise<ActionResult>;
  pending: boolean;
  confirmDeactivate?: () => Promise<boolean>;
}) {
  const make = (): OrgValues => ({
    kind: initial?.kind ?? kinds[0]?.value ?? 'ALLY_COMPANY',
    name: initial?.name ?? '',
    taxId: initial?.taxId ?? '',
    territory: initial?.territory ?? '',
    tier: initial?.tier ?? tiers[0] ?? 'BASE',
    monthlyGoal: initial?.monthlyGoal ? milesInput(String(initial.monthlyGoal)) : '',
    active: initial?.active ?? true,
  });
  const [v, setV] = useState<OrgValues>(make);
  const [error, setError] = useState<string | null>(null);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setV(make());
      setError(null);
    }
  }
  const set = (k: keyof OrgValues) => (x: string) => setV((o) => ({ ...o, [k]: x }));

  async function submit() {
    if (v.name.trim().length < 2) return setError('Escribe el nombre de la organización.');
    const deactivating = Boolean(initial?.active && !v.active && confirmDeactivate);
    if (deactivating) {
      // La confirmación es otra hoja: se cierra primero esta (iOS no presenta dos modales hermanos).
      onClose();
      await new Promise((r) => setTimeout(r, 400));
      if (!(await confirmDeactivate!())) return;
    }
    const res = await onSubmit({ kind: v.kind, name: v.name.trim(), taxId: v.taxId.trim() || undefined, territory: v.territory.trim() || undefined, tier: v.tier, monthlyGoal: v.monthlyGoal || undefined, active: v.active || undefined });
    if (res.ok || deactivating) onClose();
    else setError(res.message);
  }

  return (
    <Sheet visible={visible} title={title} onClose={onClose} footer={<Button title="Guardar" onPress={submit} loading={pending} />}>
      <Select label="Tipo" value={v.kind} options={kinds} onChange={set('kind')} />
      <Field label="Nombre" value={v.name} onChangeText={set('name')} maxLength={160} />
      <Field label="NIT o documento (opcional)" value={v.taxId} onChangeText={set('taxId')} maxLength={40} />
      <Field label="Territorio (opcional)" value={v.territory} onChangeText={set('territory')} maxLength={120} />
      <Select label="Nivel" value={v.tier} options={tiers.map((t) => ({ value: t, label: t }))} onChange={set('tier')} />
      <MoneyField label="Meta mensual de desembolsos (opcional)" value={v.monthlyGoal} onChangeText={set('monthlyGoal')} placeholder="$" />
      <Checkbox checked={v.active} onChange={(active) => setV((o) => ({ ...o, active }))}>
        Organización activa
      </Checkbox>
      {initial?.active && !v.active ? <T v="small">Al inactivarla se cierran las sesiones de todos sus usuarios.</T> : null}
      {error ? <Notice tone="bad">{error}</Notice> : null}
    </Sheet>
  );
}
