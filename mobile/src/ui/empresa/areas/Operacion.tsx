import { router } from 'expo-router';
import { CircleCheck, CircleX, Plus, Siren } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import type { OperacionResponse } from '@/lib/movil/contract-empresa';
import { useAuth } from '@/services/auth';
import { fechaHora, pct, pesosCortos } from '@/services/format';
import { useAction } from '@/services/hooks';
import { Button, Card, Empty, Notice, Pill, ResultBanner, Row, Section, T } from '@/ui/kit';
import { colors, fonts, space } from '@/ui/theme';
import { useEmpresa } from '../context';
import { useDialog } from '../dialogs';
import { useLoad } from '../hooks';
import { routes } from '../nav';
import { Bars, Funnel, LabelPill, Loadable, Page, Pills, SlaPill, Stat, StatGrid } from '../ui';

export function OperacionArea() {
  const { user } = useAuth();
  const { can, refreshMenu } = useEmpresa();
  const q = useLoad<OperacionResponse>('/empresa/operacion');
  const action = useAction();
  const dialog = useDialog();

  async function closeTask(id: string, title: string, status: 'DONE' | 'CANCELLED') {
    const ok = await dialog.confirm({
      title: status === 'DONE' ? 'Completar tarea' : 'Cancelar tarea',
      message: `“${title}” quedará ${status === 'DONE' ? 'completada' : 'cancelada'} y registrada en el caso.`,
      confirmLabel: status === 'DONE' ? 'Completar' : 'Cancelar tarea',
      cancelLabel: 'Volver',
      destructive: status === 'CANCELLED',
    });
    if (!ok) return;
    const res = await action.run(`/empresa/tareas/${id}/cerrar`, { status });
    if (res.ok) {
      q.reload();
      void refreshMenu(true);
    }
  }

  return (
    <Page tab title={`Hola, ${user?.firstName ?? ''}`} subtitle={q.data ? `Operación · ${q.data.monthLabel}` : user?.roleLabel} refreshing={q.refreshing} onRefresh={q.refresh}>
      <Loadable q={q}>
        {(d) => (
          <>
            {d.scopeNote ? <Notice tone="info">{d.scopeNote}</Notice> : null}
            <ResultBanner result={action.result} />

            {d.alerts.overdue > 0 || d.alerts.dueSoon > 0 ? (
              <Pressable onPress={() => d.can.readCases && router.navigate(routes.tab('bandeja'))} accessibilityRole="button" accessibilityLabel="Ver casos con SLA en riesgo en la bandeja">
                <Card dark style={{ marginTop: space.md, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <Siren color={colors.mint} size={26} />
                  <View style={{ flex: 1 }}>
                    <T v="h3" style={{ color: colors.white }}>{d.alerts.overdue > 0 ? `${d.alerts.overdue} ${d.alerts.overdue === 1 ? 'caso con SLA vencido' : 'casos con SLA vencido'}` : 'Sin SLA vencidos'}</T>
                    <T v="small" style={{ color: '#b8d4dc' }}>{`${d.alerts.dueSoon} vencen en las próximas ${d.alerts.dueSoonHours} h`}</T>
                  </View>
                </Card>
              </Pressable>
            ) : (
              <Card style={{ marginTop: space.md, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <CircleCheck color={colors.mintDeep} size={22} />
                <T style={{ flex: 1 }}>Sin alertas de SLA: ningún caso vencido ni por vencer en las próximas {d.alerts.dueSoonHours} h.</T>
              </Card>
            )}

            <Section title="Indicadores">
              <StatGrid>
                <Stat label="Pipeline abierto" value={pesosCortos(d.kpis.pipeline.amount)} sub={`${d.kpis.pipeline.count} casos`} />
                <Stat
                  label="Desembolsado en el mes"
                  value={pesosCortos(d.kpis.disbursedMonth.amount)}
                  sub={`${d.kpis.disbursedMonth.count} casos${d.kpis.disbursedMonth.goalRatio !== null ? ` · ${pct(d.kpis.disbursedMonth.goalRatio, 0)} de la meta aliados` : ''}`}
                />
                <Stat label={`Conversión ${d.kpis.conversion.windowDays} d`} value={d.kpis.conversion.ratio === null ? 'Sin datos' : pct(d.kpis.conversion.ratio)} sub={`${d.kpis.conversion.disbursed} de ${d.kpis.conversion.filed} radicados`} />
                <Stat
                  label={`SLA cumplido ${d.kpis.sla.windowDays} d`}
                  value={d.kpis.sla.ratio === null ? 'Sin datos' : pct(d.kpis.sla.ratio)}
                  sub={`Meta ${pct(d.kpis.sla.target, 0)} · ${d.kpis.sla.met}/${d.kpis.sla.closed}`}
                  tone={d.kpis.sla.ratio !== null ? (d.kpis.sla.ratio >= d.kpis.sla.target ? 'ok' : 'bad') : undefined}
                />
              </StatGrid>
              <T v="small">{d.kpis.conversion.definition}</T>
            </Section>

            {d.can.createCase && can('case.create') ? <Button title="Nuevo caso" icon={<Plus size={18} color={colors.navy} />} onPress={() => router.push(routes.nuevoCaso())} style={{ marginTop: space.lg }} /> : null}

            <Section title="Casos urgentes">
              {d.urgentCases.length === 0 ? <Empty>No hay casos críticos o de prioridad alta con SLA en riesgo.</Empty> : null}
              {d.urgentCases.map((c) => (
                <Card key={c.id} onPress={() => router.push(routes.caso(c.id))}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <T v="h3" style={{ flex: 1 }}>{`${c.code} · ${c.clientName}`}</T>
                    <LabelPill label={c.priority} />
                  </View>
                  <Pills style={{ marginTop: 8 }}>
                    <LabelPill label={c.stage} />
                    <SlaPill sla={c.sla} />
                  </Pills>
                  <T v="small" style={{ marginTop: 6 }}>{c.assignee ? `Responsable: ${c.assignee.name}` : 'Sin responsable'}</T>
                </Card>
              ))}
            </Section>

            <Section title="Mis tareas">
              {d.myTasks.length === 0 ? <Empty>No tienes tareas abiertas.</Empty> : null}
              {d.myTasks.map((t) => (
                <Card key={t.id}>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <T v="h3">{t.title}</T>
                      <T v="small" style={{ color: t.overdue ? colors.danger : colors.muted, fontFamily: t.overdue ? fonts.semibold : fonts.body }}>
                        {`${t.overdue ? 'Vencida · ' : 'Vence '}${fechaHora(t.dueAt)}`}
                      </T>
                      {t.case ? (
                        <Pressable onPress={() => router.push(routes.caso(t.case!.id))} accessibilityRole="link">
                          <T v="small" style={{ color: colors.blue, fontFamily: fonts.semibold }}>{`${t.case.code} · ${t.case.clientName}`}</T>
                        </Pressable>
                      ) : null}
                    </View>
                    <LabelPill label={t.kind} />
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: space.md }}>
                    <Button small title="Completar" icon={<CircleCheck size={16} color={colors.navy} />} onPress={() => closeTask(t.id, t.title, 'DONE')} loading={action.pending} style={{ flex: 1 }} />
                    <Button small title="Cancelar" variant="secondary" icon={<CircleX size={16} color={colors.ink} />} onPress={() => closeTask(t.id, t.title, 'CANCELLED')} style={{ flex: 1 }} />
                  </View>
                </Card>
              ))}
            </Section>

            <Section title={`Embudo de ${d.monthLabel}`}>
              <Card>
                <Funnel items={d.funnel.map((f) => ({ label: f.label, value: f.value }))} />
                <T v="small" style={{ marginTop: space.md }}>Casos que alcanzaron cada etapa este mes.</T>
              </Card>
            </Section>

            <Section title="Operación por canal">
              <Card>
                <Bars items={d.byChannel.map((c) => ({ label: c.label, value: c.amount, display: pesosCortos(c.amount), sub: `${c.open} abiertos · ${c.disbursedMonth} desembolsados en el mes (${pesosCortos(c.disbursedMonthAmount)})` }))} />
              </Card>
              <Pills>
                {d.byChannel.map((c) => (
                  <Pill key={c.channel} tone="gray">{`${c.label}: ${c.open}`}</Pill>
                ))}
              </Pills>
            </Section>

            {d.can.readCases ? <Row title="Ir a la bandeja de casos" subtitle="Filtra, asigna y prioriza" onPress={() => router.navigate(routes.tab('bandeja'))} /> : null}
          </>
        )}
      </Loadable>
    </Page>
  );
}
