import { Camera, FileText, ImageIcon, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Stage, SummaryLine } from '@/lib/movil/contract';
import { pesos } from '@/services/format';
import { Button, Card, Notice, T } from '@/ui/kit';
import { colors, fonts, radius, space, toneColors, type Tone } from '@/ui/theme';
import { DateField as NativeDateField } from '@/ui/DateField';
import { pickFromCamera, pickFromGallery, pickPdf, PickError, type PickedFile } from './files';

// ── Tonos ────────────────────────────────────────────────────────────────

/** Tono del servidor (web) o del radar → tono del kit. */
export function toneOf(tone: string | null | undefined): Tone {
  switch (tone) {
    case 'ok':
      return 'ok';
    case 'info':
      return 'info';
    case 'wait':
    case 'amber':
      return 'wait';
    case 'bad':
    case 'red':
      return 'bad';
    default:
      return 'gray';
  }
}

// ── Etapas del caso ──────────────────────────────────────────────────────

const PIPELINE: Stage[] = ['LEAD', 'CONTACTED', 'PROFILED', 'DOCUMENTING', 'FILED', 'APPROVED', 'SIGNED', 'DISBURSED'];
export const STAGE_LABELS: Record<Stage, string> = {
  LEAD: 'Lead',
  CONTACTED: 'Contactado',
  PROFILED: 'Perfilado',
  DOCUMENTING: 'Documentando',
  FILED: 'Radicado',
  APPROVED: 'Aprobado',
  SIGNED: 'Firmado',
  DISBURSED: 'Desembolsado',
  WITHDRAWN: 'Desistido',
  POSTSALE: 'Posventa',
};

/** Pasos del trámite: hechos, actual y pendientes (misma lógica que la web). */
export function StageSteps({ stage }: { stage: Stage }) {
  if (stage === 'WITHDRAWN') {
    return (
      <View style={st.stepHead}>
        <View style={[st.step, st.stepNow]}><Text style={st.stepNowText}>{STAGE_LABELS.WITHDRAWN}</Text></View>
      </View>
    );
  }
  const current = stage === 'POSTSALE' ? PIPELINE.length : PIPELINE.indexOf(stage);
  const next = PIPELINE[current + 1];
  return (
    <View accessible accessibilityLabel={`Etapa ${Math.min(current + 1, PIPELINE.length)} de ${PIPELINE.length}: ${STAGE_LABELS[stage]}`}>
      <View style={st.segments}>
        {PIPELINE.map((s, i) => (
          <View key={s} style={[st.segment, i < current && { backgroundColor: colors.mint }, i === current && { backgroundColor: colors.navy }]} />
        ))}
      </View>
      <View style={st.stepHead}>
        <Text style={st.stepLabel}>
          {stage === 'POSTSALE' ? 'Trámite completado · Posventa' : `Paso ${current + 1} de ${PIPELINE.length}: ${STAGE_LABELS[stage]}`}
        </Text>
        {next && stage !== 'POSTSALE' ? <Text style={st.stepNext}>Sigue: {STAGE_LABELS[next]}</Text> : null}
      </View>
    </View>
  );
}

// ── Mapa de cada peso ────────────────────────────────────────────────────

export const PESO_COLORS = { capital: '#18c6a3', interest: '#195f78', insurance: '#e5a43e', extra: '#7c5cc4' };

export function PesoMap({ parts, caption }: { parts: { label: string; value: number; color: string }[]; caption?: string }) {
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0);
  return (
    <View>
      <View style={st.pesoBar} accessibilityRole="image" accessibilityLabel={parts.map((p) => `${p.label} ${pesos(p.value)}`).join(', ')}>
        {parts.map((p) => (total > 0 && p.value > 0 ? <View key={p.label} style={{ flex: p.value / total, backgroundColor: p.color }} /> : null))}
      </View>
      <View style={{ gap: 8, marginTop: 10 }}>
        {parts.map((p) => (
          <View key={p.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: p.color }} />
            <T v="small" style={{ flex: 1, color: colors.ink }}>{p.label}</T>
            <T v="h3">{pesos(p.value)}</T>
            <T v="small" style={{ width: 44, textAlign: 'right' }}>{total > 0 ? `${Math.round((p.value / total) * 100)} %` : '—'}</T>
          </View>
        ))}
      </View>
      {caption ? <T v="small" style={{ marginTop: 8 }}>{caption}</T> : null}
    </View>
  );
}

