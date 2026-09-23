import { router } from 'expo-router';
import { Plus, Search, SlidersHorizontal, Square, SquareCheck, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import type { BandejaFilters, BandejaResponse, BulkActionResult, CaseRow } from '@/lib/movil/contract-empresa';
import { pesosCortos } from '@/services/format';
import { useAction } from '@/services/hooks';
import { Button, Card, Checkbox, Empty, Notice, ResultBanner, Section, Select, T } from '@/ui/kit';
import { colors, fonts, radius, space } from '@/ui/theme';
import { useEmpresa } from '../context';
import { useDialog } from '../dialogs';
import { qs, useDebounced, useLoad } from '../hooks';
import { routes } from '../nav';
import { Chip, ChipRow, LabelPill, Loadable, Page, Pager, Pills, Sheet, SlaPill } from '../ui';

const EMPTY: Omit<BandejaFilters, 'q'> = { etapa: '', prioridad: '', producto: '', responsable: '', entidad: '', canal: '', vencidos: '' };

export function BandejaArea({ tab = true, initialQuery = '' }: { tab?: boolean; initialQuery?: string }) {
  const { refreshMenu } = useEmpresa();
  const dialog = useDialog();
  const action = useAction();
  const [search, setSearch] = useState(initialQuery);
  const q = useDebounced(search.trim());
  const [filters, setFilters] = useState(EMPTY);
  const [draft, setDraft] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const [sheet, setSheet] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulk, setBulk] = useState<BulkActionResult | null>(null);
  const data = useLoad<BandejaResponse>(`/empresa/bandeja${qs({ q, ...filters, pagina: page })}`);
  const active = Object.values(filters).filter(Boolean).length;

  function apply(next: typeof EMPTY) {
    setFilters(next);
    setPage(1);
    setSelected([]);
  }

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  async function after(ok: boolean) {
    if (ok) {
      setSelected([]);
      data.reload();
      void refreshMenu(true);
    }
  }

  async function assign(d: BandejaResponse) {
    const v = await dialog.ask({
      title: `Asignar ${selected.length} ${selected.length === 1 ? 'caso' : 'casos'}`,
      message: 'El nuevo responsable recibe un aviso. Queda registrado en la bitácora de cada caso.',
      confirmLabel: 'Asignar',
      fields: [{ name: 'assigneeId', label: 'Responsable', kind: 'select', required: true, options: [{ value: 'none', label: 'Sin responsable' }, ...d.options.staff.map((u) => ({ value: u.id, label: u.name, hint: u.roleLabel }))] }],
    });
    if (!v) return;
    setBulk(null);
    const res = await action.run('/empresa/bandeja/asignar', { ids: selected, assigneeId: v.assigneeId });
    void after(res.ok);
  }

  async function escalate() {
    const v = await dialog.ask({
      title: `Escalar ${selected.length} ${selected.length === 1 ? 'caso' : 'casos'}`,
      message: 'Coordinación recibe el aviso y el caso queda marcado como escalado.',
      confirmLabel: 'Escalar',
      destructive: true,
      fields: [{ name: 'reason', label: 'Motivo del escalamiento', kind: 'multiline', required: true, minLength: 5 }],
    });
    if (!v) return;
    setBulk(null);
    const res = await action.run('/empresa/bandeja/escalar', { ids: selected, reason: v.reason });
    void after(res.ok);
  }

  async function priority(d: BandejaResponse) {
    const v = await dialog.ask({
      title: 'Cambiar prioridad',
      message: `Se aplica a ${selected.length} ${selected.length === 1 ? 'caso' : 'casos'}, uno por uno.`,
      confirmLabel: 'Aplicar',
      fields: [{ name: 'priority', label: 'Prioridad', kind: 'select', required: true, options: d.options.priorities }],
    });
    if (!v) return;
    const res = await action.run('/empresa/bandeja/prioridad', { ids: selected, priority: v.priority });
    setBulk(Array.isArray((res as unknown as BulkActionResult).results) ? (res as unknown as BulkActionResult) : null);
    void after(res.ok);
  }

  async function take(row: CaseRow) {
    const ok = await dialog.confirm({ title: 'Tomar caso', message: `${row.code} · ${row.client.name} quedará a tu cargo.`, confirmLabel: 'Tomar' });
    if (!ok) return;
    const res = await action.run(`/empresa/casos/${row.id}/tomar`, {});
    void after(res.ok);
  }

  const d0 = data.data;
  const selectable = Boolean(d0 && (d0.can.assign || d0.can.stage));

  return (
    <Page
      tab={tab}
      title={tab ? 'Bandeja' : undefined}
      subtitle={d0 ? `${d0.counts.total} casos · ${d0.counts.urgent} urgentes · ${d0.counts.overdue} vencidos` : 'Casos por prioridad y SLA'}
      refreshing={data.refreshing}
      onRefresh={data.refresh}
      busy={data.stale && !data.loading}
      footer={
        selected.length && d0 ? (
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <T v="h3">{`${selected.length} ${selected.length === 1 ? 'seleccionado' : 'seleccionados'}`}</T>
              <Pressable onPress={() => setSelected([])} accessibilityRole="button" accessibilityLabel="Quitar selección" hitSlop={8}>
                <X size={20} color={colors.ink} />
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {d0.can.assign ? <Button small title="Asignar" onPress={() => assign(d0)} style={{ flex: 1 }} loading={action.pending} /> : null}
              {d0.can.assign ? <Button small title="Prioridad" variant="secondary" onPress={() => priority(d0)} style={{ flex: 1 }} /> : null}
              {d0.can.stage ? <Button small title="Escalar" variant="danger" onPress={escalate} style={{ flex: 1 }} /> : null}
            </View>
          </View>
        ) : undefined
      }
    >
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: space.md }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, borderWidth: 1, borderColor: '#c3d2d7', borderRadius: radius.md, paddingHorizontal: 12 }}>
          <Search size={18} color={colors.muted} />
          <TextInput
            value={search}
            onChangeText={(t) => {
              setSearch(t);
              setPage(1);
            }}
            placeholder="OV-1001, nombre o últimos 4"
            placeholderTextColor="#8b9aa1"
            style={{ flex: 1, minHeight: 46, fontFamily: fonts.body, fontSize: 15, color: colors.ink }}
            accessibilityLabel="Buscar casos"
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>
        <Pressable
          onPress={() => {
            setDraft(filters);
            setSheet(true);
          }}
          style={{ width: 48, height: 48, borderRadius: radius.md, backgroundColor: active ? colors.navy : colors.white, borderWidth: 1, borderColor: active ? colors.navy : colors.line, alignItems: 'center', justifyContent: 'center' }}
          accessibilityRole="button"
          accessibilityLabel={active ? `Filtros, ${active} activos` : 'Filtros'}
        >
          <SlidersHorizontal size={20} color={active ? colors.white : colors.ink} />
        </Pressable>
      </View>
      <ChipRow>
        <Chip label="Todos" active={!filters.vencidos && !filters.prioridad} onPress={() => apply({ ...filters, vencidos: '', prioridad: '' })} />
        <Chip label="Solo vencidos" active={filters.vencidos === '1'} count={d0?.counts.overdue} onPress={() => apply({ ...filters, vencidos: filters.vencidos ? '' : '1' })} />
        <Chip label="Críticos" active={filters.prioridad === 'CRITICAL'} onPress={() => apply({ ...filters, prioridad: filters.prioridad === 'CRITICAL' ? '' : 'CRITICAL' })} />
        <Chip label="Sin responsable" active={filters.responsable === 'none'} onPress={() => apply({ ...filters, responsable: filters.responsable === 'none' ? '' : 'none' })} />
        {active ? <Chip label="Limpiar filtros" active={false} onPress={() => apply(EMPTY)} /> : null}
      </ChipRow>

      <ResultBanner result={action.result} />
      {bulk?.results?.length ? (
        <Card style={{ marginTop: space.sm, gap: 4 }}>
          {bulk.results.map((r) => (
            <T key={r.id} v="small" style={{ color: r.ok ? colors.mintDeep : colors.danger }}>{`${d0?.rows.find((x) => x.id === r.id)?.code ?? r.id.slice(0, 8)}: ${r.message}`}</T>
          ))}
        </Card>
      ) : null}

      <Loadable q={data}>
        {(d) => (
          <>
            {d.scopeNote ? <Notice tone="info">{d.scopeNote}</Notice> : null}
            {d.can.create ? <Button title="Nuevo caso" small variant="secondary" icon={<Plus size={16} color={colors.ink} />} onPress={() => router.push(routes.nuevoCaso())} style={{ marginTop: space.sm, alignSelf: 'flex-start' }} /> : null}
            <View style={{ gap: space.md, marginTop: space.md }}>
              {d.rows.length === 0 ? <Empty>{q || active ? 'Ningún caso coincide con la búsqueda o los filtros.' : 'No hay casos abiertos en tu alcance.'}</Empty> : null}
              {d.rows.map((r) => {
                const on = selected.includes(r.id);
                return (
                  <Card key={r.id} style={on ? { borderColor: colors.mintDeep, borderWidth: 2 } : undefined}>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      {selectable ? (
                        <Pressable onPress={() => toggle(r.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`Seleccionar ${r.code}`} hitSlop={10} style={{ paddingTop: 2 }}>
                          {on ? <SquareCheck size={22} color={colors.mintDeep} /> : <Square size={22} color={colors.muted} />}
                        </Pressable>
                      ) : null}
                      <Pressable style={{ flex: 1 }} onPress={() => router.push(routes.caso(r.id))} accessibilityRole="button" accessibilityLabel={`Abrir ${r.code}, ${r.client.name}`}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                          <T v="h3" style={{ flex: 1 }}>{r.code}</T>
                          <LabelPill label={r.priority} />
                        </View>
                        <T>{`${r.client.name} · ···${r.client.documentLast4}`}</T>
                        <T v="small">{`${r.product.label}${r.amount ? ` · ${pesosCortos(r.amount)}` : ''}`}</T>
                        <Pills style={{ marginTop: 8 }}>
                          <LabelPill label={r.stage} />
                          <SlaPill sla={r.sla} />
                          <LabelPill label={r.channel} />
                          {r.escalatedAt ? <LabelPill label={{ code: 'ESC', label: 'Escalado', tone: 'bad' }} /> : null}
                        </Pills>
                        <T v="small" style={{ marginTop: 6 }}>
                          {[r.assignee ? `Responsable: ${r.assignee.name}` : 'Sin responsable', r.entity?.name, r.allyOrgName ? `Aliado: ${r.allyOrgName}` : null].filter(Boolean).join(' · ')}
                        </T>
                        {r.nextAction ? <T v="small" style={{ color: colors.ink }}>{`Siguiente: ${r.nextAction}`}</T> : null}
                      </Pressable>
                    </View>
                    {r.canTake ? <Button small title="Tomar caso" variant="secondary" onPress={() => take(r)} style={{ marginTop: space.md }} /> : null}
                  </Card>
                );
              })}
            </View>
            <Pager page={d.page} onChange={setPage} />

            {d.load.length ? (
              <Section title="Carga por responsable">
                <Card style={{ gap: 8 }}>
                  {d.load.map((l) => (
                    <Pressable key={l.assigneeId ?? 'none'} onPress={() => apply({ ...filters, responsable: l.assigneeId ?? 'none' })} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }} accessibilityRole="button" accessibilityLabel={`Filtrar por ${l.name}`}>
                      <T v="small" style={{ color: colors.ink, flex: 1 }}>{l.name}</T>
                      <T v="small" style={{ fontFamily: fonts.semibold, color: l.overdue ? colors.danger : colors.ink }}>{`${l.open} abiertos${l.overdue ? ` · ${l.overdue} vencidos` : ''}`}</T>
                    </Pressable>
                  ))}
                </Card>
              </Section>
            ) : null}

            <Sheet
              visible={sheet}
              title="Filtrar bandeja"
              onClose={() => setSheet(false)}
              footer={
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button title="Limpiar" variant="secondary" onPress={() => setDraft(EMPTY)} style={{ flex: 1 }} />
                  <Button
                    title="Aplicar"
                    onPress={() => {
                      apply(draft);
                      setSheet(false);
                    }}
                    style={{ flex: 1 }}
                  />
                </View>
              }
            >
              <Select label="Etapa" value={draft.etapa} options={[{ value: '', label: 'Todas' }, ...d.options.stages]} onChange={(v) => setDraft({ ...draft, etapa: v as BandejaFilters['etapa'] })} />
              <Select label="Producto" value={draft.producto} options={[{ value: '', label: 'Todos' }, ...d.options.products]} onChange={(v) => setDraft({ ...draft, producto: v })} />
              <Select label="Responsable" value={draft.responsable} options={[{ value: '', label: 'Todos' }, { value: 'none', label: 'Sin responsable' }, ...d.options.staff.map((u) => ({ value: u.id, label: u.name, hint: u.roleLabel }))]} onChange={(v) => setDraft({ ...draft, responsable: v })} />
              <Select label="Entidad" value={draft.entidad} options={[{ value: '', label: 'Todas' }, ...d.options.entities]} onChange={(v) => setDraft({ ...draft, entidad: v })} />
              <Select label="Canal" value={draft.canal} options={[{ value: '', label: 'Todos' }, ...d.options.channels]} onChange={(v) => setDraft({ ...draft, canal: v as BandejaFilters['canal'] })} />
              <Select label="Prioridad" value={draft.prioridad} options={[{ value: '', label: 'Todas' }, ...d.options.priorities]} onChange={(v) => setDraft({ ...draft, prioridad: v as BandejaFilters['prioridad'] })} />
              <Checkbox checked={draft.vencidos === '1'} onChange={(v) => setDraft({ ...draft, vencidos: v ? '1' : '' })}>
                Solo casos con SLA vencido
              </Checkbox>
            </Sheet>
          </>
        )}
      </Loadable>
    </Page>
  );
}
