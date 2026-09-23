import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AllyForm } from '@/components/aliado/AllyForm';
import { SubmitButton } from '@/components/ov/forms';
import { Notice, PageHeader } from '@/components/ov/ui';
import { MAX_ATTEMPTS_PER_DAY, progressPct, publicQuiz, readLessons } from '@/lib/aliado/academy';
import { certState, latestCertByCourse } from '@/lib/aliado/scope';
import { bogotaDayStart, bogotaYmd } from '@/lib/aliado/time';
import { fecha } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { requireUser } from '@/lib/security/session';
import { markLessonAction, submitQuizAction } from '../actions';

export const metadata: Metadata = { title: 'Curso' };

export default async function CursoPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ leccion?: string }> }) {
  const session = await requireUser({ portal: 'aliado', permission: 'academy.take' });
  const { slug } = await params;
  const { leccion } = await searchParams;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) notFound();
  const prisma = getPrisma();
  const course = await prisma.course.findFirst({ where: { slug, active: true } });
  if (!course) notFound();

  const [enrollment, certs, attemptsToday] = await Promise.all([
    prisma.enrollment.findUnique({ where: { userId_courseId: { userId: session.user.id, courseId: course.id } } }),
    prisma.certification.findMany({ where: { userId: session.user.id, courseId: course.id } }),
    prisma.auditEvent.count({ where: { action: 'academy.quiz_attempt', actorId: session.user.id, entityId: course.id, at: { gte: bogotaDayStart(bogotaYmd()) } } }),
  ]);

  const lessons = readLessons(course.lessons);
  // Solo preguntas y opciones: la respuesta correcta nunca llega al navegador.
  const quiz = publicQuiz(course.quiz);
  const done = new Set(enrollment?.lessonsDone ?? []);
  const allSeen = lessons.every((_, i) => done.has(i));
  const showQuiz = leccion === 'evaluacion';
  const current = showQuiz ? -1 : Math.min(Math.max(0, Number(leccion) || 0), Math.max(0, lessons.length - 1));
  const lesson = lessons[current];
  const cert = latestCertByCourse(certs).get(course.id);
  const state = certState(cert?.expiresAt);
  const attemptsLeft = Math.max(0, MAX_ATTEMPTS_PER_DAY - attemptsToday);
  const base = `/aliado/academia/${course.slug}`;

  return (
    <>
      <PageHeader
        title={course.title}
        subtitle={course.summary}
        actions={<Link className="ov-btn ov-btn--secondary" href="/aliado/academia">Volver a la academia</Link>}
      />
      {cert && (
        <Notice tone={state.tone === 'bad' ? 'danger' : 'info'}>
          Certificación {state.label.toLowerCase()} · código <Link href={`/aliado/academia/certificado/${cert.code}`}>{cert.code}</Link> · válida hasta {fecha(cert.expiresAt)}.
          {state.tone !== 'ok' && ' Presenta la evaluación de nuevo para renovarla.'}
        </Notice>
      )}

      <div className="ov-grid" style={{ marginTop: 16 }}>
        <nav className="ov-card s4" aria-label="Lecciones del curso" style={{ alignSelf: 'start' }}>
          <h2>Lecciones · {progressPct([...done], lessons.length)}%</h2>
          <ol className="al-lessons">
            {lessons.map((l, i) => (
              <li key={i}>
                <Link href={`${base}?leccion=${i}`} aria-current={i === current ? 'page' : undefined}>
                  <span className={done.has(i) ? 'ov-dot' : 'ov-dot ov-dot--gray'} aria-hidden />
                  <span>{i + 1}. {l.title}</span>
                  <span className="al-sr">{done.has(i) ? ' (vista)' : ''}</span>
                </Link>
              </li>
            ))}
            <li>
              <Link href={`${base}?leccion=evaluacion`} aria-current={showQuiz ? 'page' : undefined}>
                <span className={cert && state.valid ? 'ov-dot' : 'ov-dot ov-dot--gray'} aria-hidden />
                <span>Evaluación · {quiz.length} preguntas</span>
              </Link>
            </li>
          </ol>
          <p className="ov-meta" style={{ marginTop: 12 }}>
            Aprueba con {course.passScore}/100. Vigencia {course.validityDays} días. Versión {course.version}.
            {enrollment ? ` Intentos: ${enrollment.attempts}${enrollment.bestScore !== null ? ` · mejor puntaje ${enrollment.bestScore}` : ''}.` : ''}
          </p>
        </nav>

        <article className="ov-card s8">
          {!showQuiz && lesson ? (
            <>
              <div className="ov-eyebrow">Lección {current + 1} de {lessons.length}</div>
              <h2 style={{ fontSize: 22, margin: '8px 0 14px' }}>{lesson.title}</h2>
              <div className="al-lesson-body">{lesson.body.map((p, i) => <p key={i}>{p}</p>)}</div>
              <div className="ov-actions">
                {done.has(current) ? (
                  <span className="ov-status">Vista</span>
                ) : (
                  <AllyForm action={markLessonAction} className="al-inline-form" compact>
                    <input type="hidden" name="slug" value={course.slug} />
                    <input type="hidden" name="lesson" value={current} />
                    <SubmitButton className="ov-btn ov-btn--small" pendingText="Guardando…">Marcar como vista</SubmitButton>
                  </AllyForm>
                )}
                {current > 0 && <Link className="ov-btn ov-btn--secondary ov-btn--small" href={`${base}?leccion=${current - 1}`}>← Anterior</Link>}
                {current < lessons.length - 1 ? (
                  <Link className="ov-btn ov-btn--secondary ov-btn--small" href={`${base}?leccion=${current + 1}`}>Siguiente →</Link>
                ) : (
                  <Link className="ov-btn ov-btn--secondary ov-btn--small" href={`${base}?leccion=evaluacion`}>Ir a la evaluación →</Link>
                )}
              </div>
            </>
          ) : !allSeen ? (
            <>
              <h2>Evaluación</h2>
              <p>Para presentar la evaluación primero marca como vistas todas las lecciones ({[...done].filter((i) => i < lessons.length).length} de {lessons.length}).</p>
              <Link className="ov-btn ov-btn--small" href={`${base}?leccion=${lessons.findIndex((_, i) => !done.has(i))}`}>Ir a la lección pendiente</Link>
            </>
          ) : quiz.length === 0 ? (
            <p className="ov-meta">Este curso aún no tiene evaluación publicada.</p>
          ) : (
            <>
              <h2>Evaluación</h2>
              <p className="ov-meta">
                {quiz.length} preguntas · aprueba con {course.passScore}/100 · {attemptsLeft === 0 ? 'ya usaste los intentos de hoy' : `${attemptsLeft} de ${MAX_ATTEMPTS_PER_DAY} intentos disponibles hoy`}. La calificación se hace en el servidor.
              </p>
              {attemptsLeft === 0 ? (
                <Notice>Llegaste al límite de {MAX_ATTEMPTS_PER_DAY} intentos por día. Repasa las lecciones y vuelve mañana.</Notice>
              ) : (
                <AllyForm action={submitQuizAction} className="ov-form al-quiz">
                  <input type="hidden" name="slug" value={course.slug} />
                  {quiz.map((question, i) => (
                    <fieldset key={i}>
                      <legend>{i + 1}. {question.q}</legend>
                      {question.options.map((option, j) => (
                        <label key={j} className="ov-check">
                          <input type="radio" name={`a${i}`} value={j} required />
                          <span>{option}</span>
                        </label>
                      ))}
                    </fieldset>
                  ))}
                  <div><SubmitButton pendingText="Calificando…">Enviar respuestas</SubmitButton></div>
                </AllyForm>
              )}
            </>
          )}
        </article>
      </div>
    </>
  );
}
