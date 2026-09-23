import type { Metadata } from 'next';
import Link from 'next/link';
import type { Prisma } from '@/app/generated/prisma/client';
import { Pager } from '@/components/empresa/ui';
import { ActionForm, SubmitButton } from '@/components/ov/forms';
import { Empty, Notice, PageHeader, Status } from '@/components/ov/ui';
import { fullName, qs, sp, spPage, type SearchParams } from '@/lib/empresa/params';
import { fechaDia, fechaHora, money, PAYMENT_STATUS } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { requireUser } from '@/lib/security/session';
import { temporaryDocumentUrl } from '@/lib/storage';
import { reconcilePaymentAction, rejectPaymentAction, takePaymentAction, validatePaymentAction } from './actions';

export const metadata: Metadata = { title: 'Pagos reportados' };

const PAGE_SIZE = 20;
const TABS = [
  { key: 'cola', label: 'Por revisar' },
  { key: 'conciliar', label: 'Validados por conciliar' },
  { key: 'historico', label: 'Histórico' },
] as const;
type Tab = (typeof TABS)[number]['key'];

function kindLabel(kind: string, applyMode: string | null): string {
  if (kind === 'INSTALLMENT') return 'Cuota';
  if (kind === 'PREPAYMENT') return applyMode === 'PAYMENT' ? 'Abono · reducir cuota' : 'Abono · reducir plazo';
  return kind;
}

