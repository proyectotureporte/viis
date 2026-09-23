import { View } from 'react-native';
import { fechaHora } from '@/services/format';
import { Card, Empty, Notice, Section, T } from '@/ui/kit';
import { colors } from '@/ui/theme';
import { AuditEventCard } from '../AuditEvent';
import { LabelPill } from '../ui';
import type { CasoCtx } from './types';

export function Bitacora({ d }: CasoCtx) {
  return (
    <>
      <Section title="Línea de tiempo de etapas">
        {d.timeline.changes.length === 0 ? <Empty>Sin cambios de etapa.</Empty> : null}
        <Card style={{ gap: 12 }}>
          {[...d.timeline.changes].reverse().map((c) => (
            <View key={c.id} style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.mint, marginTop: 5 }} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  {c.from ? <LabelPill label={c.from} /> : null}
                  {c.from ? <T v="small">→</T> : null}
                  <LabelPill label={c.to} />
                </View>
                <T v="small" style={{ marginTop: 4 }}>{`${c.by} · ${fechaHora(c.at)}`}</T>
                {c.note ? <T v="small" style={{ color: colors.ink }}>{c.note}</T> : null}
              </View>
            </View>
          ))}
        </Card>
      </Section>
      <Section title="Bitácora del caso" right={<T v="small">Últimos 50 · inmutable</T>}>
        <Notice tone="info">Registro encadenado por hash: nadie puede editarlo ni borrarlo. Toca un evento para ver el antes y el después.</Notice>
        {d.auditLog.length === 0 ? <Empty>Sin eventos.</Empty> : null}
        {d.auditLog.map((e) => (
          <AuditEventCard key={e.id} e={e} compact />
        ))}
      </Section>
    </>
  );
}
