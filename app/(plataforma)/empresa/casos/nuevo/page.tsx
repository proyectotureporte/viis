import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/ov/forms';
import { PageHeader } from '@/components/ov/ui';
import { activeStaff } from '@/lib/empresa/access';
import { getPrisma } from '@/lib/prisma';
import { can } from '@/lib/security/rbac';
import { requireUser } from '@/lib/security/session';
import { createCaseAction } from './actions';
import { PersonCaseFields } from './PersonCaseFields';

export const metadata: Metadata = { title: 'Nuevo caso' };

export default async function NuevoCasoPage() {
  const session = await requireUser({ portal: 'empresa', permission: 'case.create' });
  if (!can(session.user.role, 'person.create')) {
    return (
      <>
        <PageHeader title="Nuevo caso" />
        <div className="ov-empty">Tu rol no puede registrar clientes nuevos. Pide a coordinación que cree el caso.</div>
      </>
    );
  }
  const [entities, staff] = await Promise.all([
    getPrisma().entity.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    activeStaff(['ADVISOR', 'COORDINATOR', 'FIN_ANALYST', 'POSTSALE', 'ADMIN']),
  ]);
  return (
    <>
      <PageHeader
        title="Nuevo caso"
        subtitle="Registra al cliente con sus autorizaciones. Si el documento ya existe en el expediente, se reutiliza la persona y no se duplica."
        actions={<Link className="ov-btn ov-btn--secondary" href="/empresa/bandeja">Volver a la bandeja</Link>}
      />
      <article className="ov-card">
        <ActionForm action={createCaseAction} className="ov-form">
          <PersonCaseFields idPrefix="nuevo" entities={entities} staff={staff} lockAssigneeToSelf={session.user.role === 'ADVISOR'} />
          <div className="full ov-actions" style={{ marginTop: 0 }}>
            <SubmitButton pendingText="Creando caso…">Crear caso</SubmitButton>
          </div>
        </ActionForm>
      </article>
    </>
  );
}
