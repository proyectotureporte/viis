import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/ov/forms';
import { PageHeader, Status } from '@/components/ov/ui';
import { Pager } from '@/components/empresa/ui';
import { activeStaff } from '@/lib/empresa/access';
import { qs, spEnum, spPage, type SearchParams } from '@/lib/empresa/params';
import { fechaHora } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { requireUser } from '@/lib/security/session';
import { PersonCaseFields } from '../casos/nuevo/PersonCaseFields';
import { convertLeadAction, discardLeadAction } from './actions';

export const metadata: Metadata = { title: 'Leads web' };

const PAGE_SIZE = 15;
const TABS = [
  { code: 'NEW', label: 'Por gestionar' },
  { code: 'CONVERTED', label: 'Convertidos' },
  { code: 'DISCARDED', label: 'Descartados' },
] as const;

/** "Juan Carlos Pérez Gómez" → nombres / apellidos (editable antes de guardar). */
function splitName(name: string): { firstName: string; lastName: string } {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return { firstName: words[0] ?? '', lastName: '' };
  const cut = words.length === 2 || words.length === 3 ? 1 : 2;
  return { firstName: words.slice(0, cut).join(' '), lastName: words.slice(cut).join(' ') };
}

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireUser({ portal: 'empresa', permission: 'lead.manage' });
  const params = await searchParams;
  const status = spEnum(params, 'estado', ['NEW', 'CONVERTED', 'DISCARDED'] as const) || 'NEW';
  const page = spPage(params);
  const prisma = getPrisma();

  const [total, leads, counts] = await Promise.all([
    prisma.contactRequest.count({ where: { status } }),
    prisma.contactRequest.findMany({
      where: { status },
      orderBy: { createdAt: status === 'NEW' ? 'asc' : 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { opportunity: { select: { id: true, code: true } } },
    }),
    prisma.contactRequest.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  const countOf = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;

  const needsForms = status === 'NEW' && leads.length > 0;
  const [entities, staff] = needsForms
    ? await Promise.all([
        prisma.entity.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
        activeStaff(['ADVISOR', 'COORDINATOR', 'FIN_ANALYST', 'POSTSALE', 'ADMIN']),
      ])
    : [[], []];
  const discardReasons =
    status === 'DISCARDED' && leads.length
      ? await prisma.auditEvent.findMany({ where: { action: 'lead.discarded', entity: 'ContactRequest', entityId: { in: leads.map((l) => l.id) } }, select: { entityId: true, after: true, actorId: true } })
      : [];

  return (
    <>
      <PageHeader title="Leads web" subtitle="Solicitudes que llegaron por la página pública. Conviértelas en caso con documento y autorización, o descártalas con un motivo." />
      <nav className="ov-tabs" aria-label="Estado de los leads">
        {TABS.map((t) => (
          <Link key={t.code} href={`/empresa/leads${qs({ estado: t.code === 'NEW' ? '' : t.code })}`} aria-current={status === t.code ? 'page' : undefined}>
            {t.label} ({countOf(t.code).toLocaleString('es-CO')})
          </Link>
        ))}
      </nav>

      {leads.length === 0 ? (
        <div className="ov-empty">
          {status === 'NEW' ? 'No hay leads pendientes. Los nuevos contactos de la página pública aparecerán aquí automáticamente.' : 'No hay leads en este estado.'}
        </div>
      ) : (
        <div className="ove-stack-list">
          {leads.map((lead) => {
            const names = splitName(lead.name);
            const reason = discardReasons.find((d) => d.entityId === lead.id)?.after as { reason?: string } | null | undefined;
            return (
              <article key={lead.id} className="ov-card">
                <header>
                  <div>
                    <h2 style={{ margin: 0 }}>{lead.name}</h2>
                    <p className="ov-meta" style={{ margin: '4px 0 0' }}>
                      Recibido {fechaHora(lead.createdAt)} · origen {lead.source}{lead.city ? ` · ${lead.city}` : ''}
                    </p>
                  </div>
                  {lead.status === 'CONVERTED' && lead.opportunity ? (
                    <Link className="ov-btn ov-btn--secondary ov-btn--small" href={`/empresa/casos/${lead.opportunity.id}`}>Ver caso {lead.opportunity.code}</Link>
                  ) : lead.status === 'DISCARDED' ? (
                    <Status tone="gray">Descartado</Status>
                  ) : (
                    <Status tone="info">Nuevo</Status>
                  )}
                </header>
                <dl className="ov-dl">
                  <dt>Correo</dt><dd>{lead.email ?? '—'}</dd>
                  <dt>Teléfono</dt><dd>{lead.phone ?? '—'}</dd>
                  <dt>Mensaje</dt><dd style={{ whiteSpace: 'pre-wrap', fontWeight: 400 }}>{lead.message}</dd>
                  {reason?.reason && (<><dt>Motivo del descarte</dt><dd>{reason.reason}</dd></>)}
                </dl>
                {lead.status === 'NEW' && (
                  <div className="ove-stack-list" style={{ marginTop: 14 }}>
                    <details className="ove-details">
                      <summary>Convertir en caso</summary>
                      <ActionForm action={convertLeadAction} className="ov-form">
                        <input type="hidden" name="leadId" value={lead.id} />
                        <PersonCaseFields
                          idPrefix={`lead-${lead.id}`}
                          defaults={{ ...names, email: lead.email ?? undefined, phone: lead.phone ?? undefined, city: lead.city ?? undefined, captureChannel: 'TELEFONICO' }}
                          entities={entities}
                          staff={staff}
                          lockAssigneeToSelf={session.user.role === 'ADVISOR'}
                        />
                        <div className="full"><SubmitButton pendingText="Convirtiendo…">Crear persona y caso</SubmitButton></div>
                      </ActionForm>
                    </details>
                    <details className="ove-details">
                      <summary>Descartar</summary>
                      <ActionForm action={discardLeadAction} className="ov-form">
                        <input type="hidden" name="leadId" value={lead.id} />
                        <label className="ov-field"><span>Motivo (obligatorio)</span>
                          <textarea name="reason" required minLength={5} maxLength={300} placeholder="Ej.: datos de contacto falsos, duplicado de otro lead, no busca crédito de vivienda…" />
                        </label>
                        <div><SubmitButton className="ov-btn ov-btn--danger" confirm="¿Descartar este lead? No se podrá convertir después.">Descartar lead</SubmitButton></div>
                      </ActionForm>
                    </details>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      <Pager page={page} pageSize={PAGE_SIZE} total={total} href={(p) => `/empresa/leads${qs({ estado: status === 'NEW' ? '' : status, p })}`} />
    </>
  );
}
