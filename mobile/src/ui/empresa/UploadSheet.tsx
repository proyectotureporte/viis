import { Camera, FileText, Image as ImageIcon } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { formData } from '@/services/api';
import { Button, Notice, Select, T, type Option } from '@/ui/kit';
import { colors } from '@/ui/theme';
import { appendFile, pickImage, pickPdf, takePhoto, type PickedFile, type PickOutcome } from './files';
import { Sheet } from './ui';

/**
 * Carga de un documento al expediente: tipo documental + cámara, galería o
 * PDF. El servidor valida el tipo real por firma de bytes, pasa antivirus y
 * guarda cifrado.
 */
export function UploadSheet({
  visible,
  onClose,
  types,
  initialType,
  onSubmit,
  pending,
}: {
  visible: boolean;
  onClose: () => void;
  types: Option[];
  initialType?: string | null;
  onSubmit: (form: FormData) => Promise<boolean>;
  pending: boolean;
}) {
  const [typeId, setTypeId] = useState<string | null>(initialType ?? null);
  const [file, setFile] = useState<PickedFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastInitial, setLastInitial] = useState(initialType);
  if (initialType !== lastInitial) {
    setLastInitial(initialType);
    setTypeId(initialType ?? null);
  }

  async function pick(fn: () => Promise<PickOutcome>) {
    setError(null);
    const res = await fn();
    if (res.ok) setFile(res.file);
    else if (!res.canceled) setError(res.message);
  }

  async function submit() {
    if (!typeId) return setError('Elige el tipo de documento.');
    if (!file) return setError('Adjunta un archivo (foto o PDF).');
    const form = formData({ typeId });
    appendFile(form, 'file', file);
    const ok = await onSubmit(form);
    if (ok) {
      setFile(null);
      onClose();
    }
  }

  return (
    <Sheet
      visible={visible}
      title="Cargar documento"
      onClose={onClose}
      footer={<Button title="Cargar al expediente" onPress={submit} loading={pending} disabled={!file || !typeId} />}
    >
      <Select label="Tipo de documento" value={typeId} options={types} onChange={setTypeId} />
      <T v="small">PDF, JPG o PNG de máximo 10 MB. El documento debe verse completo y legible.</T>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button small variant="secondary" title="Cámara" icon={<Camera size={16} color={colors.ink} />} onPress={() => pick(takePhoto)} style={{ flex: 1 }} />
        <Button small variant="secondary" title="Galería" icon={<ImageIcon size={16} color={colors.ink} />} onPress={() => pick(pickImage)} style={{ flex: 1 }} />
        <Button small variant="secondary" title="PDF" icon={<FileText size={16} color={colors.ink} />} onPress={() => pick(pickPdf)} style={{ flex: 1 }} />
      </View>
      {file ? <Notice tone="info">{`Listo para cargar: ${file.name}${file.size ? ` (${Math.round(file.size / 1024)} KB)` : ''}`}</Notice> : null}
      {error ? <Notice tone="bad">{error}</Notice> : null}
    </Sheet>
  );
}
