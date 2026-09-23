import { CircleCheck, CircleX, Eye, FileUp, Hand } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import type { ChecklistItemView } from '@/lib/movil/contract-empresa';
import { fecha, fechaHora } from '@/services/format';
import { Button, Card, Empty, Progress, Section, T } from '@/ui/kit';
import { colors, space } from '@/ui/theme';
import { useDialog } from '../dialogs';
import { viewDocument } from '../files';
import { UploadSheet } from '../UploadSheet';
import { LabelPill, Pills } from '../ui';
import type { CasoCtx } from './types';

export function Documentos({ d, act, pending, notify }: CasoCtx) {
  const dialog = useDialog();
  const [upload, setUpload] = useState<{ open: boolean; type: string | null }>({ open: false, type: null });
  const [opening, setOpening] = useState<string | null>(null);
  const { approved, total, items } = d.checklist;

  async function view(id: string, name: string) {
    setOpening(id);
    notify(await viewDocument(id, name));
    setOpening(null);
  }

  async function take(item: ChecklistItemView) {
    if (!item.latest) return;
    await act(`/documentos/${item.latest.id}/tomar`, {});
  }

  async function approve(item: ChecklistItemView) {
    if (!item.latest) return;
    const ok = await dialog.confirm({
      title: `Aprobar ${item.type.name}`,
      message: `Versión ${item.latest.version} · ${item.latest.fileName}. ${item.type.validityDays ? `Vencerá en ${item.type.validityDays} días.` : 'No tiene fecha de vencimiento.'}`,
      confirmLabel: 'Aprobar',
    });
    if (ok) await act(`/documentos/${item.latest.id}/revision`, { decision: 'APPROVE' });
  }

  async function reject(item: ChecklistItemView) {
    if (!item.latest) return;
    const v = await dialog.ask({
      title: `Rechazar ${item.type.name}`,
      message: 'El cliente verá el motivo y podrá cargar una nueva versión.',
      confirmLabel: 'Rechazar',
      destructive: true,
      fields: [{ name: 'reason', label: 'Motivo del rechazo', kind: 'multiline', required: true, minLength: 5, maxLength: 500, placeholder: 'Ej. La foto está borrosa; carga ambas caras legibles.' }],
    });
    if (v) await act(`/documentos/${item.latest.id}/revision`, { decision: 'REJECT', reason: v.reason });
  }

  return (
    <>
      <Section title="Checklist documental" right={<T v="small">{`${approved} de ${total} aprobados`}</T>}>
        <Progress value={total ? (approved / total) * 100 : 0} />
        {d.can.upload ? <Button title="Cargar documento" icon={<FileUp size={18} color={colors.navy} />} onPress={() => setUpload({ open: true, type: null })} /> : null}
        {items.length === 0 ? <Empty>No hay tipos documentales configurados para este producto.</Empty> : null}
        {items.map((item) => {
          const l = item.latest;
          return (
            <Card key={item.type.id}>
              <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'space-between' }}>
                <T v="h3" style={{ flex: 1 }}>{`${item.type.name}${item.type.required ? '' : ' (opcional)'}`}</T>
                {item.status ? <LabelPill label={item.status} /> : <LabelPill label={{ code: 'NONE', label: 'Pendiente de carga', tone: item.type.required ? 'wait' : 'gray' }} />}
              </View>
              {item.type.description ? <T v="small">{item.type.description}</T> : null}
              {l ? (
                <>
                  <T v="small" style={{ marginTop: 6, color: colors.ink }}>{`Versión ${l.version} · ${l.fileName} · ${Math.max(1, Math.round(l.sizeBytes / 1024))} KB`}</T>
                  <T v="small">{`Cargado ${fechaHora(l.createdAt)}${l.expiresAt ? ` · vence ${fecha(l.expiresAt)}` : ''}${l.reviewer ? ` · revisor ${l.reviewer}` : ''}`}</T>
                  {l.rejectReason && l.status.code === 'REJECTED' ? <T v="small" style={{ color: colors.danger }}>{`Motivo del rechazo: ${l.rejectReason}`}</T> : null}
                </>
              ) : (
                <T v="small" style={{ marginTop: 6 }}>{`Sin carga${item.type.validityDays ? ` · vigencia ${item.type.validityDays} días` : ''}`}</T>
              )}
              {item.history.length ? (
                <Pills style={{ marginTop: 6 }}>
                  {item.history.map((h) => (
                    <LabelPill key={h.id} label={{ ...h.status, label: `v${h.version} ${h.status.label.toLowerCase()}` }} />
                  ))}
                </Pills>
              ) : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: space.md }}>
                {l?.viewable ? <Button small variant="secondary" title="Ver" icon={<Eye size={16} color={colors.ink} />} loading={opening === l.id} onPress={() => view(l.id, item.type.name)} /> : null}
                {d.can.review && l?.status.code === 'UPLOADED' ? <Button small variant="secondary" title="Tomar" icon={<Hand size={16} color={colors.ink} />} onPress={() => take(item)} loading={pending} /> : null}
                {d.can.review && item.pendingReview ? <Button small title="Aprobar" icon={<CircleCheck size={16} color={colors.navy} />} onPress={() => approve(item)} /> : null}
                {d.can.review && item.pendingReview ? <Button small variant="danger" title="Rechazar" icon={<CircleX size={16} color={colors.white} />} onPress={() => reject(item)} /> : null}
                {d.can.upload ? <Button small variant="secondary" title={l ? 'Nueva versión' : 'Cargar'} icon={<FileUp size={16} color={colors.ink} />} onPress={() => setUpload({ open: true, type: item.type.id })} /> : null}
              </View>
            </Card>
          );
        })}
      </Section>
      <UploadSheet
        visible={upload.open}
        initialType={upload.type}
        onClose={() => setUpload({ open: false, type: null })}
        types={d.options.documentTypes}
        pending={pending}
        onSubmit={async (form) => (await act('/documentos', form)).ok}
      />
    </>
  );
}
