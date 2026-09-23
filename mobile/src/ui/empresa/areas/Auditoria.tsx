import { ChevronLeft, ChevronRight, Download, ShieldCheck, SlidersHorizontal } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import type { AuditoriaResponse } from '@/lib/movil/contract-empresa';
import { useAction } from '@/services/hooks';
import { Button, Empty, Field, Notice, Select, T } from '@/ui/kit';
import { DateField } from '@/ui/DateField';
import { colors, space } from '@/ui/theme';
import { AuditEventCard } from '../AuditEvent';
import { useDialog } from '../dialogs';
import { exportCsv } from '../files';
import { qs, useLoad } from '../hooks';
import { Loadable, Page, ResultFooter, Sheet } from '../ui';
import type { AreaProps } from './types';

const EMPTY = { accion: '', entidad: '', id: '', actor: '', desde: '', hasta: '' };
type Filters = typeof EMPTY;

export function AuditoriaArea({ tab, title, header }: AreaProps) {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [cursor, setCursor] = useState<{ antes?: string; despues?: string }>({});
  const [open, setOpen] = useState(false);
  const q = useLoad<AuditoriaResponse>(`/empresa/auditoria${qs({ ...filters, ...cursor })}`);
  const action = useAction();
  const dialog = useDialog();
  const [local, setLocal] = useState<{ ok: boolean; message: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const active = Object.values(filters).filter(Boolean).length;
  const result = local ?? action.result;

  async function verify() {
    const ok = await dialog.confirm({
      title: 'Verificar integridad',
      message: 'Se recalcula toda la cadena de hash de la bitácora para detectar cualquier alteración. Puede tardar unos segundos.',
      warning: 'La verificación también queda registrada en la bitácora.',
      confirmLabel: 'Verificar ahora',
    });
    if (!ok) return;
    setLocal(null);
    const res = await action.run('/empresa/auditoria/verificar', {});
    if (res.ok) q.reload();
  }

  async function csv(path: string) {
    setExporting(true);
    setLocal(await exportCsv(path, 'auditoria'));
    setExporting(false);
  }

  const set = (k: keyof Filters) => (v: string) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <Page tab={tab} title={title} refreshing={q.refreshing} onRefresh={q.refresh} busy={q.stale && !q.loading} footer={result ? <ResultFooter result={result} onClose={() => { setLocal(null); action.clear(); }} /> : undefined}>
      {header}
      <Notice tone="info">Bitácora inmutable encadenada por hash: registra quién hizo qué, cuándo y desde dónde. Nadie puede editarla ni borrarla.</Notice>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: space.md }}>
        <Button small variant={active ? 'primary' : 'secondary'} title={active ? `Filtros (${active})` : 'Filtrar'} icon={<SlidersHorizontal size={16} color={active ? colors.navy : colors.ink} />} onPress={() => { setDraft(filters); setOpen(true); }} />
        <Button small variant="secondary" title="Verificar integridad" icon={<ShieldCheck size={16} color={colors.ink} />} onPress={verify} loading={action.pending} />
        {q.data ? <Button small variant="secondary" title="Exportar CSV" icon={<Download size={16} color={colors.ink} />} onPress={() => csv(q.data!.csvPath)} loading={exporting} /> : null}
      </View>
      <Loadable q={q}>
        {(d) => (
          <>
            <View style={{ gap: space.sm, marginTop: space.md }}>
              {d.rows.length === 0 ? <Empty>Ningún evento coincide con los filtros.</Empty> : null}
              {d.rows.map((e) => (
                <AuditEventCard key={e.id} e={e} />
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: space.lg }}>
              <Button small variant="secondary" title="Más recientes" icon={<ChevronLeft size={16} color={colors.ink} />} disabled={!d.cursor.hasNewer || !d.cursor.despues} onPress={() => setCursor({ despues: d.cursor.despues ?? undefined })} style={{ flex: 1 }} />
              <Button small variant="secondary" title="Más antiguos" icon={<ChevronRight size={16} color={colors.ink} />} disabled={!d.cursor.hasOlder || !d.cursor.antes} onPress={() => setCursor({ antes: d.cursor.antes ?? undefined })} style={{ flex: 1 }} />
            </View>
            <T v="small" style={{ textAlign: 'center', marginTop: 8 }}>{`${d.pageSize} eventos por página`}</T>
            <Sheet
              visible={open}
              title="Buscar en la bitácora"
              onClose={() => setOpen(false)}
              footer={
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button title="Limpiar" variant="secondary" onPress={() => setDraft(EMPTY)} style={{ flex: 1 }} />
                  <Button title="Buscar" onPress={() => { setFilters(draft); setCursor({}); setOpen(false); }} style={{ flex: 1 }} />
                </View>
              }
            >
              <Field label="Acción (ej. document.viewed, case.stage)" value={draft.accion} onChangeText={set('accion')} autoCapitalize="none" autoCorrect={false} />
              <Select label="Entidad" value={draft.entidad} options={[{ value: '', label: 'Todas' }, ...d.entities.map((x) => ({ value: x, label: x }))]} onChange={set('entidad')} />
              <Field label="Id del registro" value={draft.id} onChangeText={set('id')} autoCapitalize="none" autoCorrect={false} />
              <Field label="Actor (correo o id)" value={draft.actor} onChangeText={set('actor')} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><DateField label="Desde" value={draft.desde} onChange={set('desde')} optional /></View>
                <View style={{ flex: 1 }}><DateField label="Hasta" value={draft.hasta} onChange={set('hasta')} optional /></View>
              </View>
            </Sheet>
          </>
        )}
      </Loadable>
    </Page>
  );
}
