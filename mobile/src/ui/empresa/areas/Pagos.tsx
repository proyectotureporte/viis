import { router } from 'expo-router';
import { Eye } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import type { PagosResponse, PagosTab, PaymentRow } from '@/lib/movil/contract-empresa';
import { fecha, fechaHora, pesos } from '@/services/format';
import { useAction } from '@/services/hooks';
import { Button, Card, Empty, Notice, T } from '@/ui/kit';
import { colors, fonts, space } from '@/ui/theme';
import { useEmpresa } from '../context';
import { useDialog } from '../dialogs';
import { viewDocument } from '../files';
import { qs, useLoad } from '../hooks';
import { routes } from '../nav';
import { Chip, ChipRow, LabelPill, Line, Loadable, Page, Pager, Pills, ResultFooter } from '../ui';
import type { AreaProps } from './types';

export function PagosArea({ tab, title, header }: AreaProps) {
  const [view, setView] = useState<PagosTab>('cola');
  const [page, setPage] = useState(1);
  const q = useLoad<PagosResponse>(`/empresa/pagos${qs({ tab: view, pagina: page })}`);
  const action = useAction();
  const dialog = useDialog();
  const { refreshMenu } = useEmpresa();
  const [local, setLocal] = useState<{ ok: boolean; message: string } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const result = local ?? action.result;

  async function run(path: string, body: Record<string, unknown> = {}) {
    setLocal(null);
    const res = await action.run(path, body);
    if (res.ok) {
      q.reload();
      void refreshMenu(true);
    }
  }

  const who = (p: PaymentRow) => `${pesos(p.amount)} de ${p.client.name} (${p.loan.alias})`;

  async function validate(p: PaymentRow) {
    const ok = await dialog.confirm({
      title: 'Validar pago',
      message: `${who(p)}, pagado el ${fecha(p.paidOn)} por ${p.channel}${p.reference ? ` (ref. ${p.reference})` : ''}.`,
      warning: `Se aplica al gemelo del crédito: el saldo (${pesos(p.loan.balance)}) se recalcula y el cliente recibe el aviso. Verifica el soporte antes de validar.${p.possibleDuplicates.length ? ' ATENCIÓN: hay posibles duplicados.' : ''}`,
      confirmLabel: 'Validar y aplicar',
    });
    if (ok) await run(`/empresa/pagos/${p.id}/validar`);
  }

  async function reject(p: PaymentRow) {
    const v = await dialog.ask({ title: 'Rechazar pago', message: `${who(p)}. El cliente verá el motivo.`, confirmLabel: 'Rechazar', destructive: true, fields: [{ name: 'reason', label: 'Motivo del rechazo', kind: 'multiline', required: true, minLength: 5, maxLength: 500 }] });
    if (v) await run(`/empresa/pagos/${p.id}/rechazar`, v);
  }

  async function reconcile(p: PaymentRow) {
    const v = await dialog.ask({ title: 'Conciliar pago', message: `${who(p)} contra el extracto bancario.`, confirmLabel: 'Conciliar', fields: [{ name: 'reference', label: 'Referencia de conciliación (extracto / movimiento)', required: true, minLength: 3, maxLength: 80 }] });
    if (v) await run(`/empresa/pagos/${p.id}/conciliar`, v);
  }

  async function take(p: PaymentRow) {
    await run(`/empresa/pagos/${p.id}/tomar`);
  }

  async function support(p: PaymentRow) {
    if (!p.support) return;
    setOpening(p.id);
    setLocal(await viewDocument(p.support.documentId, 'Soporte de pago'));
    setOpening(null);
  }

  const change = (t: PagosTab) => {
    setView(t);
    setPage(1);
  };

  return (
    <Page tab={tab} title={title} refreshing={q.refreshing} onRefresh={q.refresh} busy={q.stale && !q.loading} footer={result ? <ResultFooter result={result} onClose={() => { setLocal(null); action.clear(); }} /> : undefined}>
      {header}
      <ChipRow>
        <Chip label="Por revisar" active={view === 'cola'} count={q.data?.counts.cola} onPress={() => change('cola')} />
        <Chip label="Por conciliar" active={view === 'conciliar'} count={q.data?.counts.conciliar} onPress={() => change('conciliar')} />
        <Chip label="Histórico" active={view === 'historico'} onPress={() => change('historico')} />
      </ChipRow>
      <Loadable q={q}>
        {(d) => (
          <>
            {d.notice ? <Notice tone="info">{d.notice}</Notice> : null}
            <View style={{ gap: space.md, marginTop: space.md }}>
              {d.rows.length === 0 ? <Empty>{view === 'cola' ? 'No hay pagos por revisar.' : view === 'conciliar' ? 'No hay pagos validados pendientes de conciliar.' : 'Sin pagos en el histórico.'}</Empty> : null}
              {d.rows.map((p) => (
                <Card key={p.id}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <T v="big" style={{ fontSize: 22, flex: 1 }}>{pesos(p.amount)}</T>
                    <LabelPill label={p.status} />
                  </View>
                  <T style={{ fontFamily: fonts.medium }}>{`${p.client.name} · ···${p.client.documentLast4}`}</T>
                  <Pills style={{ marginTop: 6 }}>
                    <LabelPill label={p.kind} />
                    {p.possibleDuplicates.length ? <LabelPill label={{ code: 'DUP', label: `Posible duplicado (${p.possibleDuplicates.length})`, tone: 'bad' }} /> : null}
                  </Pills>
                  <View style={{ marginTop: space.sm }}>
                    <Line label="Pagado el" value={fecha(p.paidOn)} />
                    <Line label="Canal" value={p.channel} />
                    <Line label="Referencia" value={p.reference ?? '—'} />
                    <Line label="Crédito" value={`${p.loan.alias}${p.loan.entityName ? ` · ${p.loan.entityName}` : ''}`} />
                    <Line label="Saldo actual" value={pesos(p.loan.balance)} />
                    <Line label="Reportado" value={fechaHora(p.createdAt)} />
                    {p.reviewer ? <Line label="Revisor" value={`${p.reviewer.name}${p.reviewer.at ? ` · ${fechaHora(p.reviewer.at)}` : ''}`} /> : null}
                    {p.reconciled ? <Line label="Conciliado" value={`${p.reconciled.reference ?? ''}${p.reconciled.at ? ` · ${fechaHora(p.reconciled.at)}` : ''}`} /> : null}
                  </View>
                  {p.rejectReason ? <T v="small" style={{ color: colors.danger }}>{`Rechazo: ${p.rejectReason}`}</T> : null}
                  {p.possibleDuplicates.length ? <T v="small" style={{ color: colors.danger, marginTop: 4 }}>{`Otros reportes con el mismo soporte o mismo crédito, fecha y valor: ${p.possibleDuplicates.map((x) => x.status.label).join(', ')}.`}</T> : null}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: space.md }}>
                    {p.support?.viewable ? <Button small variant="secondary" title="Ver soporte" icon={<Eye size={16} color={colors.ink} />} loading={opening === p.id} onPress={() => support(p)} /> : p.support ? <LabelPill label={p.support.status} prefix="Soporte" /> : <T v="small">Sin soporte adjunto</T>}
                    {p.can.take ? <Button small variant="secondary" title="Tomar" onPress={() => take(p)} /> : null}
                    {p.can.validate ? <Button small title="Validar" onPress={() => validate(p)} /> : null}
                    {p.can.reject ? <Button small variant="danger" title="Rechazar" onPress={() => reject(p)} /> : null}
                    {p.can.reconcile ? <Button small title="Conciliar" onPress={() => reconcile(p)} /> : null}
                    <Button small variant="secondary" title="Cliente" onPress={() => router.push(routes.cliente(p.client.personId))} />
                  </View>
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
