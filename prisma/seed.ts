/**
 * Idempotent dev seed:
 *  - platform admin (SEED_PLATFORM_ADMIN_EMAIL / _PASSWORD)
 *  - demo school "demo" with owner demo@example.com / Demo1234!
 *  - 2027 academic year with Term 1 current, PP1–Grade 9 with a Main stream
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import { prisma, withSystem } from "../src/lib/db";
import { DEFAULT_CLASSES, DEFAULT_STREAM } from "../src/lib/defaults";

async function main() {
  const adminEmail = (process.env.SEED_PLATFORM_ADMIN_EMAIL ?? "admin@example.com").toLowerCase();
  const adminPassword = process.env.SEED_PLATFORM_ADMIN_PASSWORD ?? "ChangeMe123!";

  // SEED_RESET_ADMIN_PASSWORD=true: recovery for a locked-out platform admin.
  const resetAdmin = process.env.SEED_RESET_ADMIN_PASSWORD === "true";
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      isPlatformAdmin: true,
      ...(resetAdmin && { passwordHash: await bcrypt.hash(adminPassword, 10), mustChangePassword: false, sessionVersion: { increment: 1 } }),
    },
    create: { name: "Platform Admin", email: adminEmail, isPlatformAdmin: true, passwordHash: await bcrypt.hash(adminPassword, 10) },
  });

  const owner = await prisma.user.upsert({
    where: { email: "demo@example.com" },
    update: {},
    create: { name: "Demo Owner", email: "demo@example.com", phone: "254700000001", passwordHash: await bcrypt.hash("Demo1234!", 10) },
  });

  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    update: {},
    create: { name: "Demo Academy", slug: "demo", county: "Nairobi", status: "ACTIVE" },
  });

  // Example letterhead details and images (only filled in if still empty).
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      address: tenant.address ?? "P.O. Box 12345-00100, Ngong Road, Nairobi",
      phone: tenant.phone ?? "254700000001",
      email: tenant.email ?? "office@demoacademy.ac.ke",
      motto: tenant.motto ?? "Learn, serve, excel",
    },
  });

  await withSystem(async (tx) => {
    const existing = await tx.tenantBranding.findUnique({ where: { tenantId: tenant.id }, select: { sealMime: true, logoMime: true } });
    const asset = (f: string) => readFileSync(join(process.cwd(), "prisma", "demo-assets", f));
    await tx.tenantBranding.upsert({
      where: { tenantId: tenant.id },
      create: { tenantId: tenant.id, seal: asset("seal.png"), sealMime: "image/png", logo: asset("logo.png"), logoMime: "image/png" },
      update: {
        ...(!existing?.sealMime && { seal: asset("seal.png"), sealMime: "image/png" }),
        ...(!existing?.logoMime && { logo: asset("logo.png"), logoMime: "image/png" }),
      },
    });

    await tx.membership.upsert({
      where: { tenantId_userId: { tenantId: tenant.id, userId: owner.id } },
      update: { role: "OWNER" },
      create: { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
    });

    const year = await tx.academicYear.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: "2027" } },
      update: {},
      create: {
        tenantId: tenant.id,
        name: "2027",
        isCurrent: true,
        startsOn: new Date("2027-01-04T00:00:00Z"),
        endsOn: new Date("2027-11-26T00:00:00Z"),
      },
    });

    const terms: [number, string, string][] = [
      [1, "2027-01-04", "2027-04-02"],
      [2, "2027-04-26", "2027-08-06"],
      [3, "2027-08-30", "2027-11-26"],
    ];
    for (const [number, s, e] of terms) {
      await tx.term.upsert({
        where: { tenantId_academicYearId_number: { tenantId: tenant.id, academicYearId: year.id, number } },
        update: {},
        create: {
          tenantId: tenant.id,
          academicYearId: year.id,
          number,
          isCurrent: number === 1,
          startsOn: new Date(`${s}T00:00:00Z`),
          endsOn: new Date(`${e}T00:00:00Z`),
        },
      });
    }

    for (const [i, name] of DEFAULT_CLASSES.entries()) {
      const cls = await tx.class.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name } },
        update: {},
        create: { tenantId: tenant.id, name, sortOrder: i },
      });
      await tx.stream.upsert({
        where: { tenantId_classId_name: { tenantId: tenant.id, classId: cls.id, name: DEFAULT_STREAM } },
        update: {},
        create: { tenantId: tenant.id, classId: cls.id, name: DEFAULT_STREAM },
      });
    }
  });

  console.log(`Seeded. Platform admin: ${adminEmail}. Demo school: slug "demo", owner demo@example.com / Demo1234!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
