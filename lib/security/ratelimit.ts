import { getPrisma } from '@/lib/prisma';
import { sha256 } from './crypto';

/** Límite deslizante persistido en BD: sobrevive reinicios y aplica a todo el cluster. */
export async function tooManyAttempts(keys: string[], max: number, windowMs: number): Promise<boolean> {
  const since = new Date(Date.now() - windowMs);
  const hashed = keys.map((k) => sha256(k));
  const counts = await Promise.all(
    hashed.map((key) =>
      getPrisma().loginAttempt.count({ where: { key, success: false, createdAt: { gte: since } } }),
    ),
  );
  return counts.some((count) => count >= max);
}

export async function recordAttempt(keys: string[], success: boolean): Promise<void> {
  await getPrisma().loginAttempt.createMany({ data: keys.map((k) => ({ key: sha256(k), success })) });
}
