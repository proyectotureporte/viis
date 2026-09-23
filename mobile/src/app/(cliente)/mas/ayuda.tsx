import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { ChevronDown, Copy, Mail } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import type { GestionesResponse } from '@/lib/movil/contract';
import { useAction, useApi } from '@/services/hooks';
import { fecha } from '@/services/format';
import { toneOf } from '@/ui/cliente/components';
import { go, R } from '@/ui/cliente/nav';
import { Button, Card, Field, Pill, ResultBanner, Row, Screen, Section, Segmented, Select, T } from '@/ui/kit';
import { colors, fonts } from '@/ui/theme';

const SUPPORT = 'contacto@viis.app';

const ADVISOR_SUBJECTS = [
  'Quiero revisar mi crédito con un asesor',
  'Quiero revisar los seguros de mi crédito',
  'Quiero evaluar una compra de cartera',
  'Quiero comprar vivienda',
  'Quiero entender una simulación',
];

const FAQ: { q: string; a: string; link?: { label: string; href: string } }[] = [
  {
    q: '¿Puedo abonar a mi crédito de vivienda sin pagar multa?',
    a: 'Sí. La Ley 546 de 1999 (art. 17) establece que los créditos de vivienda de largo plazo pueden prepagarse total o parcialmente en cualquier momento sin penalidad, y que en un abono parcial tú eliges si reduce el plazo o la cuota. Pide a tu entidad que la elección quede por escrito y revisa el siguiente extracto. Antes de abonar, conserva un fondo de emergencia.',
    link: { label: 'Simular un abono', href: R.simular('PREPAYMENT') },
  },
  {
    q: '¿Qué es la UVR y por qué mi cuota sube?',
    a: 'La UVR (Unidad de Valor Real) es una unidad que sigue la inflación; su valor diario lo certifica el Banco de la República. En un crédito en UVR la deuda se expresa en UVR: la cuota en pesos suele arrancar más baja que en un crédito a tasa fija, pero sube cuando hay inflación, y el saldo en pesos puede crecer durante los primeros años. Compara siempre con varios escenarios de inflación.',
    link: { label: 'Comparar pesos vs UVR', href: R.simular('FIXED_VS_UVR') },
  },
  {
    q: '¿Qué es una compra de cartera y cuándo conviene?',
    a: 'Es trasladar tu crédito a otra entidad que paga tu saldo actual y te da un crédito nuevo, idealmente a menor tasa. Tiene costos (estudio de crédito, avalúo, notaría, registro de la nueva hipoteca) y requisitos. Conviene cuando el ahorro neto, después de costos, es positivo y se recupera antes de que planees vender. También puedes pedirle a tu entidad actual que mejore la tasa.',
    link: { label: 'Simular compra de cartera', href: R.simular('PORTFOLIO') },
  },
  {
    q: '¿Qué significa la tasa EA?',
    a: 'Efectiva anual: lo que cuesta el dinero en un año, incluyendo la capitalización mensual. Con una tasa del 12 % EA, el interés de un mes es cerca del 0,95 % del saldo. En “Mi crédito” te mostramos cuánto de cada cuota se va en intereses, en pesos.',
  },
  {
    q: '¿Tengo que tomar los seguros que ofrece el banco?',
    a: 'Los seguros de vida e incendio y terremoto protegen al hogar y a la entidad, y son exigidos en créditos hipotecarios. Puedes contratar una póliza por tu cuenta con coberturas equivalentes y pedir a tu entidad que la acepte. Un asesor puede ayudarte a comparar costo y cobertura.',
  },
  {
    q: '¿Qué pasa si no puedo pagar una cuota?',
    a: 'Actúa antes del vencimiento: habla con tu entidad sobre periodos de gracia, ampliación de plazo o reestructuración. En OpenV activa el Modo Tranquilidad: calculamos tu escenario y una persona te acompaña. Reportar un soporte en OpenV no reemplaza pagarle a tu entidad.',
    link: { label: 'Abrir Modo Tranquilidad', href: R.nuevaSolicitud('HARDSHIP') },
  },
  {
    q: '¿Qué derechos tengo sobre mis datos (habeas data)?',
    a: 'Por la Ley 1581 de 2012 puedes conocer, actualizar, rectificar y pedir la supresión de tus datos, y revocar autorizaciones; la Ley 1266 de 2008 protege tu información financiera y crediticia. Las consultas se responden en máximo 10 días hábiles y los reclamos en máximo 15 días hábiles (prorrogables en los casos que la ley permite).',
    link: { label: 'Crear solicitud de datos personales', href: R.nuevaSolicitud('PRIVACY') },
  },
  {
    q: '¿La valorización de mi vivienda en OpenV es un avalúo?',
    a: 'No. Es una estimación con la fuente y la fecha que indicamos (muchas veces declarada por ti). Para trámites con bancos se necesita un avalúo de un perito inscrito en el Registro Abierto de Avaluadores; puedes solicitarlo desde Mi vivienda.',
    link: { label: 'Ir a Mi vivienda', href: R.vivienda },
  },
  {
    q: '¿Las simulaciones son una oferta?',
    a: 'No. Son estimaciones con los datos y supuestos que mostramos, calculadas con un motor versionado. Las condiciones reales las fija tu entidad por escrito. Cada escenario guardado conserva sus supuestos y se puede descargar en PDF.',
  },
];

