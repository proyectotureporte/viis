import type { AliadoAgendaResponse } from '@/lib/movil/contract';
import { CalendarPlus } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { useApi } from '@/services/hooks';
import { HeaderActions } from '@/ui/aliado/HeaderActions';
import { Sheet, TaskForm, TaskList } from '@/ui/aliado/parts';
import { Button, Empty, ErrorState, Loading, Notice, Pill, ResultBanner, Screen, Section, T } from '@/ui/kit';
import { colors, space } from '@/ui/theme';

export default function Agenda() {
  const { data, error, loading, refreshing, refresh, reload } = useApi<AliadoAgendaResponse>('/aliado/agenda');
  const [creating, setCreating] = useState(false);
  const [banner, setBanner] = useState<{ ok: boolean; message: string } | null>(null);

  const right = <HeaderActions />;
  if (loading && !data) return <Screen title="Agenda" right={right} scroll={false}><Loading /></Screen>;
  if (!data) return <Screen title="Agenda" right={right} scroll={false}><ErrorState message={error ?? 'No pudimos cargar tu agenda.'} onRetry={reload} /></Screen>;

  const upcoming = data.days.reduce((n, d) => n + d.tasks.length, 0);

  return (
    <Screen title="Agenda" subtitle={`Hora de Bogotá · ${upcoming} ${upcoming === 1 ? 'actividad' : 'actividades'} en los próximos 7 días`} right={right} refreshing={refreshing} onRefresh={refresh}>
      {error ? <Notice tone="bad">{error}</Notice> : null}
      <Button title="Nueva tarea, cita o llamada" icon={<CalendarPlus size={18} color={colors.navy} />} onPress={() => { setBanner(null); setCreating(true); }} />
      <View style={{ marginTop: space.md }}>
        <ResultBanner result={banner} />
      </View>

      {data.overdue.length ? (
        <Section title="Vencidas" right={<Pill tone="bad">{data.overdue.length}</Pill>}>
          <TaskList tasks={data.overdue} onChanged={reload} onResult={setBanner} />
        </Section>
      ) : null}

      {data.days.map((day, i) => (
        <Section key={day.date} title={day.title} right={day.tasks.length ? <Pill tone={i === 0 ? 'info' : 'gray'}>{day.tasks.length}</Pill> : undefined}>
          {day.tasks.length ? <TaskList tasks={day.tasks} onChanged={reload} onResult={setBanner} /> : <T v="small">{i === 0 ? 'Nada pendiente para hoy.' : 'Sin actividades.'}</T>}
        </Section>
      ))}

      {data.laterCount ? (
        <View style={{ marginTop: space.lg }}>
          <Notice tone="info">{data.laterCount === 1 ? 'Hay 1 actividad programada' : `Hay ${data.laterCount} actividades programadas`} después de estos 7 días.</Notice>
        </View>
      ) : null}

      <Section title="Cerradas recientemente">
        {data.done.length ? <TaskList tasks={data.done} onChanged={reload} onResult={setBanner} /> : <Empty>Aquí verás las últimas actividades hechas o canceladas.</Empty>}
      </Section>

      <Sheet visible={creating} title="Nueva actividad" onClose={() => setCreating(false)}>
        <TaskForm
          kinds={data.kinds}
          caseOptions={data.caseOptions}
          onSaved={(res) => {
            setCreating(false);
            setBanner(res);
            reload();
          }}
        />
      </Sheet>
    </Screen>
  );
}
