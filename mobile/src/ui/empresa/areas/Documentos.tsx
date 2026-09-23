import { router } from 'expo-router';
import { CircleCheck, CircleX, Eye, Hand } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import type { DocQueueRow, DocumentosResponse } from '@/lib/movil/contract-empresa';
import { fechaHora } from '@/services/format';
import { useAction } from '@/services/hooks';
import { Button, Card, Empty, Notice, Select, T } from '@/ui/kit';
import { colors, fonts, space } from '@/ui/theme';
import { useEmpresa } from '../context';
import { useDialog } from '../dialogs';
import { viewDocument } from '../files';
import { qs, useLoad } from '../hooks';
import { routes } from '../nav';
import { Chip, ChipRow, LabelPill, Loadable, Page, Pager, Pills, ResultFooter } from '../ui';
import type { AreaProps } from './types';

function waiting(h: number) {
  return h < 1 ? 'menos de 1 h' : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} días`;
}

export function DocumentosArea({ tab, title, header }: AreaProps) {
  const [estado, setEstado] = useState<'' | 'UPLOADED' | 'IN_REVIEW'>('');
  const [tipo, setTipo] = useState('');
  const [mios, setMios] = useState(false);
  const [page, setPage] = useState(1);
  const q = useLoad<DocumentosResponse>(`/empresa/documentos${qs({ estado, tipo, mios: mios ? '1' : '', pagina: page })}`);
  const action = useAction();
  const dialog = useDialog();
  const { refreshMenu } = useEmpresa();
  const [local, setLocal] = useState<{ ok: boolean; message: string } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  async function run(path: string, body: Record<string, unknown> = {}) {
    setLocal(null);
    const res = await action.run(path, body);
    if (res.ok) {
      q.reload();
      void refreshMenu(true);
    }
  }

  async function approve(r: DocQueueRow) {
    const ok = await dialog.confirm({ title: `Aprobar ${r.type.name}`, message: `${r.person.name} · versión ${r.version}. ${r.type.validityDays ? `Vencerá en ${r.type.validityDays} días.` : 'Sin fecha de vencimiento.'}`, confirmLabel: 'Aprobar' });
    if (ok) await run(`/empresa/documentos/${r.id}/aprobar`);
  }

  async function reject(r: DocQueueRow) {
    const v = await dialog.ask({
      title: `Rechazar ${r.type.name}`,
      message: `${r.person.name} verá el motivo y podrá cargar una nueva versión.`,
      confirmLabel: 'Rechazar',
      destructive: true,
      fields: [{ name: 'reason', label: 'Motivo del rechazo', kind: 'multiline', required: true, minLength: 5, maxLength: 500 }],
    });
    if (v) await run(`/empresa/documentos/${r.id}/rechazar`, v);
  }

  async function open(r: DocQueueRow) {
    setOpening(r.id);
    setLocal(await viewDocument(r.id, r.type.name));
    setOpening(null);
  }

  const result = local ?? action.result;
  const set = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <Page
      tab={tab}
      title={title}
      refreshing={q.refreshing}
      onRefresh={q.refresh}
      busy={q.stale && !q.loading}
      footer={result ? <ResultFooter result={result} onClose={() => { setLocal(null); action.clear(); }} /> : undefined}
    >
      {header}
      <ChipRow>
        <Chip label="Todos" active={estado === ''} onPress={() => set(() => setEstado(''))} />
        <Chip label="Cargados" active={estado === 'UPLOADED'} count={q.data?.counts.uploaded} onPress={() => set(() => setEstado('UPLOADED'))} />
        <Chip label="En revisión" active={estado === 'IN_REVIEW'} count={q.data?.counts.inReview} onPress={() => set(() => setEstado('IN_REVIEW'))} />
        <Chip label="Tomados por mí" active={mios} onPress={() => set(() => setMios(!mios))} />
      </ChipRow>
      <Loadable q={q}>
        {(d) => (
          <>
            {d.types.length ? <Select label="Tipo documental" value={tipo} options={[{ value: '', label: 'Todos los tipos' }, ...d.types]} onChange={(v) => set(() => setTipo(v))} /> : null}
            {d.counts.quarantined ? (
              <View style={{ marginTop: space.md }}>
                <Notice tone="wait">{`${d.counts.quarantined} ${d.counts.quarantined === 1 ? 'documento en cuarentena' : 'documentos en cuarentena'} del antivirus: nadie puede abrirlos hasta que el reescaneo los libere.`}</Notice>
              </View>
            ) : null}
            <T v="small" style={{ marginTop: space.md }}>Más antiguos primero.</T>
            <View style={{ gap: space.md, marginTop: space.sm }}>
              {d.rows.length === 0 ? <Empty>No hay documentos pendientes de revisión con estos filtros.</Empty> : null}
              {d.rows.map((r) => (
                <Card key={r.id}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <T v="h3" style={{ flex: 1 }}>{`${r.type.name} · v${r.version}`}</T>
                    <LabelPill label={r.status} />
                  </View>
                  <T style={{ fontFamily: fonts.medium }}>{r.person.name}</T>
                  <T v="small">{`${r.fileName} · ${Math.max(1, Math.round(r.sizeBytes / 1024))} KB · antivirus ${r.scanResult}`}</T>
                  <Pills style={{ marginTop: 6 }}>
                    <LabelPill label={{ code: 'W', label: `Espera ${waiting(r.waitingHours)}`, tone: r.waitingHours > 24 ? 'bad' : r.waitingHours > 8 ? 'wait' : 'gray' }} />
                    {r.reviewer ? <LabelPill label={{ code: 'R', label: r.reviewerIsMe ? 'En revisión por ti' : `Revisa ${r.reviewer.name}`, tone: 'info' }} /> : null}
                  </Pills>
                  <T v="small" style={{ marginTop: 4 }}>{`Cargado ${fechaHora(r.createdAt)}`}</T>
                  {r.case ? <T v="small" style={{ color: colors.blue, fontFamily: fonts.semibold, marginTop: 2 }} >{`Caso ${r.case.code}`}</T> : null}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: space.md }}>
                    <Button small variant="secondary" title="Ver" icon={<Eye size={16} color={colors.ink} />} loading={opening === r.id} onPress={() => open(r)} />
                    {r.canTake ? <Button small variant="secondary" title="Tomar" icon={<Hand size={16} color={colors.ink} />} onPress={() => run(`/empresa/documentos/${r.id}/tomar`)} /> : null}
                    <Button small title="Aprobar" icon={<CircleCheck size={16} color={colors.navy} />} onPress={() => approve(r)} />
                    <Button small variant="danger" title="Rechazar" icon={<CircleX size={16} color={colors.white} />} onPress={() => reject(r)} />
                    {r.case ? <Button small variant="secondary" title="Expediente" onPress={() => router.push(routes.caso(r.case!.id))} /> : <Button small variant="secondary" title="Cliente" onPress={() => router.push(routes.cliente(r.person.id))} />}
                  </View>
                </Card>
              ))}
            </View>
            <Pager page={d.page} onChange={setPage} />
            {d.quarantined.length ? (
              <View style={{ marginTop: space.xl, gap: 8 }}>
                <T v="h2">En cuarentena</T>
                {d.quarantined.map((x) => (
                  <Card key={x.id}>
                    <T v="h3">{`${x.type} · ${x.person.name}`}</T>
                    <T v="small">{`${fechaHora(x.createdAt)} · ${x.scanResult}`}</T>
                  </Card>
                ))}
              </View>
            ) : null}
          </>
        )}
      </Loadable>
    </Page>
  );
}
