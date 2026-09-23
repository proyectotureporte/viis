import type { Metadata } from 'next';
import Link from 'next/link';
import { Empty, Notice, PageHeader } from '@/components/ov/ui';
import { progressPct, readLessons } from '@/lib/aliado/academy';
import { certState, critical, latestCertByCourse } from '@/lib/aliado/scope';
import { allyBlockingCertifications } from '@/lib/domain/cases';
import { fecha } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { requireUser } from '@/lib/security/session';

export const metadata: Metadata = { title: 'Academia' };

export default async function AcademiaPage() {
  const session = await requireUser({ portal: 'aliado', permission: 'academy.take' });
  const prisma = getPrisma();
  const userId = session.user.id;
  const [courses, enrollments, certs, blocking] = await Promise.all([
    prisma.course.findMany({ where: { active: true }, orderBy: [{ critical: 'desc' }, { mandatory: 'desc' }, { sortOrder: 'asc' }] }),
    prisma.enrollment.findMany({ where: { userId } }),
    prisma.certification.findMany({ where: { userId }, orderBy: { issuedAt: 'desc' } }),
    allyBlockingCertifications(prisma, userId),
  ]);
  const byCourse = latestCertByCourse(certs);
  const valid = courses.filter((c) => certState(byCourse.get(c.id)?.expiresAt).valid).length;

  return (
    <>
      <PageHeader title="Academia OpenV" subtitle="Inducción, protección de datos y rutas por producto. Certifícate y mantén tus certificaciones vigentes." />
      {blocking.length > 0 ? (
        <Notice tone="danger">
          <strong>Radicación bloqueada.</strong> Te falta certificar o renovar: {blocking.join(', ')}. Los cursos críticos vencidos impiden radicar tus casos ante las entidades.
        </Notice>
      ) : courses.length > 0 ? (
        <Notice tone="info">Tus certificaciones críticas están al día. {valid} de {courses.length} cursos vigentes.</Notice>
      ) : null}

      {courses.length === 0 ? (
        <Empty>La academia aún no tiene cursos publicados.</Empty>
      ) : (
        <div className="ov-grid" style={{ marginTop: 16 }}>
          {courses.map((course) => {
            const lessons = readLessons(course.lessons).length;
            const enrollment = enrollments.find((e) => e.courseId === course.id);
            const progress = progressPct(enrollment?.lessonsDone ?? [], lessons);
            const cert = byCourse.get(course.id);
            const state = critical(certState(cert?.expiresAt), course.critical);
            return (
              <article key={course.id} className="ov-card s6">
                <div className="al-course">
                  <div>
                    <div className="ov-eyebrow">
                      {course.critical ? <span className="al-tag al-tag--critical" style={{ marginLeft: 0 }}>Crítico · bloquea radicar</span> : course.mandatory ? <span className="al-tag al-tag--mandatory" style={{ marginLeft: 0 }}>Obligatorio</span> : 'Ruta por producto'}
                    </div>
                    <h2 style={{ fontSize: 18, margin: '8px 0 4px' }}>{course.title}</h2>
                  </div>
                  <span className={`ov-status${state.tone === 'ok' ? '' : ` ov-status--${state.tone}`}`}>{state.label}</span>
                </div>
                <p className="ov-sub" style={{ margin: '4px 0 0' }}>{course.summary}</p>
                <div className="al-kpi-bar" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Progreso de lecciones: ${progress}%`}>
                  <i style={{ width: `${progress}%` }} />
                </div>
                <p className="ov-meta" style={{ margin: 0 }}>
                  {progress}% de {lessons} lecciones · aprueba con {course.passScore}/100
                  {enrollment?.bestScore !== null && enrollment?.bestScore !== undefined ? ` · mejor puntaje ${enrollment.bestScore}` : ''}
                  {cert ? ` · certificado hasta ${fecha(cert.expiresAt)}` : ''}
                </p>
                <div className="ov-actions">
                  <Link className="ov-btn ov-btn--small" href={`/aliado/academia/${course.slug}`}>
                    {!enrollment ? 'Empezar' : state.valid && state.tone === 'ok' ? 'Repasar' : progress === 100 ? 'Presentar evaluación' : 'Continuar'}
                  </Link>
                  {cert && <Link className="ov-btn ov-btn--secondary ov-btn--small" href={`/aliado/academia/certificado/${cert.code}`}>Ver certificado</Link>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
