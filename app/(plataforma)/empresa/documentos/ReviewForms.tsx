import { ActionForm, SubmitButton } from '@/components/ov/forms';
import { decideDocumentAction, takeDocumentAction } from './actions';

/** Botones de revisión de un documento: tomar, aprobar y rechazar con motivo obligatorio. */
export function ReviewForms({ documentId, status, reviewerIsMe, validityDays }: { documentId: string; status: string; reviewerIsMe: boolean; validityDays: number | null }) {
  return (
    <div className="ove-stack-list" style={{ gap: 8 }}>
      <div className="ov-inline">
        {(status === 'UPLOADED' || !reviewerIsMe) && (
          <ActionForm action={takeDocumentAction} className="ove-inline-form">
            <input type="hidden" name="documentId" value={documentId} />
            <SubmitButton className="ov-btn ov-btn--secondary ov-btn--small">{status === 'IN_REVIEW' ? 'Tomar yo' : 'Tomar en revisión'}</SubmitButton>
          </ActionForm>
        )}
        <ActionForm action={decideDocumentAction} className="ove-inline-form">
          <input type="hidden" name="documentId" value={documentId} />
          <input type="hidden" name="decision" value="APPROVE" />
          <SubmitButton className="ov-btn ov-btn--small">Aprobar{validityDays ? ` (vigencia ${validityDays} d)` : ''}</SubmitButton>
        </ActionForm>
      </div>
      <details>
        <summary className="ov-linkbtn">Rechazar…</summary>
        <ActionForm action={decideDocumentAction} className="ov-form" resetOnSuccess>
          <input type="hidden" name="documentId" value={documentId} />
          <input type="hidden" name="decision" value="REJECT" />
          <label className="ov-field"><span>Motivo para el cliente (obligatorio)</span>
            <textarea name="reason" required minLength={5} maxLength={500} placeholder="Ej.: la imagen está borrosa; la certificación tiene más de 30 días…" />
          </label>
          <div><SubmitButton className="ov-btn ov-btn--danger ov-btn--small">Rechazar documento</SubmitButton></div>
        </ActionForm>
      </details>
    </div>
  );
}