// ── Línea de tiempo ──────────────────────────────────────────────────────

export function Timeline({ items }: { items: { key: string; title: string; meta?: string; detail?: string | null }[] }) {
  return (
    <View>
      {items.map((it, i) => (
        <View key={it.key} style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ alignItems: 'center', width: 14 }}>
            <View style={st.tlDot} />
            {i < items.length - 1 ? <View style={st.tlLine} /> : null}
          </View>
          <View style={{ flex: 1, paddingBottom: 14 }}>
            <T v="h3">{it.title}</T>
            {it.meta ? <T v="small">{it.meta}</T> : null}
            {it.detail ? <T v="small" style={{ color: colors.ink, marginTop: 2 }}>{it.detail}</T> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Listas de texto ──────────────────────────────────────────────────────

export function Bullets({ items, color = colors.muted }: { items: string[]; color?: string }) {
  return (
    <View style={{ gap: 6 }}>
      {items.map((a) => (
        <View key={a} style={{ flexDirection: 'row', gap: 8 }}>
          <Text style={{ color, fontFamily: fonts.bold }}>•</Text>
          <Text style={{ flex: 1, color, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19 }}>{a}</Text>
        </View>
      ))}
    </View>
  );
}

/** Etiqueta a la izquierda y valor a la derecha; ambos pueden partir línea sin desbordar. */
export function Lines({ lines }: { lines: SummaryLine[] }) {
  return (
    <View style={{ gap: 10 }}>
      {lines.map((l) => (
        <View key={l.label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }} accessible accessibilityLabel={`${l.label}: ${l.value}`}>
          <T v="small" style={{ flex: 1 }}>{l.label}</T>
          <T v="h3" style={{ flex: 1, textAlign: 'right' }}>{l.value}</T>
        </View>
      ))}
    </View>
  );
}

/** Resultados + advertencias + supuestos + "no vinculante": siempre visibles juntos. */
export function SimDisclosure({ warnings, assumptions, notBinding, engineVersion }: { warnings: string[]; assumptions: string[]; notBinding: string; engineVersion?: string }) {
  return (
    <View style={{ gap: space.md }}>
      {warnings.map((w) => <Notice key={w}>{w}</Notice>)}
      <Card>
        <T v="eyebrow" style={{ marginBottom: 8 }}>Supuestos</T>
        {assumptions.length ? <Bullets items={assumptions} /> : <T v="small">Sin supuestos adicionales.</T>}
      </Card>
      <View style={st.notBinding} accessibilityRole="text">
        <T v="small" style={{ color: colors.ink, fontFamily: fonts.semibold }}>{notBinding}</T>
        {engineVersion ? <T v="small" style={{ marginTop: 4 }}>Motor {engineVersion}</T> : null}
      </View>
    </View>
  );
}

// ── Fechas ───────────────────────────────────────────────────────────────

/** true si es una fecha real AAAA-MM-DD. */
export function isIsoDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}


/** Error de validación de una fecha (o undefined si es válida o está vacía y es opcional). */
export function dateProblem(v: string, opts: { required?: boolean; min?: string; max?: string; minText?: string; maxText?: string } = {}): string | undefined {
  if (!v) return opts.required ? 'Elige la fecha.' : undefined;
  if (!isIsoDate(v)) return 'Elige una fecha válida.';
  if (opts.min && v < opts.min) return opts.minText ?? `Debe ser desde ${opts.min}.`;
  if (opts.max && v > opts.max) return opts.maxText ?? `No puede ser posterior a ${opts.max}.`;
  return undefined;
}

/** Campo de fecha: selector nativo del sistema (valor AAAA-MM-DD). */
export function DateField(props: { label: string; value: string; onChange: (v: string) => void; hint?: string; error?: string; shortcuts?: { label: string; value: string }[] }) {
  return <NativeDateField {...props} />;
}

// ── Selector de archivo ──────────────────────────────────────────────────

export function FilePicker({ value, onChange, prefix = 'documento', label = 'Archivo' }: { value: PickedFile | null; onChange: (f: PickedFile | null) => void; prefix?: string; label?: string }) {
  const [error, setError] = useState<string | null>(null);
  async function pick(kind: 'camera' | 'gallery' | 'pdf') {
    setError(null);
    try {
      const f = kind === 'camera' ? await pickFromCamera(prefix) : kind === 'gallery' ? await pickFromGallery(prefix) : await pickPdf();
      if (f) onChange(f);
    } catch (e) {
      setError(e instanceof PickError ? e.message : 'No pudimos abrir el archivo. Inténtalo de nuevo.');
    }
  }
  return (
    <View style={{ gap: 8 }}>
      <T v="small" style={{ fontFamily: fonts.semibold, color: colors.muted }}>{label}</T>
      {value ? (
        <View style={st.fileBox}>
          {value.mimeType === 'application/pdf' ? <FileText size={22} color={colors.blue} /> : <ImageIcon size={22} color={colors.blue} />}
          <View style={{ flex: 1 }}>
            <T v="h3" numberOfLines={1}>{value.name}</T>
            <T v="small">{value.mimeType === 'application/pdf' ? 'PDF' : 'Imagen'}{value.size ? ` · ${value.size >= 1024 * 1024 ? `${(value.size / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(value.size / 1024))} KB`}` : ''}</T>
          </View>
          <Pressable onPress={() => onChange(null)} accessibilityRole="button" accessibilityLabel="Quitar archivo" hitSlop={10}>
            <X size={20} color={colors.muted} />
          </Pressable>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button small variant="secondary" title="Cámara" icon={<Camera size={16} color={colors.ink} />} onPress={() => pick('camera')} style={{ flex: 1 }} />
          <Button small variant="secondary" title="Galería" icon={<ImageIcon size={16} color={colors.ink} />} onPress={() => pick('gallery')} style={{ flex: 1 }} />
          <Button small variant="secondary" title="PDF" icon={<FileText size={16} color={colors.ink} />} onPress={() => pick('pdf')} style={{ flex: 1 }} />
        </View>
      )}
      <T v="small">PDF, JPG o PNG de hasta 10 MB. Que se lea completo y sin reflejos.</T>
      {error ? <T v="small" style={{ color: colors.danger }}>{error}</T> : null}
    </View>
  );
}

// ── Otros ────────────────────────────────────────────────────────────────

export function Chip({ label, onPress, active }: { label: string; onPress: () => void; active?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[st.chip, active && { backgroundColor: colors.navy, borderColor: colors.navy }]} accessibilityRole="button" accessibilityState={{ selected: Boolean(active) }}>
      <Text style={[st.chipText, active && { color: colors.white }]}>{label}</Text>
    </Pressable>
  );
}

export function Dot({ tone }: { tone: Tone }) {
  return <View style={{ width: 10, height: 10, borderRadius: 5, marginTop: 5, backgroundColor: tone === 'ok' ? colors.mint : toneColors[tone].fg }} />;
}

const st = StyleSheet.create({
  step: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 99, backgroundColor: '#edf1f2' },
  stepNow: { backgroundColor: colors.navy },
  stepNowText: { fontFamily: fonts.bold, fontSize: 12, color: colors.white },
  segments: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 6, borderRadius: 3, backgroundColor: '#e3eaec' },
  stepHead: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 6, marginTop: 6 },
  stepLabel: { fontFamily: fonts.semibold, fontSize: 13, color: colors.ink },
  stepNext: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted },
  pesoBar: { flexDirection: 'row', height: 14, borderRadius: 99, overflow: 'hidden', backgroundColor: '#e8eef0' },
  tlDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.mint, borderWidth: 2, borderColor: colors.okSoft, marginTop: 4 },
  tlLine: { flex: 1, width: 2, backgroundColor: colors.line, marginTop: 2 },
  notBinding: { padding: 12, borderRadius: radius.md, backgroundColor: colors.sky, borderWidth: 1, borderColor: '#c5e6e9' },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  chipText: { fontFamily: fonts.medium, fontSize: 13, color: colors.ink },
  fileBox: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.mist },
});
