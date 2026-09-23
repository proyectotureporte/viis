import { useState } from 'react';
import { View } from 'react-native';
import type { NuevoCasoResponse } from '@/lib/movil/contract-empresa';
import type { ActionResult } from '@/services/api';
import { Button, Card, Checkbox, Field, MoneyField, Notice, ResultBanner, Select, T } from '@/ui/kit';
import { colors, fonts, space } from '@/ui/theme';

export interface PersonCaseDefaults {
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  captureChannel?: string;
}

const STEPS = ['Cliente', 'Caso', 'Autorizaciones'];

/**
 * Alta de persona + caso + autorizaciones en 3 pasos (nuevo caso y conversión
 * de leads). El servidor valida todo, evita duplicados por índice ciego y
 * guarda la versión exacta del texto de cada autorización.
 */
export function PersonCaseForm({
  options,
  lockAssigneeToSelf,
  declaration,
  consentVersion,
  defaults = {},
  submitLabel,
  onSubmit,
  pending,
}: {
  options: NuevoCasoResponse['options'];
  lockAssigneeToSelf: boolean;
  declaration: string;
  consentVersion?: string;
  defaults?: PersonCaseDefaults;
  submitLabel: string;
  onSubmit: (body: Record<string, unknown>) => Promise<ActionResult>;
  pending: boolean;
}) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [f, setF] = useState({
    documentType: options.documentTypes[0]?.value ?? 'CC',
    documentNumber: '',
    firstName: defaults.firstName ?? '',
    lastName: defaults.lastName ?? '',
    email: defaults.email ?? '',
    phone: defaults.phone ?? '',
    city: defaults.city ?? '',
    monthlyIncome: '',
    product: '',
    amount: '',
    entityId: '',
    assigneeId: '',
    nextAction: '',
    captureChannel: defaults.captureChannel ?? '',
  });
  const [consents, setConsents] = useState<string[]>(options.consentPurposes.filter((p) => p.required).map((p) => p.code));
  const [declared, setDeclared] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  function check(s: number): string | null {
    if (s === 0) {
      if (!/^[0-9A-Za-z.\- ]{4,20}$/.test(f.documentNumber.trim())) return 'Escribe un número de documento válido (4 a 20 caracteres).';
      if (f.firstName.trim().length < 2) return 'Escribe los nombres.';
      if (f.lastName.trim().length < 2) return 'Escribe los apellidos.';
      if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return 'El correo no es válido.';
      if (f.phone.trim() && !/^[+()\d\s.-]{7,20}$/.test(f.phone.trim())) return 'El teléfono no es válido.';
    }
    if (s === 1 && !f.product) return 'Elige el producto.';
    if (s === 2) {
      const missing = options.consentPurposes.filter((p) => p.required && !consents.includes(p.code));
      if (missing.length) return `Falta la autorización obligatoria: ${missing.map((m) => m.title).join(', ')}.`;
      if (!f.captureChannel) return 'Indica cómo se capturó la autorización.';
      if (!declared) return 'Debes declarar que el cliente otorgó las autorizaciones.';
    }
    return null;
  }

  function next() {
    const e = check(step);
    setError(e);
    if (!e) setStep(step + 1);
  }

  async function submit() {
    for (let s = 0; s < 3; s++) {
      const e = check(s);
      if (e) {
        setStep(s);
        setError(e);
        return;
      }
    }
    setError(null);
    const res = await onSubmit({
      documentType: f.documentType,
      documentNumber: f.documentNumber.trim(),
      firstName: f.firstName.trim(),
      lastName: f.lastName.trim(),
      email: f.email.trim() || undefined,
      phone: f.phone.trim() || undefined,
      city: f.city.trim() || undefined,
      monthlyIncome: f.monthlyIncome || undefined,
      product: f.product,
      amount: f.amount || undefined,
      entityId: f.entityId || undefined,
      assigneeId: lockAssigneeToSelf ? undefined : f.assigneeId || undefined,
      nextAction: f.nextAction.trim() || undefined,
      consents,
      captureChannel: f.captureChannel,
      declaration: true,
    });
    setResult(res);
  }

  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', gap: 6 }} accessibilityRole="progressbar" accessibilityLabel={`Paso ${step + 1} de 3: ${STEPS[step]}`}>
        {STEPS.map((label, i) => (
          <View key={label} style={{ flex: 1 }}>
            <View style={{ height: 5, borderRadius: 3, backgroundColor: i <= step ? colors.mint : colors.line }} />
            <T v="small" style={{ marginTop: 4, fontFamily: i === step ? fonts.bold : fonts.body, color: i === step ? colors.ink : colors.muted }}>{`${i + 1}. ${label}`}</T>
          </View>
        ))}
      </View>

      {step === 0 ? (
        <>
          <Select label="Tipo de documento" value={f.documentType} options={options.documentTypes} onChange={set('documentType')} />
          <Field label="Número de documento" value={f.documentNumber} onChangeText={set('documentNumber')} autoCapitalize="characters" autoCorrect={false} maxLength={20} hint="Se guarda cifrado; en la consola solo se muestran los últimos 4." />
          <Field label="Nombres" value={f.firstName} onChangeText={set('firstName')} maxLength={120} autoCapitalize="words" />
          <Field label="Apellidos" value={f.lastName} onChangeText={set('lastName')} maxLength={120} autoCapitalize="words" />
          <Field label="Correo (opcional)" value={f.email ?? ''} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={320} />
          <Field label="Teléfono (opcional)" value={f.phone ?? ''} onChangeText={set('phone')} keyboardType="phone-pad" maxLength={20} />
          <Field label="Ciudad (opcional)" value={f.city ?? ''} onChangeText={set('city')} maxLength={120} />
          <MoneyField label="Ingreso mensual del hogar (opcional)" value={f.monthlyIncome} onChangeText={set('monthlyIncome')} placeholder="$" />
        </>
      ) : null}

      {step === 1 ? (
        <>
          <Select label="Producto" value={f.product} options={options.products} onChange={set('product')} />
          <MoneyField label="Monto estimado (opcional)" value={f.amount} onChangeText={set('amount')} placeholder="$" />
          <Select label="Entidad financiera (opcional)" value={f.entityId} options={[{ value: '', label: 'Sin definir' }, ...options.entities]} onChange={set('entityId')} />
          {lockAssigneeToSelf ? (
            <Notice tone="info">Quedarás como responsable del caso.</Notice>
          ) : (
            <Select label="Responsable (opcional)" value={f.assigneeId} options={[{ value: '', label: 'Sin asignar' }, ...options.staff.map((u) => ({ value: u.id, label: u.name, hint: u.roleLabel }))]} onChange={set('assigneeId')} />
          )}
          <Field label="Siguiente acción (opcional)" value={f.nextAction} onChangeText={set('nextAction')} placeholder="Contactar al cliente" maxLength={240} />
        </>
      ) : null}

      {step === 2 ? (
        <>
          <Notice tone="info">{`Lee al cliente cada texto antes de marcarlo. Se guarda la versión exacta${consentVersion ? ` (${consentVersion})` : ''}, el canal y quién la registró.`}</Notice>
          {options.consentPurposes.map((p) => (
            <Card key={p.code} style={{ padding: 12 }}>
              <Checkbox checked={consents.includes(p.code)} onChange={(v) => setConsents((c) => (v ? [...c, p.code] : c.filter((x) => x !== p.code)))}>
                <View>
                  <T v="h3" style={{ fontSize: 14.5 }}>{`${p.title}${p.required ? ' (obligatoria)' : ' (opcional)'}`}</T>
                  <T v="small" style={{ marginTop: 4 }}>{p.text}</T>
                </View>
              </Checkbox>
            </Card>
          ))}
          <Select label="Canal de captura de la autorización" value={f.captureChannel} options={options.captureChannels} onChange={set('captureChannel')} />
          <Checkbox checked={declared} onChange={setDeclared}>
            <T v="body" style={{ fontSize: 14 }}>{declaration}</T>
          </Checkbox>
        </>
      ) : null}

      {error ? <Notice tone="bad">{error}</Notice> : null}
      <ResultBanner result={result && !result.ok ? result : null} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {step > 0 ? <Button title="Atrás" variant="secondary" onPress={() => { setError(null); setStep(step - 1); }} style={{ flex: 1 }} /> : null}
        {step < 2 ? <Button title="Continuar" onPress={next} style={{ flex: 1 }} /> : <Button title={submitLabel} onPress={submit} loading={pending} style={{ flex: 1.4 }} />}
      </View>
    </View>
  );
}
