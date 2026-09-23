import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import type { AliadosResponse, AllyStatsView } from '@/lib/movil/contract-empresa';
import { pct, pesosCortos } from '@/services/format';
import { useAction } from '@/services/hooks';
import { Button, Card, Empty, Notice, Pill, Progress, ResultBanner, T } from '@/ui/kit';
import { colors, fonts, space } from '@/ui/theme';
import { useLoad } from '../hooks';
import { routes } from '../nav';
import { OrgForm } from '../OrgForm';
import { LabelPill, Loadable, Page, Pills, Stat, StatGrid } from '../ui';
import type { AreaProps } from './types';

const ratio = (v: number | null) => (v === null ? '—' : pct(v, 0));

export function AllyStats({ s }: { s: AllyStatsView }) {
  return (
    <StatGrid>
      <Stat label="Puntaje" value={s.score === null ? 'Sin datos' : String(Math.round(s.score))} sub="de 100" />
      <Stat label="Conversión" value={ratio(s.conversion)} sub={`${s.disbursed} de ${s.cases} casos`} />
      <Stat label="Calidad documental" value={ratio(s.docQuality)} sub={`${s.docsFirstApproved} de ${s.docsReviewed} a la primera`} />
      <Stat label="Desistimiento" value={ratio(s.withdrawalRate)} sub={`${s.withdrawn} casos`} tone={s.withdrawalRate !== null && s.withdrawalRate > 0.3 ? 'bad' : undefined} />
      <Stat label="Desembolsado" value={pesosCortos(s.disbursedSum)} sub={`Este mes ${pesosCortos(s.monthSum)}`} />
    </StatGrid>
  );
}

export function AliadosArea({ tab, title, header }: AreaProps) {
  const q = useLoad<AliadosResponse>('/empresa/aliados');
  const action = useAction();
  const [creating, setCreating] = useState(false);

  return (
    <Page tab={tab} title={title} refreshing={q.refreshing} onRefresh={q.refresh}>
      {header}
      <ResultBanner result={action.result} />
      <Loadable q={q}>
        {(d) => (
          <>
            <Button title="Nueva organización aliada" icon={<Plus size={18} color={colors.navy} />} onPress={() => { action.clear(); setCreating(true); }} />
            <View style={{ marginTop: space.md }}>
              <Notice tone="info">{`Ranking responsable: ${d.scoreDefinition} Se necesitan al menos ${d.minCasesForRanking} casos para tener posición.`}</Notice>
            </View>
            <View style={{ gap: space.md, marginTop: space.md }}>
              {d.rows.length === 0 ? <Empty>Aún no hay organizaciones aliadas.</Empty> : null}
              {d.rows.map((o) => (
                <Card key={o.id} onPress={() => router.push(routes.aliado(o.id))} style={!o.active ? { opacity: 0.7 } : undefined}>
                  <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                    <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: o.rank ? colors.navy : colors.mist, alignItems: 'center', justifyContent: 'center' }}>
                      <T style={{ fontFamily: fonts.bold, color: o.rank ? colors.white : colors.muted }}>{o.rank ? `#${o.rank}` : '—'}</T>
                    </View>
                    <View style={{ flex: 1 }}>
                      <T v="h3">{o.name}</T>
                      <T v="small">{[o.kind.label, o.territory, o.tier].filter(Boolean).join(' · ')}</T>
                    </View>
                    <T v="big" style={{ fontSize: 22 }}>{o.stats.score === null ? '—' : Math.round(o.stats.score)}</T>
                  </View>
                  <Pills style={{ marginTop: 8 }}>
                    {!o.active ? <Pill tone="gray">Inactiva</Pill> : null}
                    {o.smallSample ? <Pill tone="wait">Muestra pequeña</Pill> : null}
                    <LabelPill label={{ code: 'U', label: `${o.users.active}/${o.users.total} usuarios activos`, tone: 'gray' }} />
                  </Pills>
                  <T v="small" style={{ marginTop: 6 }}>{`Conversión ${ratio(o.stats.conversion)} · calidad doc. ${ratio(o.stats.docQuality)} · desistimiento ${ratio(o.stats.withdrawalRate)} · ${o.stats.disbursed} desembolsos`}</T>
                  {o.monthlyGoal ? (
                    <>
                      <Progress value={(o.goalRatio ?? 0) * 100} />
                      <T v="small">{`Meta del mes: ${pesosCortos(o.stats.monthSum)} de ${pesosCortos(o.monthlyGoal)} (${ratio(o.goalRatio)})`}</T>
                    </>
                  ) : null}
                </Card>
              ))}
            </View>
            <OrgForm
              visible={creating}
              title="Nueva organización aliada"
              onClose={() => setCreating(false)}
              kinds={d.kinds}
              tiers={d.tiers}
              pending={action.pending}
              onSubmit={async (v) => {
                const res = await action.run('/empresa/aliados', v);
                if (res.ok) q.reload();
                return res;
              }}
            />
          </>
        )}
      </Loadable>
    </Page>
  );
}
