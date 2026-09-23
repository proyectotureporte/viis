import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import type { SolicitudesResponse } from '@/lib/movil/contract-empresa';
import { fechaHora } from '@/services/format';
import { Card, Empty, Select, T } from '@/ui/kit';
import { colors, space } from '@/ui/theme';
import { qs, useLoad } from '../hooks';
import { routes } from '../nav';
import { Chip, ChipRow, LabelPill, Loadable, Page, Pager, Pills, SlaPill } from '../ui';
import type { AreaProps } from './types';

export function SolicitudesArea({ tab, title, header }: AreaProps) {
  const [estado, setEstado] = useState('');
  const [tipo, setTipo] = useState('');
  const [resp, setResp] = useState('');
  const [vencidas, setVencidas] = useState(false);
  const [page, setPage] = useState(1);
  const q = useLoad<SolicitudesResponse>(`/empresa/solicitudes${qs({ estado, tipo, resp, vencidas: vencidas ? '1' : '', pagina: page })}`);
  const set = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <Page tab={tab} title={title} refreshing={q.refreshing} onRefresh={q.refresh} busy={q.stale && !q.loading}>
      {header}
      <ChipRow>
        <Chip label="Abiertas" active={!estado && !vencidas && !resp} count={q.data?.counts.open} onPress={() => set(() => { setEstado(''); setVencidas(false); setResp(''); })} />
        <Chip label="SLA vencido" active={vencidas} count={q.data?.counts.overdue} onPress={() => set(() => setVencidas(!vencidas))} />
        <Chip label="Mías" active={resp === 'yo'} onPress={() => set(() => setResp(resp === 'yo' ? '' : 'yo'))} />
        <Chip label="Sin asignar" active={resp === 'ninguno'} onPress={() => set(() => setResp(resp === 'ninguno' ? '' : 'ninguno'))} />
      </ChipRow>
      <Loadable q={q}>
        {(d) => (
          <>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Select label="Estado" value={estado} options={[{ value: '', label: 'Abiertas (todas)' }, ...d.options.statuses]} onChange={(v) => set(() => setEstado(v))} />
              </View>
              <View style={{ flex: 1 }}>
                <Select label="Tipo" value={tipo} options={[{ value: '', label: 'Todos' }, ...d.options.kinds]} onChange={(v) => set(() => setTipo(v))} />
              </View>
            </View>
            <T v="small" style={{ marginTop: space.md }}>Ordenadas por vencimiento del SLA.</T>
            <View style={{ gap: space.md, marginTop: space.sm }}>
              {d.rows.length === 0 ? <Empty>No hay solicitudes con estos filtros.</Empty> : null}
              {d.rows.map((r) => (
                <Card key={r.id} onPress={() => router.push(routes.solicitud(r.id))}>
                  <T v="small" style={{ color: colors.muted }}>{r.code}</T>
                  <T v="h3">{r.subject}</T>
                  <T v="small" style={{ color: colors.ink }}>{r.client.name}</T>
                  <Pills style={{ marginTop: 6 }}>
                    <LabelPill label={r.status} />
                    <LabelPill label={r.kind} />
                    {!r.closed ? <SlaPill sla={r.sla} /> : null}
                  </Pills>
                  <T v="small" style={{ marginTop: 4 }}>{`${r.assignee ? r.assignee.name : 'Sin asignar'} · ${r.messages} ${r.messages === 1 ? 'mensaje' : 'mensajes'}${r.closedAt ? ` · cerrada ${fechaHora(r.closedAt)}` : ''}`}</T>
                </Card>
              ))}
            </View>
            <Pager page={d.page} onChange={setPage} />
          </>
        )}
      </Loadable>
    </Page>
  );
}
