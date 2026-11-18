/**
 * Proves tenant isolation against the database in DATABASE_URL.
 *   npm run rls:check
 * Exits non-zero if any check fails.
 */
import { prisma, withSystem, withTenant } from "../src/lib/db";

let failed = false;
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed = true;
};

async function main() {
  const [role] = await prisma.$queryRaw<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }[]>`
    SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
  check(!role.rolsuper && !role.rolbypassrls, `app role "${role.rolname}" is not superuser and has no BYPASSRLS`);
  if (role.rolsuper || role.rolbypassrls) {
    console.log("      → RLS is ignored for this role. See README: connect DATABASE_URL as a normal role.");
  }

  const [forced] = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = current_schema() AND c.relname = 'Student' AND c.relrowsecurity AND c.relforcerowsecurity`;
  check(forced.n === 1n, 'RLS enabled and forced on "Student" (run npm run db:rls if not)');

  const stamp = Date.now().toString(36);
  const [a, b] = await Promise.all(
    ["a", "b"].map((x) => prisma.tenant.create({ data: { name: `RLS check ${x}`, slug: `rls-${x}-${stamp}` } })),
  );

  try {
    await withTenant(a.id, (tx) => tx.student.create({ data: { tenantId: a.id, admissionNo: "RLS1", firstName: "Alice", lastName: "A" } }));
    await withTenant(b.id, (tx) => tx.student.create({ data: { tenantId: b.id, admissionNo: "RLS1", firstName: "Bob", lastName: "B" } }));

    const seenByA = await withTenant(a.id, (tx) => tx.student.findMany({ where: { admissionNo: "RLS1" } }));
    check(seenByA.length === 1 && seenByA[0].firstName === "Alice", "school A sees only its own student");

    const unscoped = await prisma.student.count({ where: { tenantId: { in: [a.id, b.id] } } });
    check(unscoped === 0, "queries outside withTenant see nothing");

    let crossWriteBlocked = false;
    try {
      await withTenant(a.id, (tx) => tx.student.create({ data: { tenantId: b.id, admissionNo: "RLS2", firstName: "Mallory", lastName: "M" } }));
    } catch {
      crossWriteBlocked = true;
    }
    check(crossWriteBlocked, "school A cannot write a row for school B");

    const updated = await withTenant(a.id, (tx) => tx.student.updateMany({ where: { tenantId: b.id }, data: { firstName: "Hacked" } }));
    check(updated.count === 0, "school A cannot update school B's rows");
  } finally {
    await withSystem(async (tx) => {
      await tx.student.deleteMany({ where: { tenantId: { in: [a.id, b.id] } } });
    });
    await prisma.tenant.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  }

  if (failed) process.exit(1);
  console.log("\nTenant isolation looks good.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
