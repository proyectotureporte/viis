import { NextResponse } from 'next/server';
import type { LoanState } from '@/lib/finance/types';
import { buildReportPdf, winAnsi } from '@/lib/cliente/pdf';
import { describeLoan, describeParams, NOT_BINDING, SIM_META, summarizeResults, type SimKind } from '@/lib/cliente/simulate';
import { fechaHora } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { audit } from '@/lib/security/audit';
import { STAFF_ROLES } from '@/lib/security/rbac';
import { requestMetaFrom } from '@/lib/security/request';
import { getSession } from '@/lib/security/session';

export const dynamic = 'force-dynamic';

function deny(message: string, status: number) {
  return new NextResponse(message, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Type': 'text/plain; charset=utf-8' } });
}

/**
 * PDF de un escenario guardado: identificación, fecha, versión del motor,
 * huella de entradas, supuestos, resultados y advertencias. Lo descarga su
 * dueño o, si lo compartió con un asesor, el equipo interno.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session || !session.mfaPassed) return deny('Inicia sesión para descargar el escenario.', 401);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return deny('Escenario no encontrado.', 404);
  const scenario = await getPrisma().scenario.findUnique({ where: { id }, include: { user: { select: { name: true } }, loan: { select: { alias: true } } } });
  const isOwner = scenario?.userId === session.user.id;
  const isStaffShared = Boolean(scenario?.sharedWithAdvisor) && STAFF_ROLES.includes(session.user.role);
  if (!scenario || (!isOwner && !isStaffShared)) return deny('Escenario no encontrado.', 404);

  const inputs = (scenario.inputs ?? {}) as { params?: Record<string, unknown>; loan?: LoanState | null };
  const stored = (scenario.assumptions ?? {}) as { assumptions?: string[]; warnings?: string[]; notice?: string };
  const results = summarizeResults(scenario.kind, (scenario.results ?? {}) as Record<string, unknown>);
  const kindLabel = SIM_META[scenario.kind as SimKind]?.label ?? scenario.kind;
  const plan = (scenario.results as Record<string, unknown> | null)?.plan;
  const recommendation = (scenario.results as Record<string, unknown> | null)?.recommendationText;

  let pdf: Uint8Array;
  try {
    pdf = await buildReportPdf({
      title: `Escenario: ${scenario.name}`,
      subtitle: `${kindLabel} · Generado el ${fechaHora(new Date())} para ${session.user.name}`,
      footer: `OpenV · Escenario ${scenario.id} · Simulación no vinculante`,
      sections: [
        {
          title: 'Identificación',
          lines: [
            { label: 'Escenario', value: scenario.id },
            { label: 'Titular', value: scenario.user.name },
            { label: 'Tipo', value: kindLabel },
            { label: 'Guardado', value: fechaHora(scenario.createdAt) },
            { label: 'Versión del motor', value: scenario.engineVersion },
            { label: 'Huella de entradas (SHA-256)', value: scenario.inputsHash },
            ...(scenario.loan ? [{ label: 'Crédito', value: scenario.loan.alias }] : []),
          ],
        },
        { title: 'Resultados', lines: results, paragraphs: typeof recommendation === 'string' ? [recommendation] : [] },
        ...(Array.isArray(plan) && plan.length ? [{ title: 'Plan preventivo', bullets: plan.map(String) }] : []),
        { title: 'Datos usados', lines: [...describeParams(scenario.kind, inputs.params ?? {}), ...describeLoan(inputs.loan ?? null)] },
        { title: 'Supuestos', bullets: stored.assumptions ?? [] },
        { title: 'Advertencias', bullets: [...(stored.warnings ?? []), stored.notice ?? NOT_BINDING] },
        {
          title: 'Cómo reproducir este cálculo',
          paragraphs: [
            'Un analista puede recalcular este escenario con las mismas entradas y la misma versión del motor; la huella de entradas permite verificar que los datos no cambiaron. Los datos del crédito son los declarados por el titular a la fecha indicada.',
          ],
        },
      ],
    });
  } catch (error) {
    console.error('PDF de escenario fallido', { scenarioId: id, error: error instanceof Error ? error.message : 'desconocido' });
    return deny('No pudimos generar el PDF. Inténtalo de nuevo.', 500);
  }

  const meta = requestMetaFrom(request);
  await audit({
    actorId: session.user.id,
    actorRole: session.user.role,
    action: 'scenario.pdf_downloaded',
    entity: 'Scenario',
    entityId: scenario.id,
    after: { inputsHash: scenario.inputsHash, owner: isOwner },
    ipHash: meta.ipHash,
  });

  const fileName = winAnsi(`escenario-${scenario.name}`).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'escenario';
  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${fileName}.pdf"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