export default function Ayuda() {
  const params = useLocalSearchParams<{ seccion?: string }>();
  const { data, refreshing, refresh } = useApi<GestionesResponse>('/cliente/gestiones');
  const [form, setForm] = useState<'asesor' | 'pqr'>(params.seccion === 'pqr' ? 'pqr' : 'asesor');
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const recent = (data?.requests ?? []).filter((r) => ['ADVISOR', 'PQR', 'PRIVACY'].includes(r.kind)).slice(0, 5);
  const sla = (code: string) => data?.requestKinds.find((k) => k.code === code)?.slaHours;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <T v="muted">Una persona del equipo te acompaña. Todo queda registrado con código y tiempo de respuesta.</T>
      <View style={{ marginTop: 14 }}>
        <Segmented value={form} options={[{ value: 'asesor', label: 'Hablar con un asesor' }, { value: 'pqr', label: 'PQR' }]} onChange={(v) => setForm(v as 'asesor' | 'pqr')} />
      </View>
      {form === 'asesor' ? <AdvisorForm slaHours={sla('ADVISOR')} onSent={refresh} /> : <PqrForm slaHours={sla('PQR')} onSent={refresh} />}

      <Section title="Canales">
        <Card>
          <T v="eyebrow">Correo de soporte</T>
          <T v="h3" selectable style={{ marginTop: 4 }}>{SUPPORT}</T>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <Button small variant="secondary" title="Escribir correo" icon={<Mail size={16} color={colors.ink} />} onPress={() => void Linking.openURL(`mailto:${SUPPORT}`).catch(() => undefined)} />
            <Button small variant="secondary" title={copied ? 'Copiado' : 'Copiar'} icon={<Copy size={16} color={colors.ink} />} onPress={async () => { await Clipboard.setStringAsync(SUPPORT); setCopied(true); }} />
          </View>
          <View style={{ gap: 8, marginTop: 14 }}>
            <Row title="Crear una solicitud" subtitle="Con código y seguimiento" onPress={() => go(R.nuevaSolicitud())} />
            <Row title="Mis datos personales" subtitle="Solicitud de habeas data" onPress={() => go(R.nuevaSolicitud('PRIVACY'))} />
            <Row title="Dificultades para pagar" subtitle={`Modo Tranquilidad${sla('HARDSHIP') ? ` · respuesta en ${sla('HARDSHIP')} horas` : ''}`} onPress={() => go(R.nuevaSolicitud('HARDSHIP'))} />
          </View>
          <T v="small" style={{ marginTop: 12 }}>OpenV nunca te pedirá tu contraseña, códigos de verificación ni dinero para pagar tu cuota. Si alguien lo hace a nombre de OpenV, repórtalo a {SUPPORT}.</T>
        </Card>
      </Section>

      <Section title="Tus solicitudes de ayuda">
        {recent.length ? (
          recent.map((r) => <Row key={r.id} title={`${r.code} · ${r.subject}`} subtitle={`${r.kindLabel} · ${fecha(r.createdAt)}`} right={<Pill tone={toneOf(r.status.tone)}>{r.status.label}</Pill>} onPress={() => go(R.solicitud(r.id))} />)
        ) : (
          <T v="small">No tienes solicitudes de ayuda.</T>
        )}
      </Section>

      <Section title="Preguntas frecuentes">
        {FAQ.map((f) => {
          const expanded = open === f.q;
          return (
            <Card key={f.q} style={{ padding: 0 }}>
              <Pressable onPress={() => setOpen(expanded ? null : f.q)} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', padding: 14 }} accessibilityRole="button" accessibilityState={{ expanded }}>
                <T v="h3" style={{ flex: 1 }}>{f.q}</T>
                <ChevronDown size={18} color={colors.muted} style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }} />
              </Pressable>
              {expanded ? (
                <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
                  <T style={{ fontSize: 14.5 }}>{f.a}</T>
                  {f.link ? (
                    <Pressable onPress={() => go(f.link!.href)} accessibilityRole="link">
                      <T style={{ color: colors.blue, fontFamily: fonts.semibold, marginTop: 8 }}>{f.link.label} →</T>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </Card>
          );
        })}
        <T v="small">Información general, no asesoría legal ni financiera personalizada. Para tu caso concreto, habla con un asesor.</T>
      </Section>
    </Screen>
  );
}

function AdvisorForm({ slaHours, onSent }: { slaHours?: number; onSent: () => void }) {
  const [subject, setSubject] = useState(ADVISOR_SUBJECTS[0]);
  const [detail, setDetail] = useState('');
  const action = useAction();
  async function send() {
    const res = await action.run('/cliente/solicitudes', { kind: 'ADVISOR', subject, detail: detail.trim() });
    if (res.ok) {
      setDetail('');
      onSent();
    }
  }
  return (
    <Card style={{ marginTop: 12 }}>
      <T v="small" style={{ marginBottom: 12 }}>Te contactamos en máximo {slaHours ?? 24} horas por el medio que prefieras. Sin costo y sin compromiso.</T>
      <View style={{ gap: 12 }}>
        <Select label="¿Sobre qué quieres hablar?" value={subject} options={ADVISOR_SUBJECTS.map((s) => ({ value: s, label: s }))} onChange={setSubject} />
        <Field label="Cuéntanos un poco más y cómo prefieres que te contactemos" value={detail} onChangeText={setDetail} multiline maxLength={4000} placeholder="Por ejemplo: prefiero una llamada en la tarde." />
        <ResultBanner result={action.result} />
        <Button title="Solicitar asesor" onPress={send} loading={action.pending} disabled={detail.trim().length < 10} />
      </View>
    </Card>
  );
}

function PqrForm({ slaHours, onSent }: { slaHours?: number; onSent: () => void }) {
  const [subject, setSubject] = useState('');
  const [detail, setDetail] = useState('');
  const action = useAction();
  async function send() {
    const res = await action.run('/cliente/solicitudes', { kind: 'PQR', subject: subject.trim(), detail: detail.trim() });
    if (res.ok) {
      setSubject('');
      setDetail('');
      onSent();
    }
  }
  return (
    <Card style={{ marginTop: 12 }}>
      <T v="small" style={{ marginBottom: 12 }}>Respuesta en máximo {slaHours ? Math.round(slaHours / 24) : 15} días. Si tu reclamo es con tu entidad financiera, también puedes acudir a su Defensor del Consumidor Financiero.</T>
      <View style={{ gap: 12 }}>
        <Field label="Asunto" value={subject} onChangeText={setSubject} maxLength={200} placeholder="Ej.: Reclamo por demora en mi solicitud" />
        <Field label="Detalle" value={detail} onChangeText={setDetail} multiline maxLength={4000} placeholder="Qué pasó, cuándo y qué solución esperas." />
        <ResultBanner result={action.result} />
        <Button title="Radicar PQR" onPress={send} loading={action.pending} disabled={subject.trim().length < 4 || detail.trim().length < 10} />
      </View>
    </Card>
  );
}
