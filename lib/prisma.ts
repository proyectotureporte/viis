import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/app/generated/prisma/client';

const globalForPrisma = globalThis as unknown as {
  viisPrisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL no está configurada.');
  }

  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.viisPrisma) {
    globalForPrisma.viisPrisma = createPrismaClient();
  }

  return globalForPrisma.viisPrisma;
}
