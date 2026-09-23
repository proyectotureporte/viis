'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { fail, ok, UserError } from '@/lib/actions';
import { certificateCode, gradeQuiz, MAX_ATTEMPTS_PER_DAY, quizLength, readLessons } from '@/lib/aliado/academy';
import { allyAction, okWithLink } from '@/lib/aliado/scope';
import { bogotaDayStart, bogotaYmd } from '@/lib/aliado/time';
import { fecha } from '@/lib/labels';
import { getPrisma } from '@/lib/prisma';
import { audit } from '@/lib/security/audit';

const zSlug = z.string().regex(/^[a-z0-9-]{1,80}$/, 'Curso inválido.');

export const markLessonAction = allyAction(
  'academy.take',
  z.object({ slug: zSlug, lesson: z.coerce.number().int().min(0).max(200) }),
  async ({ slug, lesson }, { session, meta }) => {
    await getPrisma().$transaction(async (tx) => {
      const course = await tx.course.findFirst({ where: { slug, active: true } });
      if (!course) throw new UserError('Ese curso no está disponible.');
      if (lesson >= readLessons(course.lessons).length) throw new UserError('Lección inválida.');
      const key = { userId_courseId: { userId: session.user.id, courseId: course.id } };
      const enrollment = await tx.enrollment.findUnique({ where: key });
      if (enrollment?.lessonsDone.includes(lesson)) return;
      if (enrollment) await tx.enrollment.update({ where: { id: enrollment.id }, data: { lessonsDone: { push: lesson } } });
      else await tx.enrollment.upsert({ where: key, create: { userId: session.user.id, courseId: course.id, lessonsDone: [lesson] }, update: { lessonsDone: { push: lesson } } });
      await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'academy.lesson_done', entity: 'Course', entityId: course.id, after: { lesson, courseVersion: course.version }, ipHash: meta.ipHash }, tx);
    });
    revalidatePath(`/aliado/academia/${slug}`);
    revalidatePath('/aliado/academia');
    return ok('Lección marcada como vista.');
  },
);

/**
 * Evaluación calificada en el servidor. Las respuestas llegan como a0..aN con
 * el índice de la opción elegida; el índice correcto nunca sale del servidor.
 */
export const submitQuizAction = allyAction('academy.take', z.looseObject({ slug: zSlug }), async (input, { session, meta }) => {
  const raw = input as Record<string, unknown>;
  const result = await getPrisma().$transaction(async (tx) => {
    const course = await tx.course.findFirst({ where: { slug: input.slug, active: true } });
    if (!course) throw new UserError('Ese curso no está disponible.');
    // Serializa los intentos del mismo usuario y curso para que el límite diario no se pueda saltar en paralelo.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`quiz:${session.user.id}:${course.id}`}))`;

    const enrollment = await tx.enrollment.findUnique({ where: { userId_courseId: { userId: session.user.id, courseId: course.id } } });
    const lessons = readLessons(course.lessons).length;
    const seen = new Set(enrollment?.lessonsDone ?? []);
    if (!enrollment || [...Array(lessons).keys()].some((i) => !seen.has(i))) {
      throw new UserError('Primero marca como vistas todas las lecciones del curso.');
    }
    const attemptsToday = await tx.auditEvent.count({
      where: { action: 'academy.quiz_attempt', actorId: session.user.id, entityId: course.id, at: { gte: bogotaDayStart(bogotaYmd()) } },
    });
    if (attemptsToday >= MAX_ATTEMPTS_PER_DAY) {
      throw new UserError(`Llegaste al límite de ${MAX_ATTEMPTS_PER_DAY} intentos por día. Repasa las lecciones y vuelve mañana.`);
    }

    const total = quizLength(course.quiz);
    const answers = Array.from({ length: total }, (_, i) => {
      const value = raw[`a${i}`];
      return typeof value === 'string' && /^\d{1,2}$/.test(value) ? Number(value) : null;
    });
    if (answers.some((a) => a === null)) throw new UserError('Responde todas las preguntas antes de enviar.');
    const grade = gradeQuiz(course.quiz, answers);
    const passed = grade.score >= course.passScore;

    await tx.enrollment.update({
      where: { id: enrollment.id },
      data: { attempts: { increment: 1 }, bestScore: Math.max(enrollment.bestScore ?? 0, grade.score) },
    });
    await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'academy.quiz_attempt', entity: 'Course', entityId: course.id, after: { score: grade.score, passed, courseVersion: course.version }, ipHash: meta.ipHash }, tx);

    let certificate: { code: string; expiresAt: Date } | null = null;
    if (passed) {
      const expiresAt = new Date(Date.now() + course.validityDays * 86_400_000);
      for (let i = 0; i < 5 && !certificate; i += 1) {
        const code = certificateCode();
        if (await tx.certification.findUnique({ where: { code }, select: { id: true } })) continue;
        const cert = await tx.certification.create({
          data: { userId: session.user.id, courseId: course.id, score: grade.score, courseVersion: course.version, expiresAt, code },
        });
        await audit({ actorId: session.user.id, actorRole: session.user.role, action: 'academy.certified', entity: 'Certification', entityId: cert.id, after: { code, courseId: course.id, score: grade.score, courseVersion: course.version, expiresAt }, ipHash: meta.ipHash }, tx);
        certificate = { code, expiresAt };
      }
      if (!certificate) throw new Error('No se pudo generar un código de certificado único.');
    }
    return { grade, passed, passScore: course.passScore, certificate, left: MAX_ATTEMPTS_PER_DAY - attemptsToday - 1 };
  });

  revalidatePath('/aliado', 'layout');
  const summary = `Obtuviste ${result.grade.score} de 100 (${result.grade.correct} de ${result.grade.total} correctas).`;
  if (result.passed && result.certificate) {
    return okWithLink(
      `${summary} ¡Aprobaste! Tu certificado ${result.certificate.code} es válido hasta el ${fecha(result.certificate.expiresAt)}.`,
      `/aliado/academia/certificado/${result.certificate.code}`,
      'Ver certificado',
    );
  }
  return fail(
    `${summary} Necesitas ${result.passScore} para aprobar. ${result.left > 0 ? `Te quedan ${result.left} ${result.left === 1 ? 'intento' : 'intentos'} hoy.` : 'Repasa las lecciones y vuelve a intentarlo mañana.'}`,
  );
});
