import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import type { CatalogosResponse } from '@/lib/movil/contract-empresa';
import type { ActionResult } from '@/services/api';
import { decimal, fecha, pct } from '@/services/format';
import { useAction } from '@/services/hooks';
import { Button, Card, Checkbox, Empty, Field, Notice, Pill, T } from '@/ui/kit';
import { colors, fonts, space } from '@/ui/theme';
import { useDialog } from '../dialogs';
import { useLoad } from '../hooks';
import { Chip, ChipRow, LabelPill, Line, Loadable, Page, Pills, ResultFooter, Sheet } from '../ui';
import type { AreaProps } from './types';

type CatTab = 'entidades' | 'tasas' | 'parametros' | 'tipos' | 'cursos';
type DocType = CatalogosResponse['documentTypes'][number];
type Course = CatalogosResponse['courses'][number];

const check = (v: string | undefined) => (v === 'on' ? true : undefined);

function paramValue(unit: 'fraction' | 'number', v: number) {
  return unit === 'fraction' ? pct(v, 2) : decimal(v, 4).replace(/,?0+$/, '');
}

/** Formulario de tipo documental (con productos múltiples). */
function DocTypeSheet({ open, onClose, initial, products, onSubmit, pending }: { open: boolean; onClose: () => void; initial: DocType | null; products: { value: string; label: string }[]; onSubmit: (body: Record<string, unknown>) => Promise<ActionResult>; pending: boolean }) {
  const blank = { code: '', name: '', description: '', validityDays: '', products: [] as string[], required: false, active: true, sortOrder: '100' };
  const [v, setV] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState(false);
  if (open !== seen) {
    setSeen(open);
    if (open) {
      setError(null);
      setV(initial ? { code: initial.code, name: initial.name, description: initial.description ?? '', validityDays: initial.validityDays ? String(initial.validityDays) : '', products: initial.products, required: initial.required, active: initial.active, sortOrder: String(initial.sortOrder) } : blank);
    }
  }
  async function submit() {
    const res = await onSubmit({
      ...(initial ? {} : { code: v.code.trim().toUpperCase() }),
      name: v.name.trim(),
      description: v.description.trim() || undefined,
      validityDays: v.validityDays.trim() || undefined,
      products: v.products,
      required: v.required || undefined,
      active: v.active || undefined,
      sortOrder: v.sortOrder.trim(),
    });
    if (res.ok) onClose();
    else setError(res.message);
  }
  return (
    <Sheet visible={open} title={initial ? `Editar ${initial.code}` : 'Nuevo tipo documental'} onClose={onClose} footer={<Button title="Guardar" onPress={submit} loading={pending} />}>
      {!initial ? <Field label="Código (MAYÚSCULAS_CON_GUION)" value={v.code} onChangeText={(code) => setV({ ...v, code })} autoCapitalize="characters" autoCorrect={false} maxLength={40} /> : null}
      <Field label="Nombre" value={v.name} onChangeText={(name) => setV({ ...v, name })} maxLength={160} />
      <Field label="Descripción para el cliente (opcional)" value={v.description} onChangeText={(description) => setV({ ...v, description })} multiline maxLength={2000} />
      <Field label="Vigencia en días (vacío = no vence)" value={v.validityDays} onChangeText={(t) => setV({ ...v, validityDays: t.replace(/\D/g, '') })} keyboardType="number-pad" />
      <Field label="Orden" value={v.sortOrder} onChangeText={(t) => setV({ ...v, sortOrder: t.replace(/\D/g, '') })} keyboardType="number-pad" />
      <T v="small" style={{ fontFamily: fonts.semibold }}>Productos que lo piden (ninguno = todos)</T>
      {products.map((p) => (
        <Checkbox key={p.value} checked={v.products.includes(p.value)} onChange={(on) => setV({ ...v, products: on ? [...v.products, p.value] : v.products.filter((x) => x !== p.value) })}>
          {p.label}
        </Checkbox>
      ))}
      <Checkbox checked={v.required} onChange={(required) => setV({ ...v, required })}>Obligatorio en el checklist</Checkbox>
      <Checkbox checked={v.active} onChange={(active) => setV({ ...v, active })}>Activo</Checkbox>
      {error ? <Notice tone="bad">{error}</Notice> : null}
    </Sheet>
  );
}

