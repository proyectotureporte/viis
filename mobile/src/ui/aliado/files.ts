import * as DocumentPicker from 'expo-document-picker';
import { Directory, File as FSFile, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { getToken } from '@/services/api';
import { API_URL, USER_AGENT } from '@/services/config';

/**
 * Archivos del portal aliado: captura (cámara, galería, PDF), adjunto al
 * FormData y descarga autenticada (documentos, .ics, CSV) para abrir con el
 * visor del sistema mediante expo-sharing.
 */

export const MAX_BYTES = 10 * 1024 * 1024;

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  size: number | null;
  /** Solo en web: el archivo del navegador. */
  webFile?: Blob;
}

export type PickOutcome = { ok: true; file: PickedFile } | { ok: false; canceled: true } | { ok: false; canceled: false; message: string };

function extension(mime: string): string {
  return mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : 'jpg';
}

function outcome(file: PickedFile): PickOutcome {
  if (file.size !== null && file.size > MAX_BYTES) return { ok: false, canceled: false, message: 'El archivo supera 10 MB. Toma la foto de nuevo o reduce el PDF.' };
  return { ok: true, file };
}

function fromImage(asset: ImagePicker.ImagePickerAsset, prefix: string): PickedFile {
  const mimeType = asset.mimeType && ['image/jpeg', 'image/png'].includes(asset.mimeType) ? asset.mimeType : 'image/jpeg';
  const name = asset.fileName && /\.(jpe?g|png)$/i.test(asset.fileName) ? asset.fileName : `${prefix}-${Date.now()}.${extension(mimeType)}`;
  return { uri: asset.uri, name, mimeType, size: asset.fileSize ?? asset.file?.size ?? null, webFile: asset.file };
}

/** Cámara del teléfono (sin edición: el documento debe verse completo). */
export async function takePhoto(): Promise<PickOutcome> {
  if (Platform.OS !== 'web') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      return { ok: false, canceled: false, message: 'Sin permiso de cámara. Actívalo en Ajustes › OpenV › Cámara, o carga el documento desde la galería o como PDF.' };
    }
  }
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.75, allowsEditing: false, exif: false });
  if (result.canceled || !result.assets[0]) return { ok: false, canceled: true };
  return outcome(fromImage(result.assets[0], 'foto'));
}

/** Foto ya tomada (selector del sistema; no requiere permiso de galería). */
export async function pickImage(): Promise<PickOutcome> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: false, exif: false });
  if (result.canceled || !result.assets[0]) return { ok: false, canceled: true };
  return outcome(fromImage(result.assets[0], 'imagen'));
}

export async function pickPdf(): Promise<PickOutcome> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false });
  if (result.canceled || !result.assets[0]) return { ok: false, canceled: true };
  const asset = result.assets[0];
  const name = /\.pdf$/i.test(asset.name) ? asset.name : `${asset.name || 'documento'}.pdf`;
  return outcome({ uri: asset.uri, name, mimeType: 'application/pdf', size: asset.size ?? asset.file?.size ?? null, webFile: asset.file });
}

/** Adjunta el archivo al FormData con el nombre de campo que espera la acción web. */
export function appendFile(form: FormData, field: string, file: PickedFile): void {
  if (file.webFile) {
    form.append(field, file.webFile, file.name);
    return;
  }
  form.append(field, new FSFile(file.uri) as unknown as Blob);
}

export class DownloadError extends Error {}

async function webDownload(url: string, fileName: string, mode: 'open' | 'save'): Promise<void> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${getToken() ?? ''}` } });
  if (!response.ok) throw new DownloadError((await response.text().catch(() => '')) || `No pudimos descargar el archivo (error ${response.status}).`);
  const href = URL.createObjectURL(await response.blob());
  if (mode === 'open') {
    window.open(href, '_blank', 'noopener');
  } else {
    const a = document.createElement('a');
    a.href = href;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

/**
 * Descarga un recurso protegido con el Bearer de la sesión a la caché y lo
 * entrega al sistema (Vista previa / Calendario / Archivos).
 */
export async function downloadAndShare(path: string, opts: { fileName: string; mimeType: string; UTI?: string; dialogTitle: string }): Promise<void> {
  const url = path.startsWith('http') ? path : `${API_URL}${path}`;
  if (Platform.OS === 'web') {
    try {
      await webDownload(url, opts.fileName, opts.mimeType === 'application/pdf' ? 'open' : 'save');
    } catch (error) {
      throw error instanceof DownloadError ? error : new DownloadError('No pudimos descargar el archivo. Revisa tu conexión e inténtalo de nuevo.');
    }
    return;
  }
  const dir = new Directory(Paths.cache, 'aliado');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const target = new FSFile(dir, opts.fileName);
  let file: FSFile;
  try {
    file = await FSFile.downloadFileAsync(url, target, { headers: { Authorization: `Bearer ${getToken() ?? ''}`, 'User-Agent': USER_AGENT }, idempotent: true });
  } catch {
    throw new DownloadError('No pudimos descargar el archivo. Puede que el enlace venció o que no tengas conexión; inténtalo de nuevo.');
  }
  if (!(await Sharing.isAvailableAsync())) throw new DownloadError('Este dispositivo no permite abrir el archivo con otra aplicación.');
  await Sharing.shareAsync(file.uri, { mimeType: opts.mimeType, UTI: opts.UTI, dialogTitle: opts.dialogTitle });
}
