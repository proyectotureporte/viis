import type { Metadata } from 'next';
import Link from 'next/link';
import { Empty, PageHeader, Status } from '@/components/ov/ui';
import { money, pct, toNumber } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { requireUser } from '@/lib/security/session';
import { createAllyAction } from './actions';
import { OrgForm } from './OrgForm';
import { allyStats, MIN_CASES_FOR_RANKING } from './stats';

export const metadata: Metadata = { title: 'Aliados' };

const rate = (v: number | null) => (v === null ? '—' : pct(v));

export default async function AliadosPage() {
  await requireUser({ portal: 'empresa', permission: 'ally.manage' });
  const prisma = getPrisma();
  const [orgs, stats] = await Promise.all([
    prisma.organization.findMany({
      where: { kind: { in: ['ALLY_PERSON', 'ALLY_COMPANY'] } },
      orderBy: { name: 'asc' },
      include: { _count: { select: { users: true } }, users: { where: { active: true }, select: { id: true } } },
    }),
    allyStats(),
  ]);

  const ranked = orgs
    .map((o) => ({ org: o, s: stats.get(o.id) }))
    .sort((a, b) => {
      const aOk = (a.s?.cases ?? 0) >= MIN_CASES_FOR_RANKING ? 1 : 0;
      const bOk = (b.s?.cases ?? 0) >= MIN_CASES_FOR_RANKING ? 1 : 0;
      return bOk - aOk || (b.s?.score ?? -1) - (a.s?.score ?? -1) || a.org.name.localeCompare(b.org.name);
    });

  return (
    <>
      <PageHeader title="Aliados" subtitle="Red comercial: organizaciones, usuarios, certificaciones y desempeño responsable." />
      <div className="ov-grid">
        <article className="ov-card s12">
          <header><h2>Ranking responsable</h2><span className="ov-meta">{orgs.length} organizaciones</span></header>
          {orgs.length === 0 ? (
            <Empty>Aún no hay aliados registrados. Crea la primera organización con el formulario de abajo y luego invita a sus usuarios.</Empty>
          ) : (
            <div className="ov-tablewrap">
              <table className="ov-table" style={{ minWidth: 980 }}>
                <thead>
                  <tr>
                    <th>#</th><th>Aliado</th><th>Nivel</th><th className="num">Usuarios</th><th className="num">Casos</th>
                    <th className="num">Conversión</th><th className="num">Calidad documental</th><th className="num">Desistimiento</th>
                    <th className="num">Desembolsado</th><th className="num">Mes vs meta</th><th className="num">Puntaje</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map(({ org, s }, i) => {
                    const goal = toNumber(org.monthlyGoal);
                    const small = (s?.cases ?? 0) < MIN_CASES_FOR_RANKING;
                    return (
                      <tr key={org.id}>
                        <td>{small ? '—' : i + 1}</td>
                        <td>
                          <Link href={`/empresa/aliados/${org.id}`}>{org.name}</Link>
                          <small>{org.kind === 'ALLY_COMPANY' ? 'Empresa' : 'Persona'}{org.territory ? ` · ${org.territory}` : ''}</small>
                          {!org.active && <Status tone="gray">Inactivo</Status>}
                        </td>
                        <td>{org.tier}</td>
                        <td className="num">{org.users.length}/{org._count.users}</td>
                        <td className="num">{s?.cases ?? 0}</td>
                        <td className="num">{rate(s?.conversion ?? null)}</td>
                        <td className="num">{rate(s?.docQuality ?? null)}<small>{s ? `${s.docsFirstApproved}/${s.docsReviewed} a la primera` : ''}</small></td>
                        <td className="num">{rate(s?.withdrawalRate ?? null)}</td>
                        <td className="num">{money(s?.disbursedSum ?? 0, true)}<small>{s?.disbursed ?? 0} casos</small></td>
                        <td className="num">{money(s?.monthSum ?? 0, true)}<small>{goal ? `${pct((s?.monthSum ?? 0) / goal, 0)} de ${money(goal, true)}` : 'Sin meta'}</small></td>
                        <td className="num">{s?.score ?? '—'}{small && <small>muestra pequeña</small>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="ov-meta" style={{ marginTop: 12 }}>
            Puntaje responsable (0–100) = 40 % conversión (casos desembolsados ÷ casos creados) + 40 % calidad documental (documentos en primera versión aprobados ÷ primeras versiones revisadas) + 20 % × (1 − tasa de desistimiento). No incluye volumen para no premiar la presión comercial. Los aliados con menos de {MIN_CASES_FOR_RANKING} casos se muestran al final sin posición.
          </p>
        </article>
        <article className="ov-card s12">
          <h2>Nuevo aliado</h2>
          <OrgForm action={createAllyAction} submit="Crear aliado" />
        </article>
      </div>
    </>
  );
}
