import { PrismaClient, type Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Raw client. Only safe for the two global tables (Tenant, User).
 * Every school-owned table is protected by RLS and returns NOTHING
 * through this client — use withTenant / withSystem instead.
 */
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type Tx = Prisma.TransactionClient;

type TxOptions = { timeout?: number };

/**
 * Run `fn` inside a transaction scoped to one school.
 * Postgres RLS limits every read and write to rows with this tenantId,
 * so a forgotten `where: { tenantId }` cannot leak another school's data.
 * set_config(..., true) is transaction-local, so it is safe behind
 * Neon's pooled (pgbouncer) connections.
 */
export function withTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>, opts: TxOptions = {}): Promise<T> {
  if (!tenantId) throw new Error("withTenant called without a tenantId");
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    },
    { maxWait: 5_000, timeout: opts.timeout ?? 60_000 },
  );
}

/**
 * Platform-level access across all schools (onboarding, seed, health checks).
 * Never call this from code that handles a school user's request.
 */
export function withSystem<T>(fn: (tx: Tx) => Promise<T>, opts: TxOptions = {}): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
      return fn(tx);
    },
    { maxWait: 5_000, timeout: opts.timeout ?? 60_000 },
  );
}
