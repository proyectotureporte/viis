import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import type { LeadRow, LeadsResponse, LeadStatus } from '@/lib/movil/contract-empresa';
import { fechaHora } from '@/services/format';
import { useAction } from '@/services/hooks';
import { Button, Card, Empty, ResultBanner, T } from '@/ui/kit';
import { colors, space } from '@/ui/theme';
import { useEmpresa } from '../context';
import { useDialog } from '../dialogs';
import { qs, useLoad } from '../hooks';
import { routes } from '../nav';
import { PersonCaseForm } from '../PersonCaseForm';
import { Chip, ChipRow, LabelPill, Loadable, Page, Pager, Sheet } from '../ui';
import type { AreaProps } from './types';

export function LeadsArea({ tab, title, header }: AreaProps) {
  const [estado, setEstado] = useState<LeadStatus>('NEW');
  const [page, setPage] = useState(1);
  const [converting, setConverting] = useState<LeadRow | null>(null);
  const q = useLoad<LeadsResponse>(`/empresa/leads${qs({ estado, pagina: page })}`);
  const action = useAction();
  const dialog = useDialog();
  const { refreshMenu } = useEmpresa();

  async function discard(l: LeadRow) {
    const v = await dialog.ask({
      title: 'Descartar lead',
      message: `${l.name} saldrá de la cola de leads por gestionar.`,
      confirmLabel: 'Descartar',
      destructive: true,
      fields: [{ name: 'reason', label: 'Motivo del descarte', kind: 'multiline', required: true, minLength: 3, placeholder: 'Ej. Duplicado, datos falsos, fuera de cobertura' }],
    });
    if (!v) return;
    const res = await action.run(`/empresa/leads/${l.id}/descartar`, v);
    if (res.ok) {
      q.reload();
      void refreshMenu(true);
    }
  }

  return (
    <Page tab={tab} title={title} subtitle={tab ? 'Leads web por gestionar' : undefined} refreshing={q.refreshing} onRefresh={q.refresh} busy={q.stale && !q.loading}>
      {header}
      <ChipRow>
        <Chip label="Por gestionar" active={estado === 'NEW'} count={q.data?.counts.NEW} onPress={() => { setEstado('NEW'); setPage(1); }} />
        <Chip label="Convertidos" active={estado === 'CONVERTED'} onPress={() => { setEstado('CONVERTED'); setPage(1); }} />
        <Chip label="Descartados" active={estado === 'DISCARDED'} onPress={() => { setEstado('DISCARDED'); setPage(1); }} />
      </ChipRow>
      <ResultBanner result={action.result} />
      <Loadable q={q}>
        {(d) => (
          <>
            <View style={{ gap: space.md, marginTop: space.sm }}>
              {d.rows.length === 0 ? <Empty>{estado === 'NEW' ? 'No hay leads por gestionar.' : 'Sin registros en este estado.'}</Empty> : null}
              {d.rows.map((l) => (
                <Card key={l.id}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <T v="h3" style={{ flex: 1 }}>{l.name}</T>
                    <LabelPill label={l.status} />
                  </View>
                  <T v="small">{`${fechaHora(l.createdAt)} · fuente ${l.source}`}</T>
                  <T v="small" style={{ color: colors.ink }}>{[l.email, l.phone, l.city].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</T>
                  <T style={{ marginTop: 6 }} selectable>{l.message}</T>
                  {l.discardReason ? <T v="small" style={{ color: colors.danger, marginTop: 4 }}>{`Descartado: ${l.discardReason}`}</T> : null}
                  {l.case ? <Button small variant="secondary" title={`Abrir caso ${l.case.code}`} onPress={() => router.push(routes.caso(l.case!.id))} style={{ marginTop: space.md, alignSelf: 'flex-start' }} /> : null}
                  {l.status.code === 'NEW' ? (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: space.md }}>
                      <Button small title="Convertir en caso" onPress={() => { action.clear(); setConverting(l); }} style={{ flex: 1.4 }} />
                      <Button small variant="secondary" title="Descartar" onPress={() => discard(l)} style={{ flex: 1 }} />
                    </View>
                  ) : null}
                </Card>
              ))}
            </View>
            <Pager page={d.page} onChange={setPage} />
            <Sheet visible={Boolean(converting)} title={converting ? `Convertir: ${converting.name}` : 'Convertir'} onClose={() => setConverting(null)}>
              {converting ? (
                <>
                  <T v="small">{`Mensaje del lead: “${converting.message}”`}</T>
                  <PersonCaseForm
                    key={converting.id}
                    options={d.form}
                    lockAssigneeToSelf={d.form.lockAssigneeToSelf}
                    declaration={d.form.declaration}
                    defaults={converting.suggested}
                    submitLabel="Crear caso"
                    pending={action.pending}
                    onSubmit={async (body) => {
                      const res = await action.run(`/empresa/leads/${converting.id}/convertir`, body);
                      if (res.ok) {
                        setConverting(null);
                        q.reload();
                        void refreshMenu(true);
                        if (typeof res.id === 'string') router.push(routes.caso(res.id));
                      }
                      return res;
                    }}
                  />
                </>
              ) : null}
            </Sheet>
          </>
        )}
      </Loadable>
    </Page>
  );
}
