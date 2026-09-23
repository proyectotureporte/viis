import type { CatalogosResponse } from '@/lib/movil/contract';
import { router } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useApi, useAction } from '@/services/hooks';
import { soloDigitos } from '@/services/format';
import { Button, Card, Checkbox, ErrorState, Field, Loading, MoneyField, Notice, ResultBanner, Screen, Select, T } from '@/ui/kit';
import { colors, fonts, space } from '@/ui/theme';

interface ConsentimientosResponse {
  ok: true;
  version: string;
  purposes: { code: string; title: string; text: string; required: boolean }[];
}

const PASOS = ['Datos personales', 'Producto y monto', 'Autorizaciones'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[+\d][\d\s()-]{6,}$/;

export default function NuevoCliente() {
  const catalogos = useApi<CatalogosResponse>('/aliado/catalogos');
  const textos = useApi<ConsentimientosResponse>('/auth/consentimientos');
  const { run, pending, result } = useAction();
  const [step, setStep] = useState(0);
  const [f, setF] = useState({ documentType: 'CC', documentNumber: '', firstName: '', lastName: '', email: '', phone: '', city: '', monthlyIncome: '', product: '', amount: '' });
  const [consents, setConsents] = useState<string[]>([]);
  const [declaration, setDeclaration] = useState(false);
  const [invite, setInvite] = useState(true);
  const [touched, setTouched] = useState(false);
  const set = (key: keyof typeof f) => (value: string) => setF((prev) => ({ ...prev, [key]: value }));

  if ((catalogos.loading && !catalogos.data) || (textos.loading && !textos.data)) return <Screen scroll={false}><Loading /></Screen>;
  if (!catalogos.data || !textos.data) {
    return (
      <Screen scroll={false}>
        <ErrorState message={catalogos.error ?? textos.error ?? 'No pudimos cargar el formulario.'} onRetry={() => { catalogos.reload(); textos.reload(); }} />
      </Screen>
    );
  }

  const docDigits = f.documentNumber.replace(/[^0-9A-Za-z]/g, '');
  const errors: Record<string, string | undefined> = {
    documentNumber: docDigits.length < 5 || docDigits.length > 20 ? 'Entre 5 y 20 caracteres.' : undefined,
    firstName: f.firstName.trim() ? undefined : 'Escribe los nombres.',
    lastName: f.lastName.trim() ? undefined : 'Escribe los apellidos.',
    email: f.email.trim() && !EMAIL.test(f.email.trim()) ? 'Correo electrónico inválido.' : undefined,
    phone: f.phone.trim() && !PHONE.test(f.phone.trim()) ? 'Celular inválido.' : undefined,
    product: f.product ? undefined : 'Elige el producto.',
  };
  const stepFields = [['documentNumber', 'firstName', 'lastName', 'email', 'phone'], ['product'], []][step];
  const stepValid = stepFields.every((k) => !errors[k]);
  const show = (k: string) => (touched ? errors[k] : undefined);
  const hasRequired = textos.data.purposes.filter((p) => p.required).every((p) => consents.includes(p.code));

  function next() {
    setTouched(true);
    if (!stepValid) return;
    setTouched(false);
    setStep((x) => x + 1);
  }

  async function submit() {
    const res = await run('/aliado/clientes', {
      documentType: f.documentType,
      documentNumber: f.documentNumber.trim(),
      firstName: f.firstName.trim(),
      lastName: f.lastName.trim(),
      email: f.email.trim() || undefined,
      phone: f.phone.trim() || undefined,
      city: f.city.trim() || undefined,
      monthlyIncome: f.monthlyIncome ? String(soloDigitos(f.monthlyIncome)) : undefined,
      product: f.product,
      amount: f.amount ? String(soloDigitos(f.amount)) : undefined,
      consents,
      declaration,
      invite: invite && Boolean(f.email.trim()),
    });
    if (res.ok && typeof res.id === 'string') {
      router.replace({ pathname: '/(aliado)/clientes/[id]', params: { id: res.id } });
    }
  }

  const ownership = result && !result.ok && /protegido por otro aliado|intentos con clientes protegidos/i.test(result.message);
  const toggle = (code: string, value: boolean) => setConsents((prev) => (value ? [...prev, code] : prev.filter((c) => c !== code)));

  return (
    <Screen>
      <View style={s.steps} accessibilityRole="progressbar" accessibilityLabel={`Paso ${step + 1} de ${PASOS.length}: ${PASOS[step]}`}>
        {PASOS.map((label, i) => (
          <View key={label} style={{ flex: 1, gap: 6 }}>
            <View style={[s.bar, i <= step && { backgroundColor: colors.mint }]} />
            <Text style={[s.stepLabel, i === step && { color: colors.ink, fontFamily: fonts.bold }]} numberOfLines={1}>{i + 1}. {label}</Text>
          </View>
        ))}
      </View>

      {step === 0 ? (
        <Card style={{ gap: space.md }}>
          <T v="h2">Datos personales</T>
          <T v="small">Si el cliente ya existe en OpenV lo vinculamos sin duplicarlo. El documento se guarda cifrado; después solo verás los últimos 4.</T>
          <Select label="Tipo de documento" value={f.documentType} onChange={set('documentType')} options={catalogos.data.documentIdTypes.map((d) => ({ value: d.code, label: d.label }))} />
          <Field label="Número de documento" value={f.documentNumber} onChangeText={set('documentNumber')} keyboardType={f.documentType === 'PA' ? 'default' : 'number-pad'} autoCapitalize="characters" autoComplete="off" maxLength={20} error={show('documentNumber')} />
          <Field label="Nombres" value={f.firstName} onChangeText={set('firstName')} autoComplete="off" maxLength={120} error={show('firstName')} />
          <Field label="Apellidos" value={f.lastName} onChangeText={set('lastName')} autoComplete="off" maxLength={120} error={show('lastName')} />
          <Field label="Correo electrónico (opcional)" value={f.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" autoComplete="off" maxLength={320} error={show('email')} />
          <Field label="Celular (opcional)" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" placeholder="300 123 4567" maxLength={30} error={show('phone')} />
          <Field label="Ciudad (opcional)" value={f.city} onChangeText={set('city')} maxLength={120} />
          <MoneyField label="Ingreso mensual (opcional)" value={f.monthlyIncome} onChangeText={set('monthlyIncome')} placeholder="4.500.000" hint="Declarado por el cliente, en pesos." />
          <Button title="Continuar" onPress={next} />
        </Card>
      ) : null}

      {step === 1 ? (
        <Card style={{ gap: space.md }}>
          <T v="h2">Producto y monto</T>
          <Select label="Producto" value={f.product} onChange={set('product')} placeholder="Elige una opción" options={catalogos.data.products.map((p) => ({ value: p.code, label: p.label }))} />
          {show('product') ? <T v="small" style={{ color: colors.danger }}>{show('product')}</T> : null}
          <MoneyField label="Monto estimado (opcional)" value={f.amount} onChangeText={set('amount')} placeholder="180.000.000" hint="Una estimación: la entidad define el monto aprobado." />
          <Button title="Continuar" onPress={next} />
          <Button title="Atrás" variant="secondary" onPress={() => setStep(0)} />
        </Card>
      ) : null}

      {step === 2 ? (
        <View style={{ gap: space.md }}>
          <Card style={{ gap: space.md }}>
            <T v="h2">Autorizaciones del cliente</T>
            <T v="small">Versión {textos.data.version}. Lee cada texto al cliente o compártelo con él. Marca solo lo que autorizó.</T>
            {textos.data.purposes.map((p) => (
              <Checkbox key={p.code} checked={consents.includes(p.code)} onChange={(v) => toggle(p.code, v)}>
                <View style={{ gap: 4 }}>
                  <T v="h3">{p.title} {p.required ? '(obligatoria)' : '(opcional)'}</T>
                  <T v="small" style={{ color: colors.ink }}>{p.text}</T>
                  {p.code === 'ENTIDADES' ? <T v="small" style={{ fontStyle: 'italic' }}>Sin esta autorización el caso no se podrá radicar.</T> : null}
                </View>
              </Checkbox>
            ))}
          </Card>
          <Card style={{ gap: space.md }}>
            <Checkbox checked={declaration} onChange={setDeclaration}>
              <T style={{ fontSize: 14 }}>
                <Text style={{ fontFamily: fonts.bold }}>El cliente me autorizó expresamente y conservo la evidencia.</Text> Entiendo que esta declaración queda registrada a mi nombre en la bitácora.
              </T>
            </Checkbox>
            {f.email.trim() ? (
              <Checkbox checked={invite} onChange={setInvite}>
                <T style={{ fontSize: 14 }}>Si el cliente aún no tiene cuenta, enviarle una invitación a {f.email.trim()} para crearla y seguir su caso.</T>
              </Checkbox>
            ) : (
              <T v="small">Sin correo no se puede invitar al cliente a la app; podrás invitarlo después desde su ficha.</T>
            )}
          </Card>
          {!hasRequired ? <Notice tone="info">La autorización de tratamiento de datos es obligatoria para registrar al cliente.</Notice> : null}
          {ownership ? (
            <Notice tone="bad">
              Titularidad: este cliente está protegido por otra organización aliada durante 180 días desde su registro. No se creó ningún caso y el intento quedó en la bitácora. Si crees que es un error, escribe a contacto@viis.app.
            </Notice>
          ) : (
            <ResultBanner result={result && !result.ok ? result : null} />
          )}
          <Button title="Registrar cliente y abrir caso" icon={<Check size={18} color={colors.navy} />} onPress={submit} loading={pending} disabled={!hasRequired || !declaration} />
          <Button title="Atrás" variant="secondary" onPress={() => setStep(1)} />
          {result && !result.ok && !ownership ? <Button title="Revisar datos personales" variant="secondary" onPress={() => setStep(0)} /> : null}
        </View>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  steps: { flexDirection: 'row', gap: 8, marginBottom: space.lg },
  bar: { height: 5, borderRadius: 3, backgroundColor: colors.line },
  stepLabel: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.muted },
});
