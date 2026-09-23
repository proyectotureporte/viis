import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import type { DocumentosResponse } from '@/lib/movil/contract';
import { formData } from '@/services/api';
import { useAction, useApi } from '@/services/hooks';
import { FilePicker } from '@/ui/cliente/components';
import { appendFile, type PickedFile } from '@/ui/cliente/files';
import { backTo, R } from '@/ui/cliente/nav';
import { Button, ErrorState, Loading, Notice, ResultBanner, Screen, Select, T } from '@/ui/kit';

export default function Subir() {
  const params = useLocalSearchParams<{ typeId?: string; caseId?: string }>();
  const { data, error, loading, reload } = useApi<DocumentosResponse>('/cliente/documentos');
  if (loading && !data) return <Screen><Loading /></Screen>;
  if (error && !data) return <Screen><ErrorState message={error} onRetry={reload} /></Screen>;
  if (!data) return null;
  return (
    <UploadForm
      data={data}
      initialType={data.uploadTypes.some((t) => t.id === params.typeId) ? params.typeId! : ''}
      initialCase={data.caseOptions.some((c) => c.id === params.caseId) ? params.caseId! : data.caseOptions.length === 1 ? data.caseOptions[0].id : ''}
    />
  );
}

function UploadForm({ data, initialType, initialCase }: { data: DocumentosResponse; initialType: string; initialCase: string }) {
  const [typeId, setTypeId] = useState(initialType);
  const [caseId, setCaseId] = useState(initialCase);
  const [file, setFile] = useState<PickedFile | null>(null);
  const [sending, setSending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const action = useAction();
  const type = data.uploadTypes.find((t) => t.id === typeId);

  async function submit() {
    if (!typeId || !file) return;
    setSending(true);
    setLocalError(null);
    try {
      const form = formData({ typeId, opportunityId: caseId || undefined });
      await appendFile(form, 'file', file);
      const res = await action.run('/cliente/documentos', form);
      if (res.ok) setFile(null);
    } catch {
      setLocalError('No pudimos leer el archivo. Elígelo de nuevo.');
    } finally {
      setSending(false);
    }
  }

  return (
    <Screen>
      <T v="muted" style={{ marginBottom: 12 }}>{data.notice}</T>
      <View style={{ gap: 14 }}>
        <Select label="Tipo de documento" value={typeId} options={data.uploadTypes.map((t) => ({ value: t.id, label: t.name, hint: t.description ?? undefined }))} onChange={setTypeId} placeholder="Elige qué vas a subir" />
        {type?.description ? <T v="small">{type.description}</T> : null}
        {data.caseOptions.length ? (
          <Select label="Caso (opcional)" value={caseId} options={[{ value: '', label: 'Solo a mi expediente' }, ...data.caseOptions.map((c) => ({ value: c.id, label: c.label }))]} onChange={setCaseId} />
        ) : null}
        <FilePicker value={file} onChange={setFile} prefix={type ? type.code.toLowerCase() : 'documento'} />
        <Notice tone="info">Revisa que se lea completo, sin cortes ni reflejos. Si es de varias páginas, súbelo en PDF.</Notice>
        <ResultBanner result={localError ? { ok: false, message: localError } : action.result} />
        <Button title="Subir documento" onPress={submit} loading={sending || action.pending} disabled={!typeId || !file} />
        {action.result?.ok ? <Button variant="secondary" title="Volver a Documentos" onPress={() => backTo(R.documentos)} /> : null}
      </View>
    </Screen>
  );
}
