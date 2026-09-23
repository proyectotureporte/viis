import { router } from 'expo-router';
import { ArrowUpRight, Eye, Flag } from 'lucide-react-native';
import { View } from 'react-native';
import { fecha, fechaHora, pct, pesos, pesosCortos } from '@/services/format';
import { Button, Card, Confidence, Empty, Notice, Pill, Section, Select, T } from '@/ui/kit';
import { colors, fonts, space } from '@/ui/theme';
import { useEmpresa } from '../context';
import { useDialog } from '../dialogs';
import { routes } from '../nav';
import { LabelPill, Line, Pills, SlaPill } from '../ui';
import type { CasoCtx } from './types';

export function Resumen({ d, act, pending }: CasoCtx) {
  const { can } = useEmpresa();
  const dialog = useDialog();
  const c = d.case;
  // El texto del servidor termina con notas técnicas de la API (nombres de campos): se muestran solo las reglas.
  const filingRules = d.timeline.filingRules.split(/\s+Desembolsado exige/)[0];

  async function changeStage(to: string) {
    const label = d.timeline.allowedTransitions.find((t) => t.value === to)?.label ?? to;
    const fields = [
      ...(to === 'DISBURSED' ? [{ name: 'disbursedAmount', label: 'Monto desembolsado', kind: 'money' as const, required: true, initial: c.amount ? String(c.amount).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '' }] : []),
      ...(to === 'WITHDRAWN' ? [{ name: 'withdrawReason', label: 'Causa del desistimiento', required: true, minLength: 3, placeholder: 'Ej. Consiguió mejor tasa con su banco', maxLength: 240 }] : []),
      { name: 'note', label: 'Nota', kind: 'multiline' as const, maxLength: 500 },
    ];
    const v = await dialog.ask({
      title: `Pasar a “${label}”`,
      message: `${c.code}: ${c.stage.label} → ${label}. El cliente y el aliado reciben el aviso.`,
      warning: to === 'WITHDRAWN' ? 'El desistimiento cierra el caso.' : to === 'FILED' ? filingRules : undefined,
      confirmLabel: 'Cambiar etapa',
      destructive: to === 'WITHDRAWN',
      fields,
    });
    if (v) await act('/etapa', { to, ...v });
  }

  async function setAssignee(assigneeId: string) {
    const name = assigneeId ? d.options.staff.find((u) => u.id === assigneeId)?.name : 'Sin responsable';
    if (await dialog.confirm({ title: 'Cambiar responsable', message: `${c.code} quedará a cargo de: ${name}.`, confirmLabel: 'Asignar' })) await act('/responsable', { assigneeId });
  }

  async function setPriority(priority: string) {
    await act('/prioridad', { priority });
  }

  async function setEntity(entityId: string) {
    await act('/entidad', { entityId });
  }

  async function nextAction() {
    const v = await dialog.ask({ title: 'Siguiente acción', confirmLabel: 'Guardar', fields: [{ name: 'nextAction', label: 'Qué sigue en el caso', required: true, minLength: 3, maxLength: 240, initial: c.nextAction ?? '' }] });
    if (v) await act('/siguiente-accion', v);
  }

  async function escalate() {
    const v = await dialog.ask({ title: 'Escalar caso', message: 'Coordinación recibe un aviso y el caso queda marcado como escalado.', confirmLabel: 'Escalar', destructive: true, fields: [{ name: 'reason', label: 'Motivo', kind: 'multiline', required: true, minLength: 5, maxLength: 300 }] });
    if (v) await act('/escalar', v);
  }

  async function reveal() {
    const ok = await dialog.confirm({
      title: 'Ver documento y teléfono completos',
      message: 'Solo consúltalos si los necesitas para gestionar el caso.',
      warning: 'Cada consulta queda registrada en la bitácora con tu nombre, fecha y hora (person.document_viewed).',
      confirmLabel: 'Ver datos',
    });
    if (ok) await act('/documento-completo', {});
  }

  return (
    <>
      <Section title="Etapa">
        <Card>
          <Pills>
            <LabelPill label={c.stage} />
            <SlaPill sla={c.sla} />
            <LabelPill label={c.priority} prefix="Prioridad" />
            {c.escalatedAt ? <Pill tone="bad">{`Escalado ${fecha(c.escalatedAt)}`}</Pill> : null}
          </Pills>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: space.md }}>
            {d.timeline.pipeline.map((p) => (
              <View key={p.stage} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: p.state === 'now' ? colors.navy : p.state === 'done' ? colors.okSoft : colors.mist }}>
                <T v="small" style={{ fontSize: 11.5, color: p.state === 'now' ? colors.white : p.state === 'done' ? '#08755f' : colors.muted, fontFamily: p.state === 'now' ? fonts.bold : fonts.body }}>{p.label}</T>
              </View>
            ))}
          </View>
          <T v="small" style={{ marginTop: space.sm }}>{`En esta etapa desde ${fechaHora(c.stageAt)}`}</T>
          {c.withdrawReason ? <T v="small" style={{ color: colors.danger }}>{`Causa del desistimiento: ${c.withdrawReason}`}</T> : null}
          {c.disbursedAmount ? <T v="small">{`Desembolsado: ${pesos(c.disbursedAmount)}`}</T> : null}
          {d.can.stage && !c.closed && d.timeline.allowedTransitions.length ? (
            <View style={{ marginTop: space.md }}>
              <Select label="Cambiar etapa a…" value={null} options={d.timeline.allowedTransitions} onChange={changeStage} placeholder="Elige la etapa destino" />
              <T v="small" style={{ marginTop: 6 }}>{filingRules}</T>
            </View>
          ) : null}
          {c.closed ? <Notice tone="info">Caso cerrado: no admite cambios de etapa.</Notice> : null}
        </Card>
      </Section>

      <Section title="Gestión">
        <Card style={{ gap: space.md }}>
          {!c.assignee && d.can.stage && !c.closed ? <Button small title="Tomar caso" onPress={() => act('/tomar', {})} loading={pending} /> : null}
          {d.can.assign ? (
            <Select label="Responsable" value={c.assignee?.id ?? ''} options={[{ value: '', label: 'Sin responsable' }, ...d.options.staff.map((u) => ({ value: u.id, label: u.name, hint: u.roleLabel }))]} onChange={setAssignee} />
          ) : (
            <Line label="Responsable" value={c.assignee?.name ?? 'Sin responsable'} />
          )}
          {d.can.assign ? <Select label="Prioridad" value={c.priority.code} options={d.options.priorities} onChange={setPriority} /> : <Line label="Prioridad" value={c.priority.label} />}
          {d.can.stage ? <Select label="Entidad financiera" value={c.entity?.id ?? ''} options={[{ value: '', label: 'Sin definir' }, ...d.options.entities]} onChange={setEntity} /> : <Line label="Entidad" value={c.entity?.name ?? 'Sin definir'} />}
          <View>
            <T v="small" style={{ fontFamily: fonts.semibold }}>Siguiente acción</T>
            <T>{c.nextAction ?? 'Sin definir'}</T>
            {d.can.note ? <Button small variant="secondary" title="Editar siguiente acción" onPress={nextAction} style={{ marginTop: 8, alignSelf: 'flex-start' }} /> : null}
          </View>
          {d.can.escalate && !c.closed ? <Button small variant="danger" title="Escalar a coordinación" icon={<Flag size={16} color={colors.white} />} onPress={escalate} loading={pending} /> : null}
        </Card>
        <Card>
          <Line label="Producto" value={c.product.label} />
          <Line label="Canal" value={c.channel.label} />
          <Line label="Monto" value={c.amount ? pesos(c.amount) : '—'} />
          {c.ally.org ? <Line label="Aliado" value={`${c.ally.org.name} (${c.ally.org.tier})`} /> : null}
          {c.ally.user ? <Line label="Usuario aliado" value={c.ally.user.name} /> : null}
          <Line label="Creado" value={fechaHora(c.createdAt)} />
        </Card>
      </Section>

      <Section title="Cliente">
        <Card>
          <T v="h3">{d.client.name}</T>
          <Line label="Documento" value={`${d.client.documentType.label} ···${d.client.documentLast4}`} />
          <Line label="Correo" value={d.client.email ?? '—'} />
          <Line label="Teléfono" value={d.client.hasPhone ? 'Registrado (oculto)' : 'Sin teléfono'} />
          <Line label="Ciudad" value={d.client.city ?? '—'} />
          <Line label="Cuenta OpenV" value={d.client.account === 'ACTIVE' ? 'Activa' : d.client.account === 'INACTIVE' ? 'Inactiva' : 'Sin cuenta'} />
          {d.client.allyProtectionUntil ? <Line label="Titularidad aliado" value={`Hasta ${fecha(d.client.allyProtectionUntil)}`} /> : null}
          <View style={{ gap: 8, marginTop: space.md }}>
            {d.can.revealDocument ? <Button small variant="secondary" title="Ver documento y teléfono completos" icon={<Eye size={16} color={colors.ink} />} onPress={reveal} /> : null}
            {can('person.read') ? <Button small variant="secondary" title="Abrir ficha del cliente" icon={<ArrowUpRight size={16} color={colors.ink} />} onPress={() => router.push(routes.cliente(d.client.personId))} /> : null}
          </View>
        </Card>
      </Section>

      <Section title="Hogar e ingresos">
        <Card>
          <Line label="Ingreso mensual" value={d.household.monthlyIncome !== null ? pesos(d.household.monthlyIncome) : '—'} />
          <Line label="Gastos mensuales" value={d.household.monthlyExpenses !== null ? pesos(d.household.monthlyExpenses) : '—'} />
          <Line label="Margen mensual" value={d.household.monthlyMargin !== null ? pesos(d.household.monthlyMargin) : '—'} strong />
          <Line label="Ahorros" value={d.household.savings !== null ? pesos(d.household.savings) : '—'} />
          {d.household.goals ? <T v="small" style={{ marginTop: 4 }}>{`Objetivos: ${d.household.goals}`}</T> : null}
          <Confidence level={d.household.confidence.code} />
        </Card>
      </Section>

      <Section title="Inmuebles">
        {d.properties.length === 0 ? <Empty>Sin inmuebles registrados.</Empty> : null}
        {d.properties.map((p) => (
          <Card key={p.id}>
            <T v="h3">{p.alias}</T>
            <T v="small">{[p.kind, p.city, p.stratum ? `estrato ${p.stratum}` : null, p.areaM2 ? `${p.areaM2} m²` : null, p.isVis ? 'VIS' : null].filter(Boolean).join(' · ')}</T>
            {p.valuation ? (
              <>
                <T v="big" style={{ fontSize: 22, marginTop: 6 }}>{pesosCortos(p.valuation.value)}</T>
                {p.valuation.low !== null && p.valuation.high !== null ? <T v="small">{`Rango ${pesosCortos(p.valuation.low)} – ${pesosCortos(p.valuation.high)}`}</T> : null}
                <Confidence level={p.valuation.confidence.code} source={p.valuation.source} asOf={fecha(p.valuation.asOf)} />
              </>
            ) : (
              <T v="small">Sin valoración.</T>
            )}
          </Card>
        ))}
      </Section>

      <Section title="Créditos">
        {d.loans.length === 0 ? <Empty>Sin créditos registrados.</Empty> : null}
        {d.loans.map((l) => (
          <Card key={l.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <T v="h3" style={{ flex: 1 }}>{l.alias}</T>
              {!l.active ? <Pill tone="gray">Inactivo</Pill> : null}
            </View>
            <T v="small">{`${l.entityName ?? 'Entidad sin definir'} · ${l.system.label}`}</T>
            <Line label="Saldo" value={`${pesos(l.balance)} (${fecha(l.balanceAsOf)})`} strong />
            <Line label="Tasa EA" value={pct(l.rateEa, 2)} />
            <Line label="Plazo" value={`${l.paidInstallments} de ${l.termMonths} cuotas`} />
            <Line label="Desembolso" value={`${pesos(l.originalAmount)} · ${fecha(l.disbursedAt)}`} />
            <Line label="Seguros mensuales" value={pesos(l.monthlyInsurance)} />
            <Confidence level={l.confidence.code} source={l.source} />
          </Card>
        ))}
      </Section>

      <Section title="Consentimientos">
        <Card style={{ gap: 10 }}>
          {d.consents.map((c2) => (
            <View key={c2.purpose} style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <T v="h3" style={{ fontSize: 14.5 }}>{`${c2.title}${c2.required ? ' (obligatorio)' : ''}`}</T>
                <T v="small">{c2.active ? `Versión ${c2.textVersion ?? '—'} · ${fechaHora(c2.grantedAt)} · ${c2.channel ?? ''}${c2.capturedBy ? ` · ${c2.capturedBy}` : ''}` : 'No otorgado'}</T>
              </View>
              <Pill tone={c2.active ? 'ok' : c2.required ? 'bad' : 'gray'}>{c2.active ? 'Vigente' : 'Sin autorización'}</Pill>
            </View>
          ))}
          {d.revokedConsents.length ? <T v="small">{`${d.revokedConsents.length} ${d.revokedConsents.length === 1 ? 'autorización revocada' : 'autorizaciones revocadas'} en el historial (ver ficha del cliente).`}</T> : null}
        </Card>
      </Section>

      <Section title="Comisión">
        {d.commissionNote ? <Notice tone="info">{d.commissionNote}</Notice> : null}
        {d.commissions.map((cm) => (
          <Card key={cm.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T v="h3">{`${cm.rule.name} v${cm.rule.version}`}</T>
              <LabelPill label={cm.status} />
            </View>
            <Line label="Base" value={pesos(cm.baseAmount)} />
            <Line label="Porcentaje" value={pct(cm.percent, 2)} />
            <Line label="Bruto" value={pesos(cm.gross)} />
            <Line label="Retención" value={pesos(cm.withholding)} />
            <Line label="Neto" value={pesos(cm.net)} strong />
            <Line label="Pago esperado" value={fecha(cm.expectedPayAt)} />
            {cm.paymentRef ? <Line label="Referencia de pago" value={cm.paymentRef} /> : null}
            {cm.reverseReason ? <T v="small" style={{ color: colors.danger }}>{`Reversada: ${cm.reverseReason}`}</T> : null}
          </Card>
        ))}
      </Section>
    </>
  );
}
