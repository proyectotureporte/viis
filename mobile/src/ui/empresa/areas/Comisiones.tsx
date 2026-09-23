import { router } from 'expo-router';
import { Download, Plus, Square, SquareCheck } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { CommissionRow, CommissionRuleRow, ComisionesResponse, ComisionesTab, CommissionStatus } from '@/lib/movil/contract-empresa';
import { decimal, fecha, fechaHora, hoyIso, pct, pesos } from '@/services/format';
import { useAction } from '@/services/hooks';
import { Button, Card, Empty, Notice, Pill, Section, Select, T } from '@/ui/kit';
import { DateField } from '@/ui/DateField';
import { colors, fonts, space } from '@/ui/theme';
import { useEmpresa } from '../context';
import { useDialog } from '../dialogs';
import { exportCsv } from '../files';
import { qs, useLoad } from '../hooks';
import { routes } from '../nav';
import { Chip, ChipRow, LabelPill, Line, Loadable, Page, Pager, Pills, ResultFooter, Stat, StatGrid } from '../ui';
import type { AreaProps } from './types';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const monthStart = () => `${hoyIso().slice(0, 8)}01`;
const pctInput = (fraction: number) => decimal(fraction * 100, 2).replace(/,?0+$/, '');

export function ComisionesArea({ tab, title, header }: AreaProps) {
  const [view, setView] = useState<ComisionesTab>('liquidacion');
  const [estado, setEstado] = useState<CommissionStatus | ''>('');
  const [aliado, setAliado] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [rDesde, setRDesde] = useState(monthStart());
  const [rHasta, setRHasta] = useState(hoyIso());
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const params =
    view === 'liquidacion'
      ? { tab: view, estado, aliado, desde: DATE.test(desde) ? desde : '', hasta: DATE.test(hasta) ? hasta : '', pagina: page }
      : view === 'resumen'
        ? { tab: view, estado, desde: DATE.test(rDesde) ? rDesde : '', hasta: DATE.test(rHasta) ? rHasta : '' }
        : { tab: view };
  const q = useLoad<ComisionesResponse>(`/empresa/comisiones${qs(params)}`);
  const action = useAction();
  const dialog = useDialog();
  const { refreshMenu } = useEmpresa();
  const [local, setLocal] = useState<{ ok: boolean; message: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const result = local ?? action.result;

  async function run(path: string, body: Record<string, unknown> = {}) {
    setLocal(null);
    const res = await action.run(path, body);
    if (res.ok) {
      setSelected([]);
      q.reload();
      void refreshMenu(true);
    }
    return res;
  }

  const label = (c: CommissionRow) => `${c.case.code} · ${c.allyOrg.name} · neto ${pesos(c.net)}`;

  async function approve(ids: string[], rows: CommissionRow[]) {
    const total = rows.filter((r) => ids.includes(r.id)).reduce((s, r) => s + r.net, 0);
    const ok = await dialog.confirm({ title: `Aprobar ${ids.length} ${ids.length === 1 ? 'comisión' : 'comisiones'}`, message: `Neto total ${pesos(total)}. Queda lista para programar el pago.`, confirmLabel: 'Aprobar' });
    if (ok) await run('/empresa/comisiones/aprobar', { ids });
  }

  async function schedule(c: CommissionRow) {
    const v = await dialog.ask({ title: 'Programar pago', message: label(c), confirmLabel: 'Programar', fields: [{ name: 'payDate', label: 'Fecha de pago', kind: 'date', required: true, initial: c.expectedPayAt }] });
    if (v) await run(`/empresa/comisiones/${c.id}/programar`, v);
  }

  async function pay(c: CommissionRow) {
    const v = await dialog.ask({
      title: 'Registrar pago',
      message: label(c),
      warning: 'Confirma que la transferencia ya se hizo: el aliado verá la comisión como pagada.',
      confirmLabel: 'Marcar como pagada',
      fields: [{ name: 'paymentRef', label: 'Referencia del pago (transferencia, comprobante)', required: true, minLength: 3, maxLength: 120 }],
    });
    if (v) await run(`/empresa/comisiones/${c.id}/pagar`, v);
  }

  async function reverse(c: CommissionRow) {
    const v = await dialog.ask({ title: 'Reversar comisión', message: label(c), confirmLabel: 'Reversar', destructive: true, fields: [{ name: 'reason', label: 'Motivo del reverso', kind: 'multiline', required: true, minLength: 5, maxLength: 300 }] });
    if (v) await run(`/empresa/comisiones/${c.id}/reversar`, v);
  }

  async function newRule(d: ComisionesResponse) {
    const v = await dialog.ask({
      title: 'Nueva regla de comisión',
      message: 'Aplica a una organización o a un nivel (no ambos); sin ninguno es general. Porcentajes en %.',
      confirmLabel: 'Crear regla',
      fields: [
        { name: 'name', label: 'Nombre', required: true, minLength: 3, maxLength: 120 },
        { name: 'organizationId', label: 'Organización', kind: 'select', options: [{ value: '', label: 'Todas' }, ...d.orgs.map((o) => ({ value: o.id, label: o.name, hint: o.tier }))] },
        { name: 'tier', label: 'Nivel', kind: 'select', options: [{ value: '', label: 'Todos' }, ...Array.from(new Set(d.orgs.map((o) => o.tier))).map((t) => ({ value: t, label: t }))] },
        { name: 'product', label: 'Producto', kind: 'select', options: [{ value: '', label: 'Todos' }, ...(d.reglas?.products ?? [])] },
        { name: 'percent', label: 'Comisión (%)', kind: 'number', required: true, placeholder: 'Ej. 1,2' },
        { name: 'withholdingPct', label: 'Retención (%)', kind: 'number', required: true, placeholder: 'Ej. 10' },
        { name: 'paymentDays', label: 'Días para pagar', kind: 'number', required: true, initial: '30' },
        { name: 'validFrom', label: 'Vigente desde', kind: 'date', required: true },
        { name: 'validTo', label: 'Vigente hasta', kind: 'date' },
      ],
    });
    if (v) await run('/empresa/comisiones/reglas', v);
  }

  async function version(r: CommissionRuleRow) {
    const v = await dialog.ask({
      title: `Nueva versión: ${r.name}`,
      message: `Versión actual ${r.version}: ${pct(r.percent, 2)}, retención ${pct(r.withholdingPct, 2)}, ${r.paymentDays} días. Las comisiones ya causadas conservan su versión.`,
      confirmLabel: 'Crear versión',
      fields: [
        { name: 'percent', label: 'Comisión (%)', kind: 'number', required: true, initial: pctInput(r.percent) },
        { name: 'withholdingPct', label: 'Retención (%)', kind: 'number', required: true, initial: pctInput(r.withholdingPct) },
        { name: 'paymentDays', label: 'Días para pagar', kind: 'number', required: true, initial: String(r.paymentDays) },
        { name: 'validFrom', label: 'Vigente desde', kind: 'date', required: true },
        { name: 'validTo', label: 'Vigente hasta', kind: 'date' },
        { name: 'note', label: 'Nota del cambio', kind: 'multiline', maxLength: 300 },
      ],
    });
    if (v) await run(`/empresa/comisiones/reglas/${r.id}/version`, v);
  }

  async function close(r: CommissionRuleRow) {
    const v = await dialog.ask({
      title: `Cerrar vigencia: ${r.name} v${r.version}`,
      message: 'Desde esa fecha la regla deja de causar comisiones nuevas.',
      confirmLabel: 'Cerrar vigencia',
      destructive: true,
      fields: [
        { name: 'validTo', label: 'Vigente hasta', kind: 'date', required: true },
        { name: 'reason', label: 'Motivo', kind: 'multiline', required: true, minLength: 5, maxLength: 300 },
      ],
    });
    if (v) await run(`/empresa/comisiones/reglas/${r.id}/cerrar`, v);
  }

  async function csv(path: string) {
    setExporting(true);
    setLocal(await exportCsv(path, 'comisiones'));
    setExporting(false);
  }

  const change = (t: ComisionesTab) => {
    setView(t);
    setPage(1);
    setSelected([]);
  };

  return (
    <Page tab={tab} title={title} refreshing={q.refreshing} onRefresh={q.refresh} busy={q.stale && !q.loading} footer={result ? <ResultFooter result={result} onClose={() => { setLocal(null); action.clear(); }} /> : undefined}>
      {header}
      <ChipRow>
        <Chip label="Liquidación" active={view === 'liquidacion'} onPress={() => change('liquidacion')} />
        <Chip label="Resumen por aliado" active={view === 'resumen'} onPress={() => change('resumen')} />
        <Chip label="Reglas" active={view === 'reglas'} onPress={() => change('reglas')} />
      </ChipRow>
      <Loadable q={q}>
        {(d) => (
          <>
            {view === 'liquidacion' && d.liquidacion ? (
              <>
                <View style={{ gap: space.sm }}>
                  <Select label="Estado" value={estado} options={[{ value: '', label: 'Todos' }, ...d.statuses]} onChange={(v) => { setEstado(v as CommissionStatus | ''); setPage(1); }} />
                  <Select label="Aliado" value={aliado} options={[{ value: '', label: 'Todos' }, ...d.orgs.map((o) => ({ value: o.id, label: o.name }))]} onChange={(v) => { setAliado(v); setPage(1); }} />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1 }}><DateField label="Causadas desde" value={desde} onChange={setDesde} optional /></View>
                    <View style={{ flex: 1 }}><DateField label="Hasta" value={hasta} onChange={setHasta} optional /></View>
                  </View>
                </View>
                <View style={{ marginTop: space.md }}>
                  <StatGrid>
                    <Stat label="Comisiones" value={String(d.liquidacion.totals.count)} />
                    <Stat label="Neto" value={pesos(d.liquidacion.totals.net)} />
                    <Stat label="Bruto" value={pesos(d.liquidacion.totals.gross)} />
                    <Stat label="Retención" value={pesos(d.liquidacion.totals.withholding)} />
                  </StatGrid>
                </View>
                {selected.length ? <Button title={`Aprobar ${selected.length} seleccionadas`} onPress={() => approve(selected, d.liquidacion!.rows)} style={{ marginTop: space.md }} loading={action.pending} /> : null}
                <View style={{ gap: space.md, marginTop: space.md }}>
                  {d.liquidacion.rows.length === 0 ? <Empty>No hay comisiones con estos filtros.</Empty> : null}
                  {d.liquidacion.rows.map((c) => {
                    const on = selected.includes(c.id);
                    return (
                      <Card key={c.id} style={on ? { borderColor: colors.mintDeep, borderWidth: 2 } : undefined}>
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                          {c.can.approve ? (
                            <Pressable onPress={() => setSelected((s) => (on ? s.filter((x) => x !== c.id) : [...s, c.id]))} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`Seleccionar comisión ${c.case.code}`} hitSlop={10}>
                              {on ? <SquareCheck size={22} color={colors.mintDeep} /> : <Square size={22} color={colors.muted} />}
                            </Pressable>
                          ) : null}
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                              <T v="h3" style={{ flex: 1 }}>{pesos(c.net)}</T>
                              <LabelPill label={c.status} />
                            </View>
                            <T style={{ fontFamily: fonts.medium }}>{c.allyOrg.name}</T>
                            <Pressable onPress={() => router.push(routes.caso(c.case.id))} accessibilityRole="link">
                              <T v="small" style={{ color: colors.blue, fontFamily: fonts.semibold }}>{`${c.case.code} · ${c.case.clientName} · ${c.case.product.label}`}</T>
                            </Pressable>
                          </View>
                        </View>
                        <View style={{ marginTop: space.sm }}>
                          <Line label="Base" value={pesos(c.baseAmount)} />
                          <Line label="Porcentaje" value={`${pct(c.percent, 2)} (${c.rule.name} v${c.rule.version})`} />
                          <Line label="Bruto / retención" value={`${pesos(c.gross)} / ${pesos(c.withholding)}`} />
                          <Line label="Causada" value={fechaHora(c.causedAt)} />
                          <Line label="Pago esperado" value={fecha(c.expectedPayAt)} />
                          {c.allyUserName ? <Line label="Usuario aliado" value={c.allyUserName} /> : null}
                          {c.paidAt ? <Line label="Pagada" value={`${fechaHora(c.paidAt)} · ref. ${c.paymentRef ?? '—'}`} /> : null}
                        </View>
                        {c.reverseReason ? <T v="small" style={{ color: colors.danger }}>{`Reversada: ${c.reverseReason}`}</T> : null}
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: space.md }}>
                          {c.can.approve ? <Button small title="Aprobar" onPress={() => approve([c.id], d.liquidacion!.rows)} /> : null}
                          {c.can.schedule ? <Button small variant="secondary" title="Programar pago" onPress={() => schedule(c)} /> : null}
                          {c.can.pay ? <Button small title="Registrar pago" onPress={() => pay(c)} /> : null}
                          {c.can.reverse ? <Button small variant="danger" title="Reversar" onPress={() => reverse(c)} /> : null}
                        </View>
                      </Card>
                    );
                  })}
                </View>
                <Pager page={d.liquidacion.page} onChange={setPage} />
              </>
            ) : null}

            {view === 'resumen' && d.resumen ? (
              <>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}><DateField label="Desde" value={rDesde} onChange={setRDesde} optional /></View>
                  <View style={{ flex: 1 }}><DateField label="Hasta" value={rHasta} onChange={setRHasta} optional /></View>
                </View>
                <View style={{ marginTop: space.sm }}>
                  <Select label="Estado" value={estado} options={[{ value: '', label: 'Todos' }, ...d.statuses]} onChange={(v) => setEstado(v as CommissionStatus | '')} />
                </View>
                <Button title="Exportar CSV de cierre" variant="secondary" icon={<Download size={17} color={colors.ink} />} onPress={() => csv(d.resumen!.csvPath)} loading={exporting} style={{ marginTop: space.md }} />
                <View style={{ gap: space.md, marginTop: space.md }}>
                  {d.resumen.rows.length === 0 ? <Empty>Sin comisiones en el periodo.</Empty> : null}
                  {d.resumen.rows.map((r) => (
                    <Card key={r.orgId}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                        <T v="h3" style={{ flex: 1 }}>{r.orgName}</T>
                        <T v="h3">{pesos(r.totalNet)}</T>
                      </View>
                      {d.statuses.map((s) => {
                        const b = r.byStatus[s.value as CommissionStatus];
                        return b ? <Line key={s.value} label={`${s.label} (${b.count})`} value={`${pesos(b.net)} neto`} /> : null;
                      })}
                    </Card>
                  ))}
                </View>
              </>
            ) : null}

            {view === 'reglas' && d.reglas ? (
              <>
                {d.reglas.priorityNote ? <Notice tone="info">{d.reglas.priorityNote}</Notice> : null}
                {d.can.rules ? <Button title="Nueva regla" icon={<Plus size={18} color={colors.navy} />} onPress={() => newRule(d)} style={{ marginTop: space.md }} /> : <T v="small" style={{ marginTop: space.md }}>Tu rol puede consultar las reglas; crearlas o versionarlas es de Dirección.</T>}
                <Section title="Reglas versionadas">
                  {d.reglas.rows.length === 0 ? <Empty>Sin reglas.</Empty> : null}
                  {d.reglas.rows.map((r) => (
                    <Card key={r.id} style={!r.isLatest ? { opacity: 0.75 } : undefined}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                        <T v="h3" style={{ flex: 1 }}>{`${r.name} · v${r.version}`}</T>
                        {r.inForce ? <Pill tone="ok">Vigente</Pill> : <Pill tone="gray">{r.active ? 'Fuera de vigencia' : 'Inactiva'}</Pill>}
                      </View>
                      <T v="small">{`Alcance: ${r.scope}${r.product ? ` · ${r.product.label}` : ''} · base: ${r.basis === 'DISBURSED' ? 'monto desembolsado' : r.basis}`}</T>
                      <Line label="Comisión" value={pct(r.percent, 2)} strong />
                      <Line label="Retención" value={pct(r.withholdingPct, 2)} />
                      <Line label="Pago" value={`${r.paymentDays} días`} />
                      <Line label="Vigencia" value={`${fecha(r.validFrom)} → ${r.validTo ? fecha(r.validTo) : 'sin fin'}`} />
                      <Line label="Usos" value={String(r.uses)} />
                      <Pills style={{ marginTop: space.sm }}>{!r.isLatest ? <Pill tone="gray">Versión anterior</Pill> : null}</Pills>
                      {d.can.rules && (r.can.version || r.can.close) ? (
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: space.md }}>
                          {r.can.version ? <Button small variant="secondary" title="Nueva versión" onPress={() => version(r)} style={{ flex: 1 }} /> : null}
                          {r.can.close ? <Button small variant="danger" title="Cerrar vigencia" onPress={() => close(r)} style={{ flex: 1 }} /> : null}
                        </View>
                      ) : null}
                    </Card>
                  ))}
                </Section>
              </>
            ) : null}
          </>
        )}
      </Loadable>
    </Page>
  );
}