/** Nueva versión del contenido de un curso (lecciones y evaluación en JSON). */
function CourseContentSheet({ course, onClose, onSubmit, pending }: { course: Course | null; onClose: () => void; onSubmit: (body: Record<string, unknown>) => Promise<ActionResult>; pending: boolean }) {
  const [v, setV] = useState({ title: '', summary: '', content: '' });
  const [error, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState<string | null>(null);
  if ((course?.id ?? null) !== seen) {
    setSeen(course?.id ?? null);
    if (course) {
      setError(null);
      setV({ title: course.title, summary: course.summary, content: JSON.stringify(course.content, null, 2) });
    }
  }
  async function submit() {
    try {
      JSON.parse(v.content);
    } catch {
      return setError('El contenido no es un JSON válido: revisa comillas, comas y corchetes.');
    }
    const res = await onSubmit({ title: v.title.trim(), summary: v.summary.trim(), content: v.content });
    if (res.ok) onClose();
    else setError(res.message);
  }
  return (
    <Sheet visible={Boolean(course)} title="Nueva versión del contenido" onClose={onClose} footer={<Button title="Publicar versión" onPress={submit} loading={pending} />}>
      <Notice tone="wait">Se publica como una versión nueva del curso y el cambio queda en la bitácora. El servidor valida lecciones y evaluación.</Notice>
      <Field label="Título" value={v.title} onChangeText={(title) => setV({ ...v, title })} maxLength={160} />
      <Field label="Resumen" value={v.summary} onChangeText={(summary) => setV({ ...v, summary })} multiline maxLength={2000} />
      <Field label='Contenido JSON: { "lessons": [{ "title", "body": [..] }], "quiz": [{ "q", "options": [..], "answer": 0 }] }' value={v.content} onChangeText={(content) => setV({ ...v, content })} multiline autoCapitalize="none" autoCorrect={false} />
      {error ? <Notice tone="bad">{error}</Notice> : null}
    </Sheet>
  );
}

export function CatalogosArea({ tab, title, header }: AreaProps) {
  const [section, setSection] = useState<CatTab>('entidades');
  const q = useLoad<CatalogosResponse>('/empresa/catalogos');
  const action = useAction();
  const dialog = useDialog();
  const [docType, setDocType] = useState<{ open: boolean; item: DocType | null }>({ open: false, item: null });
  const [course, setCourse] = useState<Course | null>(null);

  async function run(path: string, body: Record<string, unknown>) {
    const res = await action.run(path, body);
    if (res.ok) q.reload();
    return res;
  }

  async function newEntity() {
    const v = await dialog.ask({
      title: 'Nueva entidad financiera',
      confirmLabel: 'Crear',
      fields: [
        { name: 'name', label: 'Nombre', required: true, minLength: 2, maxLength: 120 },
        { name: 'slaHours', label: 'SLA de respuesta (horas)', kind: 'number', required: true, initial: '72' },
        { name: 'agreement', label: 'Tiene convenio con OpenV', kind: 'check' },
        { name: 'notes', label: 'Notas', kind: 'multiline', maxLength: 2000 },
      ],
    });
    if (v) await run('/empresa/catalogos/entidades', { name: v.name, slaHours: v.slaHours, agreement: check(v.agreement), notes: v.notes || undefined });
  }

  async function editEntity(e: CatalogosResponse['entities'][number]) {
    const v = await dialog.ask({
      title: e.name,
      message: `${e.cases} casos · ${e.loans} créditos. El nombre no se cambia para conservar la trazabilidad.`,
      confirmLabel: 'Guardar',
      fields: [
        { name: 'slaHours', label: 'SLA de respuesta (horas)', kind: 'number', required: true, initial: String(e.slaHours) },
        { name: 'active', label: 'Activa', kind: 'check', initial: e.active ? 'on' : '' },
        { name: 'agreement', label: 'Tiene convenio con OpenV', kind: 'check', initial: e.agreement ? 'on' : '' },
        { name: 'notes', label: 'Notas', kind: 'multiline', maxLength: 2000, initial: e.notes ?? '' },
      ],
    });
    if (v) await run(`/empresa/catalogos/entidades/${e.id}`, { slaHours: v.slaHours, active: check(v.active), agreement: check(v.agreement), notes: v.notes || undefined });
  }

  async function newRate(d: CatalogosResponse) {
    const v = await dialog.ask({
      title: 'Nueva tasa de referencia',
      message: 'Toda tasa debe tener fuente y fecha: la app nunca muestra valores sin respaldo.',
      confirmLabel: 'Registrar tasa',
      fields: [
        { name: 'entityId', label: 'Entidad (vacío = mercado)', kind: 'select', options: [{ value: '', label: 'Referencia de mercado' }, ...d.entities.filter((e) => e.active).map((e) => ({ value: e.id, label: e.name }))] },
        { name: 'product', label: 'Producto', kind: 'select', required: true, options: d.options.products },
        { name: 'system', label: 'Sistema', kind: 'select', required: true, options: d.options.systems, initial: 'FIXED_PESOS' },
        { name: 'rateEa', label: 'Tasa EA (%)', kind: 'number', required: true, placeholder: 'Ej. 12,5' },
        { name: 'source', label: 'Fuente', required: true, minLength: 5, maxLength: 200, placeholder: 'Ej. Tasa publicada en la web de la entidad, 23-sep-2026' },
        { name: 'asOf', label: 'Fecha del dato', kind: 'date', required: true },
        { name: 'validUntil', label: 'Vigente hasta', kind: 'date' },
      ],
    });
    if (v) await run('/empresa/catalogos/tasas', v);
  }

  async function newParam(d: CatalogosResponse, key?: string) {
    const v = await dialog.ask({
      title: 'Nuevo valor de parámetro',
      message: 'Se agrega al historial; el motor usa siempre el más reciente. INFLACION_PROYECTADA va en %.',
      confirmLabel: 'Registrar valor',
      fields: [
        { name: 'key', label: 'Parámetro', kind: 'select', required: true, options: d.options.parameterKeys.map((k) => ({ value: k, label: k })), initial: key },
        { name: 'value', label: 'Valor', kind: 'number', required: true, placeholder: 'Ej. 389,1234 o 4,5' },
        { name: 'source', label: 'Fuente', required: true, minLength: 5, maxLength: 200, placeholder: 'Ej. Banco de la República, serie UVR' },
        { name: 'asOf', label: 'Fecha del dato', kind: 'date', required: true },
      ],
    });
    if (v) await run('/empresa/catalogos/parametros', v);
  }

  async function editCourse(c: Course) {
    const v = await dialog.ask({
      title: c.title,
      message: `Versión ${c.version} · ${c.enrollments} inscripciones · ${c.certifications} certificaciones.`,
      confirmLabel: 'Guardar',
      fields: [
        { name: 'validityDays', label: 'Vigencia de la certificación (días)', kind: 'number', required: true, initial: String(c.validityDays) },
        { name: 'passScore', label: 'Puntaje mínimo (1–100)', kind: 'number', required: true, initial: String(c.passScore) },
        { name: 'active', label: 'Activo', kind: 'check', initial: c.active ? 'on' : '' },
        { name: 'critical', label: 'Crítico (bloquea radicar si está vencido)', kind: 'check', initial: c.critical ? 'on' : '' },
        { name: 'mandatory', label: 'Obligatorio', kind: 'check', initial: c.mandatory ? 'on' : '' },
      ],
    });
    if (v) await run(`/empresa/catalogos/cursos/${c.id}`, { validityDays: v.validityDays, passScore: v.passScore, active: check(v.active), critical: check(v.critical), mandatory: check(v.mandatory) });
  }

  return (
    <Page tab={tab} title={title} refreshing={q.refreshing} onRefresh={q.refresh} footer={action.result ? <ResultFooter result={action.result} onClose={action.clear} /> : undefined}>
      {header}
      <ChipRow>
        <Chip label="Entidades" active={section === 'entidades'} onPress={() => setSection('entidades')} />
        <Chip label="Tasas" active={section === 'tasas'} onPress={() => setSection('tasas')} />
        <Chip label="UVR e inflación" active={section === 'parametros'} onPress={() => setSection('parametros')} />
        <Chip label="Tipos documentales" active={section === 'tipos'} onPress={() => setSection('tipos')} />
        <Chip label="Cursos" active={section === 'cursos'} onPress={() => setSection('cursos')} />
      </ChipRow>
      <Loadable q={q}>
        {(d) => (
          <>
            {section === 'entidades' ? (
              <View style={{ gap: space.md }}>
                <Button title="Nueva entidad" icon={<Plus size={18} color={colors.navy} />} onPress={newEntity} />
                {d.entities.map((e) => (
                  <Card key={e.id} onPress={() => editEntity(e)} style={!e.active ? { opacity: 0.7 } : undefined}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                      <T v="h3" style={{ flex: 1 }}>{e.name}</T>
                      {e.active ? <Pill tone="ok">Activa</Pill> : <Pill tone="gray">Inactiva</Pill>}
                    </View>
                    <Pills style={{ marginTop: 6 }}>
                      <Pill tone="info">{`SLA ${e.slaHours} h`}</Pill>
                      {e.agreement ? <Pill tone="ok">Con convenio</Pill> : null}
                    </Pills>
                    <T v="small" style={{ marginTop: 4 }}>{`${e.cases} casos · ${e.loans} créditos · actualizada ${fecha(e.updatedAt)}`}</T>
                    {e.notes ? <T v="small">{e.notes}</T> : null}
                  </Card>
                ))}
              </View>
            ) : null}

            {section === 'tasas' ? (
              <View style={{ gap: space.md }}>
                <Button title="Registrar tasa" icon={<Plus size={18} color={colors.navy} />} onPress={() => newRate(d)} />
                <T v="small">Últimas 100 tasas registradas.</T>
                {d.rates.length === 0 ? <Empty>Aún no hay tasas de referencia.</Empty> : null}
                {d.rates.map((r) => (
                  <Card key={r.id} style={r.expired ? { opacity: 0.7 } : undefined}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                      <T v="h3" style={{ flex: 1 }}>{r.entity?.name ?? 'Mercado'}</T>
                      <T v="h3">{pct(r.rateEa, 2)}</T>
                    </View>
                    <Pills style={{ marginTop: 6 }}>
                      <LabelPill label={r.product} />
                      <LabelPill label={r.system} />
                      {r.expired ? <Pill tone="bad">Vencida</Pill> : null}
                    </Pills>
                    <T v="small" style={{ marginTop: 4 }}>{`Fuente: ${r.source}`}</T>
                    <T v="small">{`Dato del ${fecha(r.asOf)}${r.validUntil ? ` · vigente hasta ${fecha(r.validUntil)}` : ''}`}</T>
                  </Card>
                ))}
              </View>
            ) : null}

            {section === 'parametros' ? (
              <View style={{ gap: space.md }}>
                <Button title="Registrar valor" icon={<Plus size={18} color={colors.navy} />} onPress={() => newParam(d)} />
                {d.options.parameterKeys.map((key) => {
                  const p = d.parameters.find((x) => x.key === key);
                  return (
                    <Card key={key}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                        <T v="h3">{key}</T>
                        <T v="h3">{p ? paramValue(p.unit, p.latest) : 'Sin valor'}</T>
                      </View>
                      {!p ? <T v="small" style={{ color: colors.danger }}>Sin valor registrado. Regístralo con su fuente y fecha.</T> : null}
                      {p?.history.map((h) => (
                        <Line key={h.id} label={`${fecha(h.asOf)} · ${h.source}`} value={paramValue(p.unit, h.value)} />
                      ))}
                      <Button small variant="secondary" title="Nuevo valor" onPress={() => newParam(d, key)} style={{ marginTop: space.sm, alignSelf: 'flex-start' }} />
                    </Card>
                  );
                })}
              </View>
            ) : null}

            {section === 'tipos' ? (
              <View style={{ gap: space.md }}>
                <Button title="Nuevo tipo documental" icon={<Plus size={18} color={colors.navy} />} onPress={() => setDocType({ open: true, item: null })} />
                {d.documentTypes.map((t) => (
                  <Card key={t.id} onPress={() => setDocType({ open: true, item: t })} style={!t.active ? { opacity: 0.7 } : undefined}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                      <T v="h3" style={{ flex: 1 }}>{t.name}</T>
                      {t.required ? <Pill tone="wait">Obligatorio</Pill> : <Pill tone="gray">Opcional</Pill>}
                    </View>
                    <T v="small">{`${t.code} · orden ${t.sortOrder} · ${t.validityDays ? `vence en ${t.validityDays} días` : 'no vence'} · ${t.documents} documentos`}</T>
                    <T v="small">{t.products.length ? t.products.map((p) => d.options.docProducts.find((x) => x.value === p)?.label ?? p).join(', ') : 'Todos los productos'}</T>
                    {!t.active ? <Pill tone="gray">Inactivo</Pill> : null}
                  </Card>
                ))}
              </View>
            ) : null}

            {section === 'cursos' ? (
              <View style={{ gap: space.md }}>
                {d.courses.length === 0 ? <Empty>Sin cursos.</Empty> : null}
                {d.courses.map((c) => (
                  <Card key={c.id} style={!c.active ? { opacity: 0.7 } : undefined}>
                    <T v="h3">{c.title}</T>
                    <T v="small">{c.summary}</T>
                    <Pills style={{ marginTop: 6 }}>
                      <Pill tone={c.active ? 'ok' : 'gray'}>{c.active ? 'Activo' : 'Inactivo'}</Pill>
                      {c.critical ? <Pill tone="bad">Crítico</Pill> : null}
                      {c.mandatory ? <Pill tone="wait">Obligatorio</Pill> : null}
                      <Pill tone="info">{`v${c.version}`}</Pill>
                    </Pills>
                    <T v="small" style={{ marginTop: 4 }}>{`Aprueba con ${c.passScore} · vigencia ${c.validityDays} días · ${c.enrollments} inscritos · ${c.certifications} certificados`}</T>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: space.md }}>
                      <Button small variant="secondary" title="Reglas" onPress={() => editCourse(c)} style={{ flex: 1 }} />
                      <Button small variant="secondary" title="Contenido" onPress={() => { action.clear(); setCourse(c); }} style={{ flex: 1 }} />
                    </View>
                  </Card>
                ))}
              </View>
            ) : null}

            <DocTypeSheet
              open={docType.open}
              initial={docType.item}
              onClose={() => setDocType({ open: false, item: null })}
              products={d.options.docProducts}
              pending={action.pending}
              onSubmit={(body) => run(docType.item ? `/empresa/catalogos/tipos-documentales/${docType.item.id}` : '/empresa/catalogos/tipos-documentales', body)}
            />
            <CourseContentSheet course={course} onClose={() => setCourse(null)} pending={action.pending} onSubmit={(body) => run(`/empresa/catalogos/cursos/${course!.id}/contenido`, body)} />
          </>
        )}
      </Loadable>
    </Page>
  );
}
