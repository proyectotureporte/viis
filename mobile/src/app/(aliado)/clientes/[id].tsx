import type { AliadoFichaResponse, AllyChecklistItem, CatalogosResponse } from '@/lib/movil/contract';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Check, Circle, CircleDot, Eye, MessageCircle, Phone, PhoneCall, Send, Upload } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { api, ApiError } from '@/services/api';
import { useAction, useApi } from '@/services/hooks';
import { fecha, fechaHora, pct, pesos } from '@/services/format';
import { CaptureSheet } from '@/ui/aliado/CaptureSheet';
import { downloadAndShare, DownloadError } from '@/ui/aliado/files';
import { Sheet, SlaPill, TaskForm, TaskList, toneOf } from '@/ui/aliado/parts';
import { Button, Card, Checkbox, Empty, ErrorState, Field, KeyValue, Loading, Notice, Pill, ResultBanner, Screen, Section, Segmented, Select, T } from '@/ui/kit';
import { colors, fonts, radius, space } from '@/ui/theme';

const CAUSAS = [
  'No le interesa por ahora',
  'Tomó otra oferta o entidad',
  'No cumple requisitos de ingresos',
  'No completó los documentos',
  'Costos o tasa no convenientes',
  'No fue posible contactarlo',
  'Otra causa',
];

/** Número para wa.me: solo dígitos y con indicativo de Colombia si es un celular local. */
function whatsappNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 && digits.startsWith('3') ? `57${digits}` : digits;
}

