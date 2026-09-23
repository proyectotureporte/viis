import * as DocumentPicker from 'expo-document-picker';
import { Directory, File as FSFile, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import type { DocumentLinkResponse } from '@/lib/movil/contract-empresa';
import { api, ApiError, getToken } from '@/services/api';
import { API_URL, USER_AGENT } from '@/services/config';

/**
 * Archivos de la consola: captura (cámara, galería, PDF) para cargar al
 * expediente, y descarga autenticada (documentos con marca de agua, CSV) a la
 * caché para abrirla con el visor del sistema mediante expo-sharing.
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

function outcome(file: PickedFile): PickOutcome {
  if (file.size !== null && file.size > MAX_BYTES) return { ok: false, canceled: false, message: 'El archivo supera 10 MB. Toma la foto de nuevo o reduce el PDF.' };
  return { ok: true, file };
}

function fromImage(asset: ImagePicker.ImagePickerAsset, prefix: string): PickedFile {
  const mimeType = asset.mimeType && ['image/jpeg', 'image/png'].includes(asset.mimeType) ? asset.mimeType : 'image/jpeg';
  const ext = mimeType === 'image/png' ? 'png' : 'jpg';
  const name = asset.fileName && /\.(jpe?g|png)$/i.test(asset.fileName) ? asset.fileName : `${prefix}-${Date.now()}.${ext}`;
  return { uri: asset.uri, name, mimeType, size: asset.fileSize ?? asset.file?.size ?? null, webFile: asset.file };
}

export async function takePhoto(): Promise<PickOutcome> {
  if (Platform.OS !== 'web') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return { ok: false, canceled: false, message: 'Sin permiso de cámara. Actívalo en Ajustes › OpenV › Cámara, o carga el documento desde la galería o como PDF.' };
  }
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.75, allowsEditing: false, exif: false });
  if (result.canceled || !result.assets[0]) return { ok: false, canceled: true };
  return outcome(fromImage(result.assets[0], 'foto'));
}

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
  if (!response.ok) throw new DownloadError(`No pudimos descargar el archivo (error ${response.status}).`);
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

/** Descarga un recurso protegido con el Bearer de la sesión y lo abre con el visor del sistema. */
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
  const dir = new Directory(Paths.cache, 'empresa');
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

/**
 * Ver un documento del expediente: pide el enlace firmado (5 min, verificado
 * para este usuario) y abre el PDF con marca de agua en el visor del sistema.
 * La descarga queda registrada en la bitácora (`document.viewed`).
 */
export async function viewDocument(documentId: string, label = 'Documento'): Promise<{ ok: boolean; message: string }> {
  try {
    const link = await api.get<DocumentLinkResponse>(`/empresa/documentos/${documentId}/enlace`);
    await downloadAndShare(link.url, { fileName: `${label.replace(/[^\wáéíóúñÁÉÍÓÚÑ-]+/g, '-').slice(0, 40)}-${documentId.slice(0, 8)}.pdf`, mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: label });
    return { ok: true, message: 'Documento abierto con marca de agua. La consulta quedó registrada en la bitácora.' };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, message: error.status === 423 ? 'El documento sigue en verificación antivirus; inténtalo en unos minutos.' : error.message };
    return { ok: false, message: error instanceof Error ? error.message : 'No pudimos abrir el documento.' };
  }
}

/** Exporta un CSV (`csvPath` de la API) con el mismo Bearer y lo comparte. */
export async function exportCsv(csvPath: string, name: string): Promise<{ ok: boolean; message: string }> {
  try {
    await downloadAndShare(csvPath, { fileName: `${name}-${new Date().toISOString().slice(0, 10)}.csv`, mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: 'Exportar CSV' });
    return { ok: true, message: 'CSV generado. Elige dónde guardarlo o con qué app abrirlo.' };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'No pudimos exportar el CSV.' };
  }
}
