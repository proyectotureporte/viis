import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Eye, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import type { ClienteFichaResponse } from '@/lib/movil/contract-empresa';
import { fecha, fechaHora, pct, pesos, pesosCortos } from '@/services/format';
import { useAction } from '@/services/hooks';
import { Button, Card, Confidence, Empty, Notice, Pill, Section, T } from '@/ui/kit';
import { colors, space } from '@/ui/theme';
import { useDialog } from '@/ui/empresa/dialogs';
import { viewDocument } from '@/ui/empresa/files';
import { useLoad } from '@/ui/empresa/hooks';
import { routes } from '@/ui/empresa/nav';
import { LabelPill, Line, Loadable, Page, Pills, ResultFooter, SlaPill } from '@/ui/empresa/ui';

/** Ficha 360 del cliente: casos, créditos, inmuebles, documentos, solicitudes y autorizaciones. */
export default function ClienteFicha() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useLoad<ClienteFichaResponse>(`/empresa/clientes/${id}`);
  const action = useAction();
  const dialog = useDialog();
  const [local, setLocal] = useState<{ ok: boolean; message: string } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const result = local ?? action.result;

  async function run(path: string, body: Record<string, unknown> = {}) {
    setLocal(null);
    const res = await action.run(path, body);
    if (res.ok) q.reload();
    return res;
  }

  async function reveal() {
    const ok = await dialog.confirm({
      title: 'Ver documento y teléfono completos',
      message: 'Solo consúltalos si los necesitas para la gestión.',
      warning: 'La consulta queda registrada en la bitácora con tu nombre, fecha y hora.',
      confirmLabel: 'Ver datos',
    });
    if (ok) await run(`/empresa/clientes/${id}/documento-completo`);
  }

  async function revoke(d: ClienteFichaResponse, purpose: string, title: string, required: boolean) {
    const v = await dialog.ask({
      title: `Revocar: ${title}`,
      message: 'Registra la revocación solo con la solicitud del titular como evidencia.',
      warning: required ? 'Es una autorización obligatoria: sin ella no se puede contactar ni gestionar al cliente.' : undefined,
      confirmLabel: 'Revocar',
      destructive: true,
      fields: [
        { name: 'channel', label: 'Canal de la solicitud', kind: 'select', required: true, options: d.revokeChannels },
        { name: 'evidence', label: 'Evidencia (qué pidió, cuándo y por dónde)', kind: 'multiline', required: true, minLength: 5, maxLength: 1000 },
      ],
    });
    if (v) await run(`/empresa/clientes/${id}/consentimientos/revocar`, { purpose, ...v });
  }

  async function open(docId: string, name: string) {
    setOpening(docId);
    setLocal(await viewDocument(docId, name));
    setOpening(null);
  }

  return (
    <>
      <Stack.Screen options={{ title: q.data?.person.name ?? 'Ficha del cliente' }} />
      <Page refreshing={q.refreshing} onRefresh={q.refresh} footer={result ? <ResultFooter result={result} onClose={() => { setLocal(null); action.clear(); }} /> : undefined}>
        <Loadable q={q}>
          {(d) => (
            <>
              <T v="title" style={{ fontSize: 23 }}>{d.person.name}</T>
              <T v="muted">{`${d.person.documentType.label} ···${d.person.documentLast4} · cliente desde ${fecha(d.person.createdAt)}`}</T>
              {d.missingTreatmentConsent ? (
                <View style={{ marginTop: space.md }}>
                  <Notice tone="bad">Sin autorización vigente de tratamiento de datos: no contactar ni gestionar.</Notice>
                </View>
              ) : null}

              <Section title="Datos">
                <Card>
                  <Line label="Correo" value={d.person.email ?? '—'} />
                  <Line label="Teléfono" value={d.person.hasPhone ? 'Registrado (oculto)' : 'Sin teléfono'} />
                  <Line label="Ciudad" value={d.person.city ?? '—'} />
                  <Line label="Cuenta OpenV" value={d.person.account ? `${d.person.account.active ? 'Activa' : 'Inactiva'}${d.person.account.lastLoginAt ? ` · último ingreso ${fechaHora(d.person.account.lastLoginAt)}` : ''}` : 'Sin cuenta'} />
                  {d.person.allyProtectionUntil ? <Line label="Titularidad aliado" value={`Hasta ${fecha(d.person.allyProtectionUntil)}`} /> : null}
                  <Button small variant="secondary" title="Ver documento y teléfono completos" icon={<Eye size={16} color={colors.ink} />} onPress={reveal} style={{ marginTop: space.md }} />
                </Card>
                <Card>
                  <T v="eyebrow">Hogar</T>
                  <Line label="Ingreso mensual" value={d.household.monthlyIncome !== null ? pesos(d.household.monthlyIncome) : '—'} />
                  <Line label="Gastos mensuales" value={d.household.monthlyExpenses !== null ? pesos(d.household.monthlyExpenses) : '—'} />
                  <Line label="Ahorros" value={d.household.savings !== null ? pesos(d.household.savings) : '—'} />
                  {d.household.goals ? <T v="small">{`Objetivos: ${d.household.goals}`}</T> : null}
                  <Confidence level={d.household.confidence.code} />
                </Card>
              </Section>

              <Section title="Casos" right={d.can.createCase ? <Button small variant="secondary" title="Nuevo" icon={<Plus size={15} color={colors.ink} />} onPress={() => router.push(routes.nuevoCaso())} /> : undefined}>
                {d.cases.length === 0 ? <Empty>Sin casos en tu alcance.</Empty> : null}
                {d.cases.map((c) => (
                  <Card key={c.id} onPress={() => router.push(routes.caso(c.id))}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                      <T v="h3" style={{ flex: 1 }}>{`${c.code} · ${c.product.label}`}</T>
                      <LabelPill label={c.priority} />
                    </View>
                    <Pills style={{ marginTop: 6 }}>
                      <LabelPill label={c.stage} />
                      <SlaPill sla={c.sla} />
                      <LabelPill label={c.channel} />
                    </Pills>
                    <T v="small" style={{ marginTop: 4 }}>{[c.assignee ?? 'Sin responsable', c.entity, c.allyOrgName, c.amount ? pesosCortos(c.amount) : null, fecha(c.createdAt)].filter(Boolean).join(' · ')}</T>
                  </Card>
                ))}
              </Section>

              <Section title="Créditos">
                {d.loans.length === 0 ? <Empty>Sin créditos registrados.</Empty> : null}
                {d.loans.map((l) => (
                  <Card key={l.id}>
                    <T v="h3">{`${l.alias}${l.active ? '' : ' (inactivo)'}`}</T>
                    <T v="small">{`${l.entityName ?? 'Entidad sin definir'} · ${l.system.label} · ${pct(l.rateEa, 2)} EA`}</T>
                    <Line label="Saldo" value={`${pesos(l.balance)} (${fecha(l.balanceAsOf)})`} strong />
                    <Line label="Cuotas pagadas" value={`${l.paidInstallments} de ${l.termMonths}`} />
                    <Confidence level={l.confidence.code} source={l.source} />
                  </Card>
                ))}
              </Section>

              <Section title="Inmuebles">
                {d.properties.length === 0 ? <Empty>Sin inmuebles registrados.</Empty> : null}
                {d.properties.map((p) => (
                  <Card key={p.id}>
                    <T v="h3">{p.alias}</T>
                    <T v="small">{[p.kind, p.city, p.stratum ? `estrato ${p.stratum}` : null, p.areaM2 ? `${p.areaM2} m²` : null].filter(Boolean).join(' · ')}</T>
                    {p.valuation ? (
                      <>
                        <T v="h3" style={{ marginTop: 4 }}>{pesosCortos(p.valuation.value)}</T>
                        <Confidence level={p.valuation.confidence.code} source={p.valuation.source} asOf={fecha(p.valuation.asOf)} />
                      </>
                    ) : null}
                  </Card>
                ))}
              </Section>

              <Section title="Documentos">
                {d.documents.length === 0 ? <Empty>Sin documentos cargados.</Empty> : null}
                {d.documents.map((doc) => (
                  <Card key={doc.id}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                      <T v="h3" style={{ flex: 1 }}>{`${doc.type} · v${doc.version}`}</T>
                      <LabelPill label={doc.status} />
                    </View>
                    <T v="small">{`Cargado ${fechaHora(doc.createdAt)}${doc.expiresAt ? ` · vence ${fecha(doc.expiresAt)}` : ''}`}</T>
                    {doc.rejectReason ? <T v="small" style={{ color: colors.danger }}>{`Rechazo: ${doc.rejectReason}`}</T> : null}
                    {doc.viewable ? <Button small variant="secondary" title="Ver documento" icon={<Eye size={16} color={colors.ink} />} loading={opening === doc.id} onPress={() => open(doc.id, doc.type)} style={{ marginTop: space.sm, alignSelf: 'flex-start' }} /> : null}
                  </Card>
                ))}
              </Section>

              <Section title="Solicitudes">
                {d.requests.length === 0 ? <Empty>Sin solicitudes.</Empty> : null}
                {d.requests.map((r) => (
                  <Card key={r.id} onPress={d.can.openRequests ? () => router.push(routes.solicitud(r.id)) : undefined}>
                    <T v="h3">{`${r.code} · ${r.subject}`}</T>
                    <Pills style={{ marginTop: 6 }}>
                      <LabelPill label={r.kind} />
                      <LabelPill label={r.status} />
                    </Pills>
                    <T v="small" style={{ marginTop: 4 }}>{`Creada ${fechaHora(r.createdAt)} · SLA ${fechaHora(r.slaDueAt)}`}</T>
                  </Card>
                ))}
              </Section>

              <Section title="Autorizaciones">
                {d.consents.map((c) => (
                  <Card key={c.purpose}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <T v="h3" style={{ flex: 1, fontSize: 14.5 }}>{`${c.title}${c.required ? ' (obligatoria)' : ''}`}</T>
                      <Pill tone={c.active ? 'ok' : c.required ? 'bad' : 'gray'}>{c.active ? 'Vigente' : 'Sin autorización'}</Pill>
                    </View>
                    {c.active ? <T v="small">{`Versión ${c.textVersion ?? '—'} · ${fechaHora(c.grantedAt)} · ${c.channel ?? ''}${c.capturedBy ? ` · ${c.capturedBy}` : ''}`}</T> : null}
                    {c.active && d.can.revokeConsent ? <Button small variant="danger" title="Revocar" onPress={() => revoke(d, c.purpose, c.title, c.required)} style={{ marginTop: space.sm, alignSelf: 'flex-start' }} /> : null}
                  </Card>
                ))}
                {d.consentHistory.length ? (
                  <Card>
                    <T v="eyebrow">Historial</T>
                    {d.consentHistory.map((h) => (
                      <View key={h.id} style={{ marginTop: 8 }}>
                        <T v="small" style={{ color: colors.ink }}>{`${h.title} · v${h.textVersion} · hash ${h.textHashPrefix}`}</T>
                        <T v="small">{`Otorgada ${fechaHora(h.grantedAt)} (${h.channel}, ${h.capturedBy})${h.revokedAt ? ` · revocada ${fechaHora(h.revokedAt)}${h.revokedBy ? ` por ${h.revokedBy}` : ''}` : ''}`}</T>
                      </View>
                    ))}
                  </Card>
                ) : null}
              </Section>
            </>
          )}
        </Loadable>
      </Page>
    </>
  );
}