export default function FichaCliente() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, refreshing, refresh, reload } = useApi<AliadoFichaResponse>(id ? `/aliado/clientes/${id}` : null);
  const catalogos = useApi<CatalogosResponse>('/aliado/catalogos');
  const top = useAction();
  const inviteAction = useAction();
  const [phone, setPhone] = useState<string | null>(null);
  const [move, setMove] = useState<'CONTACTED' | 'PROFILED' | 'WITHDRAWN' | null>(null);
  const [note, setNote] = useState('');
  const [cause, setCause] = useState('');
  const [otherCause, setOtherCause] = useState('');
  const stageAction = useAction();
  const [upload, setUpload] = useState<AllyChecklistItem['type'] | null>(null);
  const [docBanner, setDocBanner] = useState<{ ok: boolean; message: string } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [tips, setTips] = useState(false);
  const interaction = useAction();
  const [channel, setChannel] = useState('LLAMADA');
  const [summary, setSummary] = useState('');
  const [visible, setVisible] = useState(false);
  const [newTask, setNewTask] = useState(false);
  const [taskBanner, setTaskBanner] = useState<{ ok: boolean; message: string } | null>(null);
  const consentAction = useAction();
  const [pendingConsents, setPendingConsents] = useState<string[]>([]);
  const [consentDeclaration, setConsentDeclaration] = useState(false);

  const title = data ? data.client.name : 'Ficha del cliente';
  const header = <Stack.Screen options={{ title: data ? data.case.code : 'Ficha del cliente' }} />;

  if (loading && !data) return <Screen scroll={false}>{header}<Loading /></Screen>;
  if (!data) return <Screen scroll={false}>{header}<ErrorState message={error ?? 'No encontramos ese caso en tu cartera.'} onRetry={reload} /></Screen>;

  const { case: c, client } = data;
  const channels = catalogos.data?.interactionChannels ?? [
    { code: 'LLAMADA', label: 'Llamada' },
    { code: 'VISITA', label: 'Visita' },
    { code: 'WHATSAPP', label: 'WhatsApp' },
  ];
  const kinds = catalogos.data?.taskKinds ?? [];

  async function revealPhone() {
    const res = await top.run(`/aliado/clientes/${c.id}/telefono`);
    if (res.ok) {
      setPhone(res.message);
      top.clear();
    }
  }

  async function submitMove() {
    if (!move) return;
    const reason = cause === 'Otra causa' ? otherCause.trim() : cause;
    const body = move === 'WITHDRAWN' ? { to: move, reason } : { to: move, note: note.trim() || undefined };
    const res = await stageAction.run(`/aliado/clientes/${c.id}/etapa`, body);
    if (res.ok) {
      setMove(null);
      setNote('');
      setCause('');
      setOtherCause('');
      reload();
    }
  }

  async function openDocument(docId: string, fileName: string) {
    setOpening(docId);
    setDocBanner(null);
    try {
      const link = await api.get<{ url: string }>(`/aliado/documentos/${docId}/enlace`);
      await downloadAndShare(link.url, { fileName: `${fileName.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_').slice(0, 80) || 'documento'}.pdf`, mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Ver documento' });
    } catch (e) {
      setDocBanner({ ok: false, message: e instanceof ApiError || e instanceof DownloadError ? e.message : 'No pudimos abrir el documento.' });
    } finally {
      setOpening(null);
    }
  }

  async function addInteraction() {
    const res = await interaction.run(`/aliado/clientes/${c.id}/interacciones`, { channel, summary: summary.trim(), visibleToClient: visible });
    if (res.ok) {
      setSummary('');
      setVisible(false);
      reload();
    }
  }

  async function addConsents() {
    const res = await consentAction.run(`/aliado/clientes/${c.id}/consentimientos`, { consents: pendingConsents, declaration: consentDeclaration });
    if (res.ok) {
      setPendingConsents([]);
      setConsentDeclaration(false);
      reload();
    }
  }

  const withdrawReason = cause === 'Otra causa' ? otherCause.trim() : cause;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      {header}
      {error ? <Notice tone="bad">{error}</Notice> : null}

      {/* Encabezado */}
      <Card dark style={{ gap: 8 }}>
        <T v="title" style={{ color: colors.white }}>{title}</T>
        <T style={{ color: '#cfe3e8' }}>{c.code} · {c.productLabel}{c.entityName ? ` · ${c.entityName}` : ''}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <Pill tone={c.stage === 'WITHDRAWN' ? 'bad' : c.closed ? 'ok' : 'info'}>{c.stageLabel}</Pill>
          <SlaPill sla={c.sla} />
          {data.requiredMissing ? <Pill tone="wait">{data.requiredMissing === 1 ? '1 documento requerido pendiente' : `${data.requiredMissing} documentos requeridos pendientes`}</Pill> : null}
        </View>
        {c.nextAction && !c.closed ? <T style={{ color: colors.white, fontSize: 14 }}>Siguiente paso: {c.nextAction}</T> : null}
      </Card>

      {data.blocking.length ? (
        <View style={{ marginTop: space.md }}>
          <Notice tone="bad">No se puede radicar: el aliado responsable tiene certificaciones críticas pendientes ({data.blocking.join(', ')}).</Notice>
        </View>
      ) : null}

      {/* Datos */}
      <Section title="Datos del cliente">
        <Card style={{ gap: space.md }}>
          <KeyValue
            items={[
              ['Documento', `${client.documentTypeLabel} ···${client.documentLast4}`],
              ['Correo', client.email ?? 'Sin correo'],
              ['Ciudad', client.city ?? '—'],
              ['Ingreso mensual', client.monthlyIncome ? pesos(client.monthlyIncome) : '—'],
              ['Cuenta en OpenV', client.hasAccount ? 'Sí' : 'No'],
              ['Registrado por', [data.registeredBy.ally, data.registeredBy.organization].filter(Boolean).join(' · ') || '—'],
            ]}
          />
          {client.hasPhone ? (
            phone ? (
              <View style={{ gap: 8 }}>
                <View style={s.phone}>
                  <Phone size={18} color={colors.navy} />
                  <T v="h3" selectable style={{ flex: 1 }}>{phone}</T>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button title="Llamar" style={{ flex: 1 }} icon={<PhoneCall size={17} color={colors.navy} />} onPress={() => Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`)} />
                  <Button title="WhatsApp" variant="secondary" style={{ flex: 1 }} icon={<MessageCircle size={17} color={colors.ink} />} onPress={() => Linking.openURL(`https://wa.me/${whatsappNumber(phone)}`)} />
                </View>
                <T v="small">La consulta del celular quedó registrada en la bitácora. Registra abajo la interacción.</T>
              </View>
            ) : (
              <Button title="Ver teléfono" variant="secondary" icon={<Phone size={17} color={colors.ink} />} loading={top.pending} onPress={revealPhone} />
            )
          ) : (
            <T v="small">El cliente no tiene celular registrado.</T>
          )}
          {client.canInvite && c.stage !== 'WITHDRAWN' ? <Button title="Reenviar invitación al cliente" variant="secondary" icon={<Send size={16} color={colors.ink} />} loading={inviteAction.pending} onPress={() => inviteAction.run(`/aliado/clientes/${c.id}/invitar`)} /> : null}
          <ResultBanner result={top.result} />
          <ResultBanner result={inviteAction.result} />
        </Card>
      </Section>

      {/* Etapa */}
      <Section title="Etapa del caso" right={<Pill tone={c.stage === 'WITHDRAWN' ? 'bad' : 'info'}>{c.stageLabel}</Pill>}>
        <Card style={{ gap: space.md }}>
          <View style={{ gap: 2 }}>
            {c.pipeline.map((p, i) => (
              <View key={p.stage} style={s.step}>
                <View style={{ alignItems: 'center', width: 22 }}>
                  {p.done ? <Check size={18} color={colors.mintDeep} /> : p.current ? <CircleDot size={18} color={c.stage === 'WITHDRAWN' ? colors.muted : colors.navy} /> : <Circle size={16} color="#9aacb3" />}
                  {i < c.pipeline.length - 1 ? <View style={[s.stepLine, p.done && { backgroundColor: colors.mint }]} /> : null}
                </View>
                <Text style={[s.stepText, p.current && { fontFamily: fonts.bold, color: colors.ink }, p.done && { color: colors.ink }]}>{p.label}</Text>
              </View>
            ))}
            {c.stage === 'WITHDRAWN' ? <Pill tone="bad">Desistido</Pill> : null}
          </View>
          <T v="small">
            En esta etapa desde {fecha(c.stageAt)}
            {c.amount ? ` · monto estimado ${pesos(c.amount)}` : ''}
            {c.disbursedAmount ? ` · desembolsado ${pesos(c.disbursedAmount)}` : ''}
          </T>
          {c.withdrawReason ? <T v="small" style={{ color: colors.danger }}>Causa del desistimiento: {c.withdrawReason}</T> : null}
          {c.allowedMoves.length ? (
            <View style={{ gap: 8 }}>
              {c.allowedMoves.includes('CONTACTED') ? <Button title="Marcar contactado" onPress={() => { stageAction.clear(); setMove('CONTACTED'); }} /> : null}
              {c.allowedMoves.includes('PROFILED') ? <Button title="Marcar perfilado" onPress={() => { stageAction.clear(); setMove('PROFILED'); }} /> : null}
              {c.allowedMoves.includes('WITHDRAWN') ? <Button title="El cliente desiste" variant="secondary" onPress={() => { stageAction.clear(); setMove('WITHDRAWN'); }} /> : null}
            </View>
          ) : null}
          {!c.closed ? <T v="small">Desde Perfilado en adelante, el equipo OpenV mueve las etapas (documentación, radicación, aprobación, firma y desembolso).</T> : null}
          <ResultBanner result={stageAction.result && stageAction.result.ok ? stageAction.result : null} />
        </Card>
        <Card style={{ gap: 10 }}>
          <T v="h3">Línea de tiempo</T>
          {data.timeline.length === 0 ? <T v="small">Sin movimientos registrados.</T> : null}
          {[...data.timeline].reverse().map((t) => (
            <View key={t.id} style={s.timeline}>
              <View style={s.dot} />
              <View style={{ flex: 1 }}>
                <T v="h3" style={{ fontSize: 14.5 }}>{t.fromLabel ? `${t.fromLabel} → ${t.toLabel}` : t.toLabel}</T>
                <T v="small">{fechaHora(t.createdAt)}{t.by ? ` · ${t.by}` : ''}{t.note ? ` · ${t.note}` : ''}</T>
              </View>
            </View>
          ))}
        </Card>
      </Section>

      {/* Documentos */}
      <Section title="Qué falta" right={<Pill tone={data.requiredMissing ? 'wait' : 'ok'}>{data.requiredMissing ? `${data.requiredMissing} pendientes` : 'Requeridos al día'}</Pill>}>
        <Pressable onPress={() => setTips((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: tips }}>
          <Text style={s.link}>{tips ? 'Ocultar consejos' : 'Consejos para una foto o escaneo legible'}</Text>
        </Pressable>
        {tips ? (
          <Notice tone="info">
            Documento completo sobre fondo oscuro y plano, luz de frente sin reflejos, cédula por ambas caras, PDF/JPG/PNG de máximo 10 MB. Certificados laborales, de deuda y de tradición con máximo 30 días.
          </Notice>
        ) : null}
        <ResultBanner result={docBanner} />
        {data.checklist.length === 0 ? <Empty>No hay documentos configurados para este producto.</Empty> : null}
        {data.checklist.map(({ type, latest, canUpload }) => (
          <Card key={type.id} style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <T v="h3">{type.name}{type.required ? '' : ' (opcional)'}</T>
                {type.description ? <T v="small">{type.description}</T> : null}
              </View>
              {latest ? <Pill tone={toneOf(latest.status.tone)}>{latest.status.label}</Pill> : <Pill tone="gray">Pendiente</Pill>}
            </View>
            {latest ? (
              <T v="small">
                Versión {latest.version} · {fecha(latest.createdAt)}
                {latest.expiresAt ? ` · vence ${fecha(latest.expiresAt)}` : ''}
              </T>
            ) : null}
            {latest?.rejectReason ? <T v="small" style={{ color: colors.danger }}>Rechazado: {latest.rejectReason}</T> : null}
            {latest && !latest.viewable ? <T v="small">En verificación antivirus; podrás verlo en unos minutos.</T> : null}
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {latest?.viewable ? <Button small variant="secondary" title="Ver" icon={<Eye size={15} color={colors.ink} />} loading={opening === latest.id} onPress={() => openDocument(latest.id, latest.fileName)} /> : null}
              {canUpload ? <Button small title={latest ? 'Cargar nueva versión' : 'Cargar'} icon={<Upload size={15} color={colors.navy} />} onPress={() => { setDocBanner(null); setUpload(type); }} /> : null}
            </View>
          </Card>
        ))}
      </Section>

      {/* Interacciones */}
      <Section title="Interacciones">
        <Card style={{ gap: space.md }}>
          <Segmented value={channel} options={channels.map((ch) => ({ value: ch.code, label: ch.label }))} onChange={setChannel} />
          <Field label="Resumen" value={summary} onChangeText={setSummary} multiline maxLength={2000} placeholder="Qué se habló, qué se acordó y cuál es el siguiente paso." />
          <Checkbox checked={visible} onChange={setVisible}>Visible para el cliente en su portal</Checkbox>
          <ResultBanner result={interaction.result} />
          <Button title="Registrar interacción" loading={interaction.pending} disabled={summary.trim().length < 3} onPress={addInteraction} />
        </Card>
        {data.interactions.length === 0 ? <Empty>Aún no hay interacciones registradas. Lo que no está registrado, no ocurrió.</Empty> : null}
        {data.interactions.map((i) => (
          <Card key={i.id} style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <T v="h3">{i.channelLabel}</T>
              {i.visibleToClient ? <Pill tone="info">Visible al cliente</Pill> : null}
            </View>
            <T v="small">{fechaHora(i.createdAt)} · {i.by}</T>
            <T style={{ fontSize: 14 }}>{i.summary}</T>
          </Card>
        ))}
      </Section>

      {/* Tareas */}
      <Section title="Tareas del caso" right={!c.closed && kinds.length ? <Button small title="Nueva" onPress={() => { setTaskBanner(null); setNewTask(true); }} /> : undefined}>
        <ResultBanner result={taskBanner} />
        <TaskList tasks={data.tasks} onChanged={reload} onResult={setTaskBanner} showCase={false} empty="Sin tareas. Agenda la próxima llamada o cita para no perder el hilo." />
      </Section>

      {/* Ofertas */}
      <Section title="Ofertas">
        {data.offers.length === 0 ? <Empty>Todavía no hay ofertas. Las registra el equipo OpenV cuando la entidad responde.</Empty> : null}
        {data.offers.map((o) => (
          <Card key={o.id} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
              <T v="h3" style={{ flex: 1 }}>{o.entityName} · {pct(o.rateEa, 2)} E.A.{o.system === 'UVR' ? ' + UVR' : ''}</T>
              {o.acceptedAt ? <Pill tone="ok">Aceptada {fecha(o.acceptedAt)}</Pill> : o.expired ? <Pill tone="gray">Vencida</Pill> : <Pill tone="info">En estudio</Pill>}
            </View>
            <KeyValue items={o.summary.map((l) => [l.label, l.value] as [string, string])} />
            <T v="small">Fuente: {o.source}{o.validUntil ? ` · vigente hasta ${fecha(o.validUntil)}` : ''}</T>
            {o.conditions ? <T v="small">{o.conditions}</T> : null}
          </Card>
        ))}
      </Section>

      {/* Comisión */}
      <Section title="Comisión">
        {data.commission ? (
          <Card style={{ gap: 8 }} onPress={() => router.push('/(aliado)/comisiones')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <T v="big" style={{ fontSize: 22, flex: 1 }}>{pesos(data.commission.net)}</T>
              <Pill tone={toneOf(data.commission.status.tone)}>{data.commission.status.label}</Pill>
            </View>
            <T v="small">
              {pesos(data.commission.baseAmount)} × {pct(data.commission.percent, 2)} = {pesos(data.commission.gross)} − retención {pesos(data.commission.withholding)} = {pesos(data.commission.net)} netos
            </T>
            <T v="small">Pago previsto: {fecha(data.commission.expectedPayAt)} · Ver liquidación completa ›</T>
          </Card>
        ) : (
          <Empty>La comisión se causa automáticamente cuando el caso se desembolsa, con la regla vigente al crear el caso.</Empty>
        )}
      </Section>

      {/* Autorizaciones */}
      <Section title="Autorizaciones">
        <Card style={{ gap: space.md }}>
          {data.consents.active.length ? (
            data.consents.active.map((a) => <KeyValue key={a.code} items={[[a.title, fecha(a.grantedAt)]]} />)
          ) : (
            <T v="small">El cliente no tiene autorizaciones vigentes.</T>
          )}
          {!data.consents.entidades ? <Notice tone="wait">Sin la autorización para compartir el expediente con entidades financieras el caso no se podrá radicar.</Notice> : null}
        </Card>
        {data.consents.pending.length ? (
          <Card style={{ gap: space.md }}>
            <T v="h3">Registrar autorizaciones pendientes</T>
            {data.consents.pending.map((p) => (
              <Checkbox key={p.code} checked={pendingConsents.includes(p.code)} onChange={(v) => setPendingConsents((prev) => (v ? [...prev, p.code] : prev.filter((x) => x !== p.code)))}>
                <View style={{ gap: 4 }}>
                  <T v="h3">{p.title}</T>
                  <T v="small" style={{ color: colors.ink }}>{p.text}</T>
                </View>
              </Checkbox>
            ))}
            <Checkbox checked={consentDeclaration} onChange={setConsentDeclaration}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: colors.ink }}>El cliente me autorizó expresamente y conservo la evidencia.</Text>
            </Checkbox>
            <ResultBanner result={consentAction.result} />
            <Button title="Registrar autorización" loading={consentAction.pending} disabled={!pendingConsents.length || !consentDeclaration} onPress={addConsents} />
          </Card>
        ) : null}
      </Section>

      {/* Hojas */}
      <CaptureSheet
        visible={Boolean(upload)}
        caseId={c.id}
        type={upload}
        onClose={() => setUpload(null)}
        onUploaded={(message) => {
          setUpload(null);
          setDocBanner({ ok: true, message });
          reload();
        }}
      />

      <Sheet visible={move === 'CONTACTED' || move === 'PROFILED'} title={move === 'CONTACTED' ? 'Marcar contactado' : 'Marcar perfilado'} onClose={() => setMove(null)}>
        <T v="muted">{move === 'CONTACTED' ? 'Confirma que ya hablaste con el cliente.' : 'Confirma que ya conoces su necesidad, ingresos y producto.'} El cambio queda en la línea de tiempo.</T>
        <Field label="Nota (opcional)" value={note} onChangeText={setNote} multiline maxLength={500} />
        <ResultBanner result={stageAction.result && !stageAction.result.ok ? stageAction.result : null} />
        <Button title="Confirmar" loading={stageAction.pending} onPress={submitMove} />
      </Sheet>

      <Sheet visible={move === 'WITHDRAWN'} title="El cliente desiste" onClose={() => setMove(null)}>
        <Select label="Causa (obligatoria)" value={cause} onChange={setCause} placeholder="Elige la causa" options={CAUSAS.map((x) => ({ value: x, label: x }))} />
        {cause === 'Otra causa' ? <Field label="Describe la causa" value={otherCause} onChangeText={setOtherCause} maxLength={240} /> : null}
        <Notice tone="bad">El caso quedará como desistido con su causa en la bitácora. Solo el equipo OpenV podrá reabrirlo.</Notice>
        <ResultBanner result={stageAction.result && !stageAction.result.ok ? stageAction.result : null} />
        <Button title="Marcar desistido" variant="danger" loading={stageAction.pending} disabled={withdrawReason.length < 5} onPress={submitMove} />
      </Sheet>

      <Sheet visible={newTask} title="Nueva tarea o cita" onClose={() => setNewTask(false)}>
        {kinds.length ? (
          <TaskForm
            kinds={kinds}
            opportunityId={c.id}
            onSaved={(res) => {
              setNewTask(false);
              setTaskBanner(res);
              reload();
            }}
          />
        ) : null}
      </Sheet>

    </Screen>
  );
}

const s = StyleSheet.create({
  phone: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: colors.sky },
  step: { flexDirection: 'row', gap: 10, minHeight: 30 },
  stepLine: { width: 2, flex: 1, backgroundColor: colors.line, marginVertical: 2 },
  stepText: { fontFamily: fonts.body, fontSize: 14.5, color: colors.muted, paddingTop: 1 },
  timeline: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.mint, marginTop: 6 },
  link: { color: colors.blue, fontFamily: fonts.semibold, fontSize: 14 },
});
