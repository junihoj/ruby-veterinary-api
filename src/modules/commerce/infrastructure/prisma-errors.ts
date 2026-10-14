import { Prisma } from '../../../generated/prisma/client';

/** True when the Prisma error is a unique-constraint violation on `constraint`. */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== 'P2002') return false;
  const target: unknown = error.meta?.target;
  const targets = Array.isArray(target) ? target : [target];
  return targets.some((entry) => String(entry).includes(constraint));
}
