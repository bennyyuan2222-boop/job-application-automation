import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __jobOpsPrisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.__jobOpsPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__jobOpsPrisma = prisma;
}
