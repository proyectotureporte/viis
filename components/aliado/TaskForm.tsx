import { createTaskAction } from '@/app/(plataforma)/aliado/agenda/actions';
import { SubmitButton } from '@/components/ov/forms';
import { TASK_KIND_TEXT as TASK_KINDS } from '@/lib/aliado/labels';
import { AllyForm } from './AllyForm';

/** Alta de tarea, cita o llamada en hora de Colombia, opcionalmente ligada a un caso. */
export function TaskForm({
  today,
  opportunityId,
  cases,
}: {
  today: string;
  opportunityId?: string;
  cases?: Array<{ id: string; label: string }>;
}) {
  return (
    <AllyForm action={createTaskAction} className="ov-form ov-form--2" resetOnSuccess>
      {opportunityId && <input type="hidden" name="opportunityId" value={opportunityId} />}
      <label className="ov-field">
        <span>Tipo</span>
        <select name="kind" defaultValue="LLAMADA">
          {Object.entries(TASK_KINDS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
        </select>
      </label>
      <label className="ov-field"><span>Título</span><input name="title" required maxLength={200} placeholder="Llamar para pedir el certificado laboral" /></label>
      <label className="ov-field"><span>Fecha</span><input type="date" name="date" required defaultValue={today} min={today} /></label>
      <label className="ov-field"><span>Hora (Colombia)</span><input type="time" name="time" required defaultValue="09:00" /></label>
      {cases && (
        <label className="ov-field full">
          <span>Caso (opcional)</span>
          <select name="opportunityId" defaultValue="">
            <option value="">Sin caso asociado</option>
            {cases.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
      )}
      <label className="ov-field full"><span>Detalle (opcional)</span><textarea name="detail" maxLength={2000} rows={2} /></label>
      <div className="full"><SubmitButton pendingText="Agendando…">Agendar</SubmitButton></div>
    </AllyForm>
  );
}
