import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import type { DocumentLinkResponse } from '@/lib/movil/contract';
import { api, ApiError, getToken } from '@/services/api';
import { API_URL, USER_AGENT } from '@/services/config';

/**
 * Archivos del expediente: foto con la cámara, imagen de la galería o PDF, y
 * descarga autenticada de PDFs (escenarios, documentos) para abrirlos con el
 * visor del sistema. El servidor acepta PDF, JPG y PNG de hasta 10 MB.
 */

export const ACCEPTED = ['application/pdf', 'image/jpeg', 'image/png'];
export const MAX_BYTES = 10 * 1024 * 1024;

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  size: number | null;
  /** Solo en web: el archivo del navegador. */
  webFile?: globalThis.File;
}

export class PickError extends Error {}

function extFor(mime: string) {
  return mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : 'jpg';
}

function normalizeMime(mime: string | null | undefined, name: string): string {
  const m = (mime ?? '').toLowerCase();
  if (m === 'image/jpg') return 'image/jpeg';
  if (m) return m;
  const ext = name.split('.').pop()?.toLowerCase();
  return ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : '';
}

function validate(file: PickedFile, maxBytes: number): PickedFile {
  if (!ACCEPTED.includes(file.mimeType)) throw new PickError('Formato no admitido. Usa una foto (JPG o PNG) o un PDF.');
  if (file.size !== null && file.size > maxBytes) throw new PickError(`El archivo supera ${Math.round(maxBytes / 1024 / 1024)} MB. Toma la foto de nuevo o comprime el PDF.`);
  return file;
}

function fromImage(asset: ImagePicker.ImagePickerAsset, prefix: string, maxBytes: number): PickedFile {
  const mimeType = normalizeMime(asset.mimeType, asset.fileName ?? asset.uri) || 'image/jpeg';
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
  return validate({ uri: asset.uri, name: `${prefix}-${stamp}.${extFor(mimeType)}`, mimeType, size: asset.fileSize ?? asset.file?.size ?? null, webFile: asset.file }, maxBytes);
}

const IMAGE_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.8,
  exif: false,
  // iOS: entrega JPEG (no HEIC), que es lo que acepta el servidor.
  preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
};

export async function pickFromCamera(prefix = 'foto', maxBytes = MAX_BYTES): Promise<PickedFile | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new PickError('Sin permiso para usar la cámara. Actívalo en los ajustes del teléfono o elige un archivo.');
  const res = await ImagePicker.launchCameraAsync(IMAGE_OPTIONS);
  if (res.canceled || !res.assets?.[0]) return null;
  return fromImage(res.assets[0], prefix, maxBytes);
}

export async function pickFromGallery(prefix = 'imagen', maxBytes = MAX_BYTES): Promise<PickedFile | null> {
  if (Platform.OS !== 'web') {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) throw new PickError('Sin permiso para ver tus fotos. Actívalo en los ajustes del teléfono o adjunta un PDF.');
  }
  const res = await ImagePicker.launchImageLibraryAsync(IMAGE_OPTIONS);
  if (res.canceled || !res.assets?.[0]) return null;
  return fromImage(res.assets[0], prefix, maxBytes);
}

export async function pickPdf(maxBytes = MAX_BYTES): Promise<PickedFile | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  const mimeType = normalizeMime(a.mimeType, a.name);
  return validate({ uri: a.uri, name: a.name || 'documento.pdf', mimeType, size: a.size ?? a.file?.size ?? null, webFile: a.file }, maxBytes);
}

/** Agrega el archivo al formulario multipart con su nombre y tipo. */
export async function appendFile(form: FormData, field: string, picked: PickedFile) {
  if (Platform.OS === 'web') {
    const blob = picked.webFile ?? (await (await globalThis.fetch(picked.uri)).blob());
    form.append(field, blob, picked.name);
    return;
  }
  // Copia con un nombre legible (la cámara entrega nombres aleatorios).
  const dir = new Directory(Paths.cache, 'subidas');
  dir.create({ idempotent: true, intermediates: true });
  const dest = new File(dir, picked.name.replace(/[^\w.\- ]+/g, '_'));
  new File(picked.uri).copySync(dest, { overwrite: true });
  form.append(field, dest as unknown as Blob, picked.name);
}

/**
 * Descarga un PDF protegido con el Bearer de la sesión y lo abre con el visor
 * del sistema (Vista previa en iOS, visor de Android) para verlo, guardarlo o
 * compartirlo.
 */
export async function openProtectedPdf(path: string, fileName: string) {
  const url = path.startsWith('http') ? path : `${API_URL}${path}`;
  const token = getToken();
  const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
  if (token) headers.Authorization = `Bearer ${token}`;
  const safe = fileName.replace(/[^\w.\- ]+/g, '_').slice(0, 80) || 'documento';
  const name = safe.toLowerCase().endsWith('.pdf') ? safe : `${safe}.pdf`;

  if (Platform.OS === 'web') {
    const res = await globalThis.fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error(res.status === 423 ? 'El documento está en verificación antivirus. Inténtalo en unos minutos.' : 'No pudimos descargar el archivo.');
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = name;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    return;
  }

  const dir = new Directory(Paths.cache, 'pdf');
  dir.create({ idempotent: true, intermediates: true });
  let file: File;
  try {
    file = await File.downloadFileAsync(url, new File(dir, name), { headers, idempotent: true });
  } catch {
    throw new Error('No pudimos descargar el archivo. Revisa tu conexión e inténtalo de nuevo.');
  }
  // Si el servidor respondió un error JSON en lugar del PDF, no lo abrimos.
  const head = file.bytesSync().slice(0, 5);
  if (String.fromCharCode(...head) !== '%PDF-') {
    let message = 'No pudimos abrir el documento.';
    try {
      message = (JSON.parse(file.textSync()) as { message?: string }).message ?? message;
    } catch {
      // cuerpo no JSON
    }
    file.delete();
    throw new Error(message);
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error('Este teléfono no tiene un visor de PDF disponible.');
  await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: name });
}

/** Pide el enlace temporal (5 min) de un documento propio y lo abre con el visor del sistema. */
export async function openDocument(id: string, name: string) {
  let link: DocumentLinkResponse;
  try {
    link = await api.get<DocumentLinkResponse>(`/cliente/documentos/${id}/enlace`);
  } catch (e) {
    throw new Error(e instanceof ApiError ? e.message : 'No pudimos abrir el documento.');
  }
  await openProtectedPdf(link.url, name);
}
