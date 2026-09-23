import { FileText, Upload } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import type { ChecklistItem, DocumentosResponse } from '@/lib/movil/contract';
import { useApi } from '@/services/hooks';
import { fecha } from '@/services/format';
import { toneOf } from '@/ui/cliente/components';
import { go, R } from '@/ui/cliente/nav';
import { useOpenDocument } from '@/ui/cliente/useOpen';
import { Button, Card, Empty, ErrorState, Loading, Notice, Pill, ResultBanner, Screen, Section, T } from '@/ui/kit';
import { colors, fonts } from '@/ui/theme';

export default function Documentos() {
  const { data, error, loading, refreshing, refresh, reload } = useApi<DocumentosResponse>('/cliente/documentos');
  const docs = useOpenDocument();

  if (loading && !data) return <Screen><Loading /></Screen>;
  if (error && !data) return <Screen><ErrorState message={error} onRetry={reload} /></Screen>;
  if (!data) return null;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Notice tone="info">{data.notice}</Notice>
      <Button title="Subir un documento" icon={<Upload size={18} color={colors.navy} />} onPress={() => go(R.subir())} style={{ marginTop: 12 }} />
      {docs.error ? <View style={{ marginTop: 10 }}><ResultBanner result={{ ok: false, message: docs.error }} /></View> : null}

      <Section title="Lo que falta por caso">
        {data.cases.length === 0 ? (
          <Empty>No tienes casos en trámite que pidan documentos. Puedes mantener tu expediente al día subiendo los que quieras.</Empty>
        ) : (
          data.cases.map((c) => (
            <Card key={c.id}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                <T v="h3" style={{ flex: 1 }}>{c.code} · {c.productLabel}</T>
                <Pill tone={c.pendingCount ? 'wait' : 'ok'}>{c.pendingCount ? `${c.pendingCount} pendientes` : 'Completo'}</Pill>
              </View>
              <View style={{ gap: 10, marginTop: 12 }}>
                {c.items.map((it) => <ChecklistRow key={it.type.id} it={it} caseId={c.id} onOpen={docs.open} opening={docs.pendingId} />)}
              </View>
            </Card>
          ))
        )}
      </Section>

      <Section title="Mi expediente">
        {data.expediente.length === 0 ? (
          <Empty>Aún no has subido documentos.</Empty>
        ) : (
          data.expediente.map((g) => (
            <Card key={g.typeId}>
              <T v="h3">{g.typeName}</T>
              <View style={{ gap: 8, marginTop: 8 }}>
                {g.versions.map((d) => (
                  <Pressable
                    key={d.id}
                    disabled={!d.viewable}
                    onPress={() => docs.open(d.id, `${g.typeName} v${d.version}`)}
                    style={({ pressed }) => [{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 6 }, pressed && { opacity: 0.7 }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Ver ${g.typeName} versión ${d.version}`}
                  >
                    <FileText size={18} color={d.viewable ? colors.blue : colors.muted} />
                    <View style={{ flex: 1 }}>
                      <T v="small" style={{ color: colors.ink, fontFamily: fonts.medium }} numberOfLines={1}>v{d.version} · {d.fileName}</T>
                      <T v="small">{fecha(d.createdAt)}{d.caseCode ? ` · caso ${d.caseCode}` : ''}{d.expiresAt ? ` · vence ${fecha(d.expiresAt)}` : ''}{d.viewable ? '' : ' · en verificación antivirus'}</T>
                      {d.rejectReason ? <T v="small" style={{ color: colors.danger }}>Motivo: {d.rejectReason}</T> : null}
                    </View>
                    <Pill tone={toneOf(d.status.tone)}>{docs.pendingId === d.id ? 'Abriendo…' : d.status.label}</Pill>
                  </Pressable>
                ))}
              </View>
            </Card>
          ))
        )}
      </Section>
    </Screen>
  );
}

function ChecklistRow({ it, caseId, onOpen, opening }: { it: ChecklistItem; caseId: string; onOpen: (id: string, name: string) => void; opening: string | null }) {
  const d = it.latest;
  const tone = !d ? (it.type.required ? 'wait' : 'gray') : it.expired ? 'bad' : toneOf(d.status.tone);
  const label = !d ? (it.type.required ? 'Falta' : 'Opcional') : it.expired ? 'Vencido' : d.status.label;
  return (
    <View style={{ borderTopWidth: 1, borderColor: colors.mist, paddingTop: 10 }}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <T v="h3" style={{ fontSize: 14.5 }}>{it.type.name}{it.type.required ? '' : ' (opcional)'}</T>
          {it.type.description ? <T v="small">{it.type.description}</T> : null}
          {d ? <T v="small">Versión {d.version} · {fecha(d.createdAt)}{d.expiresAt ? ` · vence ${fecha(d.expiresAt)}` : ''}</T> : null}
          {d?.rejectReason ? <T v="small" style={{ color: colors.danger }}>Motivo del rechazo: {d.rejectReason}</T> : null}
          {it.expiringSoon ? <T v="small" style={{ color: colors.amber }}>Vence pronto: súbelo actualizado.</T> : null}
        </View>
        <Pill tone={tone}>{label}</Pill>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        {it.needsUpload || it.expiringSoon ? <Button small title={d ? 'Subir de nuevo' : 'Subir'} onPress={() => go(R.subir(it.type.id, caseId))} /> : null}
        {d && d.viewable ? <Button small variant="secondary" title={opening === d.id ? 'Abriendo…' : 'Ver'} onPress={() => onOpen(d.id, `${it.type.name} v${d.version}`)} /> : null}
      </View>
    </View>
  );
}
