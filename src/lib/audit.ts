import type { Prisma } from "@prisma/client";
import type { Tx } from "@/lib/db";

export function audit(
  tx: Tx,
  entry: {
    tenantId: string;
    actorUserId: string | null;
    action: string;
    entity: string;
    entityId: string;
    before?: Prisma.InputJsonValue;
    after?: Prisma.InputJsonValue;
  },
) {
  return tx.auditLog.create({ data: entry });
}
