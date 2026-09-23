import { Image } from 'expo-image';
import { Camera, FileText, ImageIcon, RotateCcw, Upload } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { formData } from '@/services/api';
import { useAction } from '@/services/hooks';
import { Button, Notice, ResultBanner, T } from '@/ui/kit';
import { colors, radius, space } from '@/ui/theme';
import { appendFile, pickImage, pickPdf, takePhoto, type PickedFile, type PickOutcome } from './files';
import { Sheet } from './parts';

const CONSEJOS = [
  'Documento completo, sin dedos ni bordes cortados, sobre una superficie oscura y plana.',
  'Luz natural o de frente; evita reflejos y flash sobre plásticos.',
  'Teléfono paralelo al documento, a unos 25 cm; espera a que enfoque antes de disparar.',
  'Cédula por ambas caras: carga una foto por cara o, mejor, un PDF con las dos.',
  'Verifica la fecha: certificados laborales, de deuda y de tradición no deben superar 30 días.',
];

type Stage = 'choose' | 'tips' | 'preview';

/**
 * Carga guiada de un documento del caso: consejos de legibilidad antes de
 * disparar, vista previa con "reintentar", galería o PDF. Sube por multipart
 * a POST /aliado/clientes/{id}/documentos.
 */
export function CaptureSheet({
  visible,
  caseId,
  type,
  onClose,
  onUploaded,
}: {
  visible: boolean;
  caseId: string;
  type: { id: string; name: string; description: string | null } | null;
  onClose: () => void;
  onUploaded: (message: string) => void;
}) {
  const [stage, setStage] = useState<Stage>('choose');
  const [file, setFile] = useState<PickedFile | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const { run, pending, result, clear } = useAction();

  function reset() {
    setStage('choose');
    setFile(null);
    setProblem(null);
    clear();
  }

  function close() {
    reset();
    onClose();
  }

  async function handle(promise: Promise<PickOutcome>, from: Stage) {
    setProblem(null);
    clear();
    let res: PickOutcome;
    try {
      res = await promise;
    } catch {
      res = { ok: false, canceled: false, message: 'No pudimos abrir la cámara o el selector de archivos.' };
    }
    if (res.ok) {
      setFile(res.file);
      setStage('preview');
    } else {
      setStage(from);
      if (!res.canceled) setProblem(res.message);
    }
  }

  async function upload() {
    if (!file || !type) return;
    const form = formData({ typeId: type.id });
    appendFile(form, 'file', file);
    const res = await run(`/aliado/clientes/${caseId}/documentos`, form);
    if (res.ok) {
      reset();
      onUploaded(res.message);
    }
  }

  const isImage = file?.mimeType.startsWith('image/');

  return (
    <Sheet visible={visible} title={type ? type.name : 'Documento'} onClose={close}>
      {type?.description ? <T v="small">{type.description}</T> : null}
      {problem ? <Notice tone="bad">{problem}</Notice> : null}

      {stage === 'choose' ? (
        <View style={{ gap: space.sm }}>
          <Button title="Tomar foto guiada" icon={<Camera size={18} color={colors.navy} />} onPress={() => setStage('tips')} />
          <Button title="Elegir foto de la galería" variant="secondary" icon={<ImageIcon size={18} color={colors.ink} />} onPress={() => handle(pickImage(), 'choose')} />
          <Button title="Subir PDF" variant="secondary" icon={<FileText size={18} color={colors.ink} />} onPress={() => handle(pickPdf(), 'choose')} />
          <T v="small">PDF, JPG o PNG de máximo 10 MB. Nunca envíes documentos por WhatsApp o correo personal.</T>
        </View>
      ) : null}

      {stage === 'tips' ? (
        <View style={{ gap: space.md }}>
          <T v="h3">Antes de disparar</T>
          {CONSEJOS.map((c, i) => (
            <View key={c} style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.sky, alignItems: 'center', justifyContent: 'center' }}>
                <T v="small" style={{ color: colors.navy }}>{i + 1}</T>
              </View>
              <T style={{ flex: 1, fontSize: 14 }}>{c}</T>
            </View>
          ))}
          <Button title="Abrir cámara" icon={<Camera size={18} color={colors.navy} />} onPress={() => handle(takePhoto(), 'tips')} />
          <Button title="Volver" variant="secondary" onPress={() => setStage('choose')} />
        </View>
      ) : null}

      {stage === 'preview' && file ? (
        <View style={{ gap: space.md }}>
          <T v="h3">Revisa que se lea bien</T>
          {isImage ? (
            <Image source={{ uri: file.uri }} style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: radius.md, backgroundColor: colors.mist }} contentFit="contain" accessibilityLabel="Vista previa del documento" />
          ) : (
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', padding: space.md, borderRadius: radius.md, backgroundColor: colors.mist }}>
              <FileText size={24} color={colors.navy} />
              <T style={{ flex: 1 }} numberOfLines={2}>{file.name}</T>
            </View>
          )}
          {isImage ? <T v="small">¿Se leen todos los datos, sin reflejos ni partes cortadas? Si no, repítela: un documento ilegible se rechaza y retrasa el caso.</T> : null}
          <ResultBanner result={result && !result.ok ? result : null} />
          <Button title="Usar y cargar" icon={<Upload size={18} color={colors.navy} />} loading={pending} onPress={upload} />
          <Button
            title={isImage ? 'Reintentar' : 'Elegir otro archivo'}
            variant="secondary"
            icon={<RotateCcw size={16} color={colors.ink} />}
            disabled={pending}
            onPress={() => {
              setFile(null);
              clear();
              if (isImage) setStage('tips');
              else void handle(pickPdf(), 'choose');
            }}
          />
          <Button title="Cancelar" variant="secondary" disabled={pending} onPress={reset} />
        </View>
      ) : null}
    </Sheet>
  );
}
