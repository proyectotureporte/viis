import type { AliadoAcademiaResponse } from '@/lib/movil/contract';
import { router } from 'expo-router';
import { View } from 'react-native';
import { useApi } from '@/services/hooks';
import { fecha } from '@/services/format';
import { toneOf } from '@/ui/aliado/parts';
import { Card, Empty, ErrorState, Loading, Notice, Pill, Progress, Screen, Section, T } from '@/ui/kit';
import { colors, space } from '@/ui/theme';

export default function Academia() {
  const { data, error, loading, refreshing, refresh, reload } = useApi<AliadoAcademiaResponse>('/aliado/academia');

  if (loading && !data) return <Screen scroll={false}><Loading /></Screen>;
  if (!data) return <Screen scroll={false}><ErrorState message={error ?? 'No pudimos cargar la Academia.'} onRetry={reload} /></Screen>;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      {error ? <Notice tone="bad">{error}</Notice> : null}
      {data.blocking.length ? (
        <Notice tone="bad">No puedes radicar casos hasta aprobar: {data.blocking.join(', ')}.</Notice>
      ) : (
        <Notice tone="info">Tus certificaciones críticas están al día. Renuévalas antes de que venzan para no bloquear la radicación.</Notice>
      )}
      <T v="muted" style={{ marginTop: space.md }}>{data.validCount} de {data.courses.length} cursos con certificación vigente.</T>

      <Section title="Cursos">
        {data.courses.length === 0 ? <Empty>No hay cursos disponibles.</Empty> : null}
        {data.courses.map((c) => (
          <Card key={c.id} onPress={() => router.push({ pathname: '/(aliado)/mas/academia/[slug]', params: { slug: c.slug } })} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
              <T v="h3" style={{ flex: 1 }}>{c.title}</T>
              <Pill tone={toneOf(c.state.tone)}>{c.state.label}</Pill>
            </View>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {c.critical ? <Pill tone="bad">Crítico</Pill> : null}
              {c.mandatory ? <Pill tone="info">Obligatorio</Pill> : null}
            </View>
            <T v="small" numberOfLines={3}>{c.summary}</T>
            <Progress value={c.progress} color={c.progress >= 100 ? colors.mintDeep : colors.mint} />
            <T v="small">
              {c.lessons} lecciones · {c.progress} % visto · aprueba con {c.passScore}
              {c.bestScore !== null ? ` · mejor nota ${c.bestScore}` : ''}
              {c.certification ? ` · certificado ${c.certification.code} vence ${fecha(c.certification.expiresAt)}` : ''}
            </T>
          </Card>
        ))}
      </Section>
    </Screen>
  );
}
