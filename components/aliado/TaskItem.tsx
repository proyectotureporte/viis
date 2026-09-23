import Link from 'next/link';
import { cancelTaskAction, completeTaskAction, rescheduleTaskAction } from '@/app/(plataforma)/aliado/agenda/actions';
import { SubmitButton } from '@/components/ov/forms';
import { Status } from '@/components/ov/ui';
import { bogotaHm, bogotaYmd } from '@/lib/aliado/time';
import { fechaHora } from '@/lib/labels';
import { TASK_KIND_TEXT as TASK_KINDS } from '@/lib/aliado/labels';
import { AllyForm } from './AllyForm';

export interface TaskView {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  dueAt: Date;
  status: 'OPEN' | 'DONE' | 'CANCELLED';
  doneAt: Date | null;
  opportunity?: { id: string; code: string; label?: string } | null;
  assigneeName?: string;
}

/** Fila de actividad con completar, reprogramar, cancelar y exportar al calendario. */
export function TaskItem({ task, editable = true, showTime = false }: { task: TaskView; editable?: boolean; showTime?: boolean }) {
  const overdue = task.status === 'OPEN' && task.dueAt < new Date();
  return (
    <div className="ov-row" style={{ flexWrap: 'wrap' }}>
      {showTime ? <span className="al-time">{bogotaHm(task.dueAt)}</span> : <span className={overdue ? 'ov-dot ov-dot--red' : task.status === 'OPEN' ? 'ov-dot ov-dot--amber' : 'ov-dot ov-dot--gray'} />}
      <div className="grow">
        <strong>
          {task.title} <span className="al-tag">{TASK_KINDS[task.kind] ?? task.kind}</span>
          {task.status === 'DONE' && <span className="al-tag">Hecha</span>}
          {task.status === 'CANCELLED' && <span className="al-tag">Cancelada</span>}
        </strong>
        <small>
          {overdue ? <span className="ov-negative">Vencida · {fechaHora(task.dueAt)}</span> : fechaHora(task.dueAt)}
          {task.opportunity && (
            <> · <Link href={`/aliado/clientes/${task.opportunity.id}`}>{task.opportunity.label ?? task.opportunity.code}</Link></>
          )}
          {task.assigneeName && <> · {task.assigneeName}</>}
        </small>
        {task.detail && <small>{task.detail}</small>}
      </div>
      {editable && task.status === 'OPEN' && (
        <div className="al-task-actions">
          <AllyForm action={completeTaskAction} className="al-inline-form" compact>
            <input type="hidden" name="id" value={task.id} />
            <SubmitButton className="ov-btn ov-btn--small" pendingText="…">Completar</SubmitButton>
          </AllyForm>
          {task.kind === 'CITA' && (
            <a className="ov-btn ov-btn--secondary ov-btn--small" href={`/api/aliado/agenda/${task.id}/ics`} download>
              Calendario
            </a>
          )}
          <details>
            <summary className="ov-btn ov-btn--secondary ov-btn--small">Reprogramar</summary>
            <AllyForm action={rescheduleTaskAction} className="ov-inline" compact>
              <input type="hidden" name="id" value={task.id} />
              <label className="ov-field"><span>Fecha</span><input type="date" name="date" required defaultValue={bogotaYmd(task.dueAt)} /></label>
              <label className="ov-field"><span>Hora</span><input type="time" name="time" required defaultValue={bogotaHm(task.dueAt)} /></label>
              <SubmitButton className="ov-btn ov-btn--small">Guardar</SubmitButton>
            </AllyForm>
            <AllyForm action={cancelTaskAction} className="al-inline-form" compact>
              <input type="hidden" name="id" value={task.id} />
              <SubmitButton className="ov-linkbtn" pendingText="…" confirm="¿Cancelar esta actividad?">Cancelar actividad</SubmitButton>
            </AllyForm>
          </details>
        </div>
      )}
      {task.status !== 'OPEN' && task.doneAt && <Status tone="gray">{fechaHora(task.doneAt)}</Status>}
    </div>
  );
}
