import { randomBytes } from 'node:crypto';

/**
 * Lectura segura del contenido de un curso (JSON en BD) y calificación en el
 * servidor. El índice de la respuesta correcta NUNCA sale de este módulo hacia
 * el navegador: la página recibe solo `publicQuiz`.
 */

export interface Lesson {
  title: string;
  body: string[];
}

interface Question {
  q: string;
  options: string[];
  answer: number;
}

export interface PublicQuestion {
  q: string;
  options: string[];
}

export const MAX_ATTEMPTS_PER_DAY = 5;

export function readLessons(json: unknown): Lesson[] {
  if (!Array.isArray(json)) return [];
  return json
    .filter((l): l is Lesson => typeof l === 'object' && l !== null && typeof (l as Lesson).title === 'string')
    .map((l) => ({ title: l.title, body: Array.isArray(l.body) ? l.body.filter((p) => typeof p === 'string') : [] }));
}

function readQuiz(json: unknown): Question[] {
  if (!Array.isArray(json)) return [];
  return json.filter(
    (q): q is Question =>
      typeof q === 'object' && q !== null && typeof (q as Question).q === 'string' && Array.isArray((q as Question).options) && Number.isInteger((q as Question).answer),
  );
}

/** Preguntas sin la respuesta correcta: lo único que puede viajar al navegador. */
export function publicQuiz(json: unknown): PublicQuestion[] {
  return readQuiz(json).map(({ q, options }) => ({ q, options: [...options] }));
}

/** Calificación 0–100. Una pregunta sin responder cuenta como incorrecta. */
export function gradeQuiz(json: unknown, answers: Array<number | null>): { score: number; correct: number; total: number } {
  const quiz = readQuiz(json);
  if (!quiz.length) return { score: 0, correct: 0, total: 0 };
  const correct = quiz.reduce((sum, question, i) => sum + (answers[i] === question.answer ? 1 : 0), 0);
  return { score: Math.round((correct / quiz.length) * 100), correct, total: quiz.length };
}

export function quizLength(json: unknown): number {
  return readQuiz(json).length;
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** CERT- + 8 caracteres base32 (40 bits aleatorios). */
export function certificateCode(): string {
  const bytes = randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i += 1) code += BASE32[bytes[i] & 31];
  return `CERT-${code}`;
}

export function progressPct(done: number[], lessons: number): number {
  if (!lessons) return 0;
  const unique = new Set(done.filter((i) => i >= 0 && i < lessons));
  return Math.round((unique.size / lessons) * 100);
}
