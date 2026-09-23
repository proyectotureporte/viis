import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { api } from '@/services/api';
import { AuthLayout } from '@/ui/AuthLayout';
import { Button, Checkbox, Field, ResultBanner, Select, T } from '@/ui/kit';

interface Purpose { code: string; title: string; text: string; required: boolean }

const DOCS = [
  { value: 'CC', label: 'Cédula de ciudadanía' },
  { value: 'CE', label: 'Cédula de extranjería' },
  { value: 'PPT', label: 'Permiso por protección temporal' },
  { value: 'PA', label: 'Pasaporte' },
];

export default function Registro() {
  const [f, setF] = useState({ firstName: '', lastName: '', documentType: 'CC', documentNumber: '', email: '', phone: '', city: '', password: '', confirm: '' });
  const [purposes, setPurposes] = useState<Purpose[]>([]);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    api.get<{ purposes: Purpose[] }>('/auth/consentimientos', { auth: null }).then((r) => setPurposes(r.purposes)).catch(() => setResult({ ok: false, message: 'No pudimos cargar las autorizaciones. Revisa tu conexión.' }));
  }, []);

  async function submit() {
    setPending(true);
    try {
      const consents = Object.fromEntries(purposes.map((p) => [p.code, Boolean(accepted[p.code])]));
      const res = await api.post('/auth/registro', { ...f, ...consents }, { auth: null });
      setResult(res);
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : 'No pudimos crear la cuenta.' });
    } finally {
      setPending(false);
    }
  }

  const requiredOk = purposes.filter((p) => p.required).every((p) => accepted[p.code]);
  return (
    <AuthLayout title="Crea tu cuenta" intro="Entiende, controla y optimiza tu crédito de vivienda. Solo pedimos lo necesario y tú decides qué autorizas.">
      <Field label="Nombres" value={f.firstName} onChangeText={set('firstName')} autoComplete="given-name" />
      <Field label="Apellidos" value={f.lastName} onChangeText={set('lastName')} autoComplete="family-name" />
      <Select label="Tipo de documento" value={f.documentType} options={DOCS} onChange={set('documentType')} />
      <Field label="Número de documento" value={f.documentNumber} onChangeText={set('documentNumber')} keyboardType="number-pad" />
      <Field label="Correo electrónico" value={f.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
      <Field label="Celular" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" autoComplete="tel" />
      <Field label="Ciudad" value={f.city} onChangeText={set('city')} />
      <Field label="Contraseña" value={f.password} onChangeText={set('password')} secureTextEntry autoComplete="new-password" hint="12+ caracteres; mezcla mayúsculas, minúsculas, números o símbolos." />
      <Field label="Repite la contraseña" value={f.confirm} onChangeText={set('confirm')} secureTextEntry autoComplete="new-password" />
      <T v="eyebrow" style={{ marginTop: 8 }}>Autorizaciones</T>
      {purposes.map((p) => (
        <Checkbox key={p.code} checked={Boolean(accepted[p.code])} onChange={(v) => setAccepted((a) => ({ ...a, [p.code]: v }))}>
          <T style={{ fontSize: 13.5, lineHeight: 19 }}><T style={{ fontSize: 13.5, fontWeight: '700' }}>{p.title}{p.required ? ' (obligatoria). ' : ' (opcional). '}</T>{p.text}</T>
        </Checkbox>
      ))}
      <ResultBanner result={result} />
      {result?.ok ? (
        <Button title="Ir a ingresar" onPress={() => router.back()} />
      ) : (
        <Button title="Crear cuenta" onPress={submit} loading={pending} disabled={!requiredOk || !f.email || !f.password} />
      )}
      <Button title="Volver" variant="secondary" onPress={() => router.back()} />
    </AuthLayout>
  );
}
