import type { AliadoResumenResponse } from '@/lib/movil/contract';
import { router } from 'expo-router';
import { GraduationCap, KanbanSquare, ShieldAlert, UserPlus } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { useApi } from '@/services/hooks';
import { fecha, pct, pesosCortos } from '@/services/format';
import { HeaderActions } from '@/ui/aliado/HeaderActions';
import { goToCase, SlaPill, TaskList, toneOf } from '@/ui/aliado/parts';
import { Button, Card, Empty, ErrorState, Grid, Loading, Notice, Pill, Progress, ResultBanner, Row, Screen, Section, T } from '@/ui/kit';
import { colors, fonts, space } from '@/ui/theme';

export default function Resumen() {
  const { data, error, loading, refreshing, refresh, reload } = useApi<AliadoResumenResponse>('/aliado/resumen');
  const [taskBanner, setTaskBanner] = useState<{ ok: boolean; message: string } | null>(null);

  if (loading && !data) return <Screen title="Resumen" right={<HeaderActions />} scroll={false}><Loading /></Screen>;
  if (!data) return <Screen title="Resumen" right={<HeaderActions />} scroll={false}><ErrorState message={error ?? 'No pudimos cargar tu resumen.'} onRetry={reload} /></Screen>;

  const { kpis } = data;
  const sla = data.urgent.filter((u) => u.reason === 'SLA');
  const docs = data.urgent.filter((u) => u.reason === 'DOCUMENTOS');
  const goalPct = kpis.disbursedMonth.goalPct;

  return (
    <Screen
      title={`Hola, ${data.firstName}`}
      subtitle={data.organization ? `${data.organization.name} · ${data.organization.tierLabel}` : 'Tu cartera de hoy'}
      right={<HeaderActions />}
      refreshing={refreshing}
      onRefresh={refresh}
    >
      {error ? <Notice tone="bad">{error}</Notice> : null}

      {data.blocking.length > 0 ? (
        <View style={{ backgroundColor: colors.danger, borderRadius: 16, padding: space.lg, gap: 10, marginBottom: space.md }} accessibilityRole="alert">
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <ShieldAlert color={colors.white} size={22} />
            <T v="h2" style={{ color: colors.white, flex: 1 }}>No puedes radicar casos</T>
          </View>
          <T style={{ color: colors.white }}>
            Tienes {data.blocking.length === 1 ? 'una certificación crítica vencida o pendiente' : `${data.blocking.length} certificaciones críticas vencidas o pendientes`}: {data.blocking.join(', ')}. Apruébala{data.blocking.length === 1 ? '' : 's'} en la Academia para volver a radicar.
          </T>
          <Button title="Ir a la Academia" variant="light" icon={<GraduationCap size={18} color={colors.navy} />} onPress={() => router.push('/(aliado)/mas/academia')} />
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
        <Button title="Nuevo cliente" style={{ flex: 1 }} icon={<UserPlus size={18} color={colors.navy} />} onPress={() => router.push('/(aliado)/clientes/nuevo')} />
        <Button title="Embudo" variant="secondary" style={{ flex: 1 }} icon={<KanbanSquare size={18} color={colors.ink} />} onPress={() => router.push('/(aliado)/mas/embudo')} />
      </View>

      <Grid>
        <Card style={{ flex: 1, minWidth: 150 }}>
          <T v="eyebrow">Cartera en trámite</T>
          <T v="big" style={{ marginTop: 6, fontSize: 24 }}>{pesosCortos(kpis.pipeline.amount)}</T>
          <T v="small">{kpis.pipeline.count === 1 ? '1 caso activo' : `${kpis.pipeline.count} casos activos`}</T>
        </Card>
        <Card style={{ flex: 1, minWidth: 150 }}>
          <T v="eyebrow">Conversión</T>
          <T v="big" style={{ marginTop: 6, fontSize: 24 }}>{kpis.conversion.rate === null ? '—' : pct(kpis.conversion.rate, 0)}</T>
          <T v="small">{kpis.conversion.won} desembolsados de {kpis.conversion.total} · {kpis.conversion.lost} desistidos</T>
        </Card>
      </Grid>

      <Card style={{ marginTop: space.md }}>
        <T v="eyebrow">Desembolsado este mes</T>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 6 }}>
          <T v="big" style={{ fontSize: 24 }}>{pesosCortos(kpis.disbursedMonth.amount)}</T>
          {kpis.disbursedMonth.goal ? <T v="small">meta {pesosCortos(kpis.disbursedMonth.goal)}</T> : null}
        </View>
        {kpis.disbursedMonth.goal ? (
          <>
            <Progress value={(goalPct ?? 0) * 100} color={(goalPct ?? 0) >= 1 ? colors.mintDeep : colors.mint} />
            <T v="small">{pct(goalPct ?? 0, 0)} de la meta mensual de la organización</T>
          </>
        ) : (
          <T v="small" style={{ marginTop: 4 }}>Tu organización aún no definió una meta mensual.</T>
        )}
      </Card>

      <Card style={{ marginTop: space.md }} onPress={() => router.push('/(aliado)/comisiones')}>
        <T v="eyebrow">Comisiones netas</T>
        <View style={{ flexDirection: 'row', marginTop: 8, gap: 8 }}>
          {[
            ['Causadas', kpis.commissions.caused],
            ['Aprobadas', kpis.commissions.approved],
            ['Pagadas', kpis.commissions.paid],
          ].map(([label, value]) => (
            <View key={label as string} style={{ flex: 1 }}>
              <T v="small">{label}</T>
              <T v="h3" style={{ fontFamily: fonts.bold }}>{pesosCortos(value as number)}</T>
            </View>
          ))}
        </View>
        <T v="small" style={{ marginTop: 8 }}>{kpis.commissions.nextPaymentAt ? `Próximo pago previsto: ${fecha(kpis.commissions.nextPaymentAt)}` : 'Sin pagos programados.'}</T>
      </Card>

      <Section title="Urgentes por SLA" right={sla.length ? <Pill tone="bad">{sla.length}</Pill> : undefined}>
        {sla.length === 0 ? <Empty>Ningún caso vence en las próximas 24 horas.</Empty> : null}
        {sla.map((u) => (
          <Card key={u.id} onPress={() => goToCase(u.id)} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <T v="h3" style={{ flex: 1 }} numberOfLines={1}>{u.clientName}</T>
              <SlaPill sla={u.sla} />
            </View>
            <T v="small">{u.code} · {u.productLabel} · {u.stageLabel}</T>
            <T v="small">Pendiente: {u.pending}</T>
          </Card>
        ))}
      </Section>

      <Section title="Faltantes documentales" right={docs.length ? <Pill tone="wait">{docs.length}</Pill> : undefined}>
        {docs.length === 0 ? <Empty>No hay casos con documentos requeridos pendientes.</Empty> : null}
        {docs.map((u) => (
          <Card key={u.id} onPress={() => goToCase(u.id)} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <T v="h3" style={{ flex: 1 }} numberOfLines={1}>{u.clientName}</T>
              <Pill tone="wait">{u.missingDocuments.length === 1 ? '1 falta' : `${u.missingDocuments.length} faltan`}</Pill>
            </View>
            <T v="small">{u.code} · {u.productLabel} · {u.stageLabel}</T>
            <T v="small" numberOfLines={3}>{u.missingDocuments.join(' · ')}</T>
          </Card>
        ))}
      </Section>

      <Section title="Tareas de hoy" right={<Button small variant="secondary" title="Agenda" onPress={() => router.push('/(aliado)/agenda')} />}>
        <ResultBanner result={taskBanner} />
        <TaskList tasks={data.today} onChanged={reload} onResult={setTaskBanner} empty="Sin actividades pendientes para hoy. Agenda la próxima llamada desde la Agenda o la ficha del cliente." />
      </Section>

      {data.certifications.length ? (
        <Section title="Certificaciones">
          {data.certifications.map((c) => (
            <Card key={c.courseId} onPress={() => router.push({ pathname: '/(aliado)/mas/academia/[slug]', params: { slug: c.slug } })} style={{ gap: 6 }}>
              <T v="h3">{c.title}</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <Pill tone={toneOf(c.state.tone)}>{c.state.label}</Pill>
                <T v="small">{c.critical ? 'Crítica para radicar' : 'Obligatoria'}</T>
              </View>
            </Card>
          ))}
        </Section>
      ) : null}

      {data.notices.length ? (
        <Section title="Avisos sin leer">
          {data.notices.map((n) => (
            <Row key={n.id} title={n.title} subtitle={`${n.body} · ${fecha(n.createdAt)}`} dot="info" onPress={() => router.push('/notificaciones')} />
          ))}
        </Section>
      ) : null}
    </Screen>
  );
}