export default async function PagosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireUser({ portal: 'empresa', permission: 'payment.review' });
  const params = await searchParams;
  const tabParam = sp(params, 'tab');
  const tab: Tab = TABS.some((t) => t.key === tabParam) ? (tabParam as Tab) : 'cola';
  const page = spPage(params);
  const prisma = getPrisma();

  const where: Prisma.PaymentReportWhereInput =
    tab === 'cola' ? { status: { in: ['REPORTED', 'IN_REVIEW'] } } : tab === 'conciliar' ? { status: 'VALIDATED' } : { status: { in: ['REJECTED', 'RECONCILED', 'VALIDATED'] } };
  const orderBy: Prisma.PaymentReportOrderByWithRelationInput = tab === 'historico' ? { createdAt: 'desc' } : { createdAt: 'asc' };

  const [total, payments, counts] = await Promise.all([
    prisma.paymentReport.count({ where }),
    prisma.paymentReport.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        loan: { select: { id: true, alias: true, balance: true, entity: { select: { name: true } }, person: { select: { id: true, firstName: true, lastName: true, documentLast4: true } } } },
        document: { select: { id: true, status: true, fileName: true } },
      },
    }),
    prisma.paymentReport.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  const countOf = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;

  // Posibles duplicados: mismo dedupeKey, o mismo crédito + fecha + valor.
  const ids = payments.map((p) => p.id);
  const dupCandidates = payments.length
    ? await prisma.paymentReport.findMany({
        where: {
          id: { notIn: ids.length ? ids : undefined },
          OR: [
            { dedupeKey: { in: payments.map((p) => p.dedupeKey) } },
            ...payments.map((p) => ({ loanId: p.loanId, paidOn: p.paidOn, amount: p.amount })),
          ],
        },
        select: { id: true, dedupeKey: true, loanId: true, paidOn: true, amount: true, status: true },
      })
    : [];
  const duplicatesOf = (p: (typeof payments)[number]) => {
    const others = [...dupCandidates, ...payments].filter(
      (o) => o.id !== p.id && (o.dedupeKey === p.dedupeKey || (o.loanId === p.loanId && o.paidOn.getTime() === p.paidOn.getTime() && o.amount === p.amount)),
    );
    return others;
  };

  // Referencia de conciliación: vive en la bitácora (el esquema no tiene campo propio).
  const reconciled = payments.filter((p) => p.status === 'RECONCILED').map((p) => p.id);
  const reconcileEvents = reconciled.length
    ? await prisma.auditEvent.findMany({ where: { action: 'payment.reconciled', entity: 'PaymentReport', entityId: { in: reconciled } }, select: { entityId: true, after: true, at: true } })
    : [];
  const reviewerIds = [...new Set(payments.map((p) => p.reviewedById).filter((v): v is string => Boolean(v)))];
  const reviewers = reviewerIds.length ? await prisma.user.findMany({ where: { id: { in: reviewerIds } }, select: { id: true, name: true } }) : [];
  const reviewerName = (id: string | null) => reviewers.find((r) => r.id === id)?.name;

  const base = { tab: tab === 'cola' ? undefined : tab };

  return (
    <>
      <PageHeader title="Pagos reportados" subtitle="Valida los soportes que reportan los clientes. El crédito del cliente solo cambia cuando un pago queda validado." />
      <Notice tone="info">
        Cargar un soporte no sustituye pagar al acreedor ni garantiza la imputación: compara siempre contra el extracto o la evidencia disponible. Todo rechazo debe explicar el motivo al cliente.
      </Notice>

      <nav className="ov-tabs" aria-label="Estados de pago" style={{ marginTop: 16 }}>
        {TABS.map((t) => (
          <Link key={t.key} href={`/empresa/pagos${qs({ tab: t.key === 'cola' ? undefined : t.key })}`} aria-current={tab === t.key ? 'page' : undefined}>
            {t.label}
            {t.key === 'cola' ? ` (${countOf('REPORTED') + countOf('IN_REVIEW')})` : t.key === 'conciliar' ? ` (${countOf('VALIDATED')})` : ''}
          </Link>
        ))}
      </nav>

      {payments.length === 0 ? (
        <Empty>
          {tab === 'cola' ? 'No hay pagos pendientes de revisión. Cuando un cliente reporte una cuota o un abono aparecerá aquí, del más antiguo al más reciente.' : tab === 'conciliar' ? 'No hay pagos validados pendientes de conciliar contra extracto.' : 'Todavía no hay pagos revisados.'}
        </Empty>
      ) : (
        <div className="ove-stack-list">
          {payments.map((p) => {
            const status = PAYMENT_STATUS[p.status] ?? { label: p.status, tone: 'gray' };
            const dups = duplicatesOf(p);
            const canReview = p.status === 'REPORTED' || p.status === 'IN_REVIEW';
            const event = reconcileEvents.find((e) => e.entityId === p.id);
            const reconcileRef = event && typeof event.after === 'object' && event.after && 'reference' in event.after ? String((event.after as { reference?: unknown }).reference ?? '') : '';
            return (
              <article className="ov-card" key={p.id}>
                <header>
                  <h2 style={{ fontSize: 17 }}>
                    {kindLabel(p.kind, p.applyMode)} · <span className="ov-money">{money(p.amount)}</span>
                  </h2>
                  <Status tone={status.tone}>{status.label}</Status>
                </header>
                <div className="ove-kv">
                  <div><small>Cliente</small><strong>{fullName(p.loan.person)}</strong><small>Doc. ···{p.loan.person.documentLast4}</small></div>
                  <div><small>Crédito</small><strong>{p.loan.alias}</strong><small>{p.loan.entity?.name ?? 'Entidad no registrada'} · saldo {money(p.loan.balance)}</small></div>
                  <div><small>Fecha de pago</small><strong>{fechaDia(p.paidOn)}</strong><small>Reportado {fechaHora(p.createdAt)}</small></div>
                  <div><small>Canal</small><strong>{p.channel}</strong><small>Ref. {p.reference || '—'}</small></div>
                  <div>
                    <small>Soporte</small>
                    {p.document ? (
                      p.document.status === 'QUARANTINED' ? (
                        <strong>En verificación antivirus</strong>
                      ) : (
                        <strong><a href={temporaryDocumentUrl(p.document.id, session.user.id)} target="_blank" rel="noopener noreferrer">Ver soporte</a></strong>
                      )
                    ) : (
                      <strong>Sin soporte</strong>
                    )}
                    {p.document && <small>{p.document.fileName} · enlace válido 5 min</small>}
                  </div>
                  {p.reviewedById && <div><small>Revisión</small><strong>{reviewerName(p.reviewedById) ?? 'Usuario interno'}</strong><small>{p.reviewedAt ? fechaHora(p.reviewedAt) : 'En curso'}</small></div>}
                </div>

                {dups.length > 0 && (
                  <div className="ov-notice ov-notice--danger" style={{ marginTop: 12 }} role="alert">
                    Posible duplicado: hay {dups.length} reporte(s) con el mismo soporte o mismo crédito, fecha y valor ({dups.map((d) => PAYMENT_STATUS[d.status]?.label ?? d.status).join(', ')}). Verifica antes de validar.
                  </div>
                )}
                {p.status === 'REJECTED' && p.rejectReason && <p className="ov-meta" style={{ marginTop: 10 }}>Motivo del rechazo: {p.rejectReason}</p>}
                {p.status === 'RECONCILED' && <p className="ov-meta" style={{ marginTop: 10 }}>Conciliado{event ? ` el ${fechaHora(event.at)}` : ''}{reconcileRef ? ` · ${reconcileRef}` : ''}</p>}

                {canReview && (
                  <div className="ov-actions">
                    {p.status === 'REPORTED' && (
                      <ActionForm action={takePaymentAction} className="ove-inline-form">
                        <input type="hidden" name="id" value={p.id} />
                        <SubmitButton className="ov-btn ov-btn--secondary ov-btn--small">Tomar en revisión</SubmitButton>
                      </ActionForm>
                    )}
                    <ActionForm action={validatePaymentAction} className="ove-inline-form">
                      <input type="hidden" name="id" value={p.id} />
                      <SubmitButton className="ov-btn ov-btn--small" confirm={`¿Validar este pago de ${money(p.amount)}? Se actualizará el saldo del crédito del cliente.`}>Validar y aplicar al crédito</SubmitButton>
                    </ActionForm>
                    <details className="ove-details" style={{ flex: '1 1 320px' }}>
                      <summary>Rechazar</summary>
                      <ActionForm action={rejectPaymentAction}>
                        <input type="hidden" name="id" value={p.id} />
                        <label className="ov-field"><span>Motivo (lo verá el cliente)</span><textarea name="reason" required minLength={5} maxLength={500} placeholder="Ej.: el soporte no es legible; el valor no coincide con el extracto." /></label>
                        <SubmitButton className="ov-btn ov-btn--danger ov-btn--small">Rechazar pago</SubmitButton>
                      </ActionForm>
                    </details>
                  </div>
                )}
                {p.status === 'VALIDATED' && (
                  <div className="ov-actions">
                    <ActionForm action={reconcilePaymentAction} className="ove-inline-form">
                      <input type="hidden" name="id" value={p.id} />
                      <label className="ov-field"><span className="ove-sr">Referencia de conciliación</span><input name="reference" required minLength={3} maxLength={300} placeholder="Referencia del extracto u observación" /></label>
                      <SubmitButton className="ov-btn ov-btn--secondary ov-btn--small">Marcar conciliado</SubmitButton>
                    </ActionForm>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      <Pager page={page} pageSize={PAGE_SIZE} total={total} href={(n) => `/empresa/pagos${qs(base, { p: n > 1 ? n : undefined })}`} />
    </>
  );
}
