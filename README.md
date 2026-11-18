# School SaaS: v1 foundation (build step 1)

Multi-tenant school back office. One deployment serves every school, each on its own subdomain:

| Host | Area | Code |
| --- | --- | --- |
| `yourapp.co.ke` | Marketing + "find your school" | `src/app/site` |
| `admin.yourapp.co.ke` | Platform admin: onboard / suspend schools | `src/app/platform` |
| `stmarys.yourapp.co.ke` | A school's back office | `src/app/school` |

**Built so far:**
- **Step 1, foundation:** tenancy enforced by Postgres row-level security, sign-in with roles per school, academic years/terms/classes/streams, staff & access, students list, Excel import of students and guardians, platform onboarding.
- **Step 2, fees:** fee items (with optional items), fee structures per class × term × day/boarding (grid editor, copy from another term), one-click termly invoicing (safe to re-run for late admissions), bursaries/discounts/waivers/extra charges with reasons and approver, student statements, balances list, fee stats on the dashboard.

- **Step 3a, payments:** record cash/bank/sponsor/M-Pesa payments by hand, oldest-invoice-first allocation, overpayment credit applied at the next invoicing, receipts, reversals.
- **Step 3b, M-Pesa:** each school connects its own paybill (Daraja C2B v2) under **M-Pesa** in the sidebar. Payments are saved first and then matched: exact admission numbers are receipted automatically, and near misses go to **Payments → match** for a one-click confirm that is remembered next time. Includes a local simulator and a sandbox test-payment button.

- **Institution types:** each tenant is a School, TVET or University (set by the platform admin). The data model is shared and only the wording changes: Class → Course → Programme, Stream → Intake → Cohort, Term → Semester, Day/Boarding → Non-resident/Resident, Admission no → Reg no. Excel templates use the institution's own column names, and the importer accepts any of them. See `src/lib/terms.ts`.

- **Printable receipts:** every payment (cash, bank, sponsor, M-Pesa) has an A5 receipt with the amount in words, what it paid, the balance now, and who received it. Open it from **Print receipt** after recording a payment, or from any receipt number.
- **Printable fee statements:** **Print statement** on any student gives an A4 statement with a running balance (invoices, bursaries, extra charges, payments and reversals). It can be limited to one year with the balance brought forward, and shows the paybill and account number when there's something to pay.
- **Letterhead and branding:** each institution has an address, contacts, motto, a seal/crest and a logo (PNG/JPG/WebP, under 500 KB, stored in the database). Receipts and statements print seal left, details centred, logo right. Set during platform onboarding, at Institutions → Edit profile & logo, or by the school under **Profile & logo**. The seal also shows on the school's sign-in page, sidebar and the platform list. The demo school is seeded with a sample crest and the Ada mark (`prisma/demo-assets`).
- **Landing page** at the root domain. The product's working name is "Ada" (Swahili for fees); change it in `src/lib/brand.ts`. Logo files: `public/brand/` (`ada-mark.svg`, `ada-mark.png`, `ada-logo.png`), and the favicon is `src/app/icon.svg`.

**Next:** M-Pesa statement upload (backfill missed notifications), then SMS to parents.

### After pulling a step that changes the schema

```powershell
npm run db:migrate -- --name <short-name>   # e.g. fees
npm run db:rls                              # RLS + grants for any new table
```

Stack: Next.js 15 (App Router) · TypeScript · Tailwind 4 · Prisma 6 (pinned) · Postgres/Neon · Auth.js v5.

---

## Run it locally (PowerShell)

Unzip to `C:\dev\school-saas`. The database is Neon; no local Postgres is needed.

### Database setup (once per Neon project)

1. Create a Neon project. From **Connect**, copy the **pooled** string (host has `-pooler`) and the **direct** one (pooling off).
2. Neon's `neondb_owner` role has **BYPASSRLS**, which switches off tenant isolation, so the app must connect as its own role. Generate a password:
   ```powershell
   -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
   ```
   Then in the Neon **SQL Editor**:
   ```sql
   CREATE ROLE school_app LOGIN PASSWORD 'PASTE_PASSWORD' NOBYPASSRLS;
   GRANT CONNECT ON DATABASE neondb TO school_app;
   ```
3. Create `.env` from the example and fill in both URLs. `DATABASE_URL` = pooled host as `school_app`; `DIRECT_URL` = direct host as `neondb_owner`. Leave out `channel_binding=require`.
   ```powershell
   Copy-Item .env.example .env
   notepad .env
   ```

### Install and run

```powershell
npx auth secret
npm install
npm run db:setup      # migrate (owner) → RLS + grants for school_app → seed
npm run rls:check     # all six lines must say PASS
npm run dev
```

If commands time out or say "Can't reach database server", your network is probably blocking or throttling port 5432 (common on office networks). Use a phone hotspot.

Then open:

- **Platform admin:** http://admin.localhost:3000 with `admin@example.com` / `ChangeMe123!` (from `.env`)
- **Demo school:** http://demo.localhost:3000 with `demo@example.com` / `Demo1234!`

Chrome, Edge and Firefox resolve `*.localhost` to your machine without any hosts-file edits.

> Same-origin `redirect()` inside a server action renders the target without passing through the subdomain middleware, which gives a 404. Sign-in and sign-out therefore return to the client, which does a full page load instead. Follow the same pattern if an action needs to send the user to another page.

Try the core flow: Academic setup → Students → Import from Excel → **Download template** → fill a few rows → **Check file** → **Import**.

## M-Pesa

1. Add `APP_ENCRYPTION_KEY` and `PUBLIC_CALLBACK_BASE_URL` to `.env` (see `.env.example`).
2. **Locally,** use the **Simulate an M-Pesa paybill payment** card on the Payments page. It runs the same code as a real Safaricom notification, and needs no Safaricom account.
3. **Daraja sandbox:** create an app on developer.safaricom.co.ke and use the sandbox paybill and keys under **M-Pesa** in the sidebar. Safaricom must be able to reach `PUBLIC_CALLBACK_BASE_URL`, so use the deployed Vercel URL or a tunnel (e.g. `cloudflared tunnel --url http://localhost:3000`). Then **Register with Safaricom** and **Send test payment**.
4. **Live:** each school applies for Daraja production access for its own paybill, then switches the environment to Production and registers again. Production callbacks must be HTTPS, and Safaricom rejects URLs containing words like "mpesa" or "safaricom".

Callback endpoints: `/api/c2b/<secret-token>/confirm` and `/validate`. The token identifies the school, so keep it private.

## Test data

```powershell
npm run db:demo
```

This fills the demo school with about 130 students across PP1–Grade 9 (Grade 4 split into East/West), guardians shared between siblings, fee items, and day/boarding fee structures for the current term. Grade 9 boarding is left without a structure on purpose, so Invoicing shows its warning. No invoices are created; run Fees → Invoicing yourself. It's safe to run twice. The phone numbers are made up, so never send real SMS to them.

To test the Excel import, use the files in `test-data/` (Students → Import from Excel):
- `students-clean.xlsx`: 14 new students. All pass, including siblings sharing guardians, mixed phone formats, and a messy row that gets tidied up.
- `students-with-errors.xlsx`: 12 rows, 10 with one deliberate mistake each. Import stays disabled until they're fixed.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run db:setup` | First-time local setup: init migration, RLS, seed |
| `npm run db:migrate` | `prisma migrate dev` after schema changes. **Follow it with `npm run db:rls`** |
| `npm run db:rls` | (Re)applies RLS to every table with a `tenantId` column. Idempotent |
| `npm run db:deploy` | Production: `migrate deploy` + RLS |
| `npm run rls:check` | Creates two throwaway schools and proves they can't see or write each other's data |
| `npm run db:seed` | Platform admin + demo school (idempotent) |
| `npm run db:demo` | Demo students, guardians and fee structures (idempotent) |

---

## How tenant isolation works (the one rule to follow)

Every school-owned table has a `tenantId` column, and `prisma/rls.sql` puts a forced RLS policy on every such table. Rows are only visible when the transaction has `app.tenant_id` set to that school.

```ts
// ✅ Always: scope to the school from requireSchool()
const { tenant } = await requireSchool();
const students = await withTenant(tenant.id, (tx) => tx.student.findMany());

// ❌ Never: the raw client returns ZERO rows from tenant tables (by design)
await prisma.student.findMany();
```

- `withTenant(tenantId, fn)` runs `fn` in a transaction with `app.tenant_id` set (transaction-local, so it's safe behind Neon's pooler).
- `withSystem(fn)` bypasses RLS for platform work (onboarding, seed, checks). Never use it in code that serves a school user.
- `prisma` (raw) is only for the two global tables: `Tenant` and `User`.
- `requireSchool(roles?)` is the gate for every school page and server action. It resolves the school from the host, checks the session was issued for that school, and re-reads the membership so role changes apply immediately.
- New table? Give it a `tenantId`, migrate, and run `npm run db:rls`. It's covered automatically.

RLS protects you from a forgotten `where: { tenantId }`. It does not protect against SQL injection that sets `app.bypass_rls`, so never build raw SQL from user input.

### Roles

| Role | Access |
| --- | --- |
| OWNER | Everything, including managing owners |
| ADMIN | Everything except owners |
| BURSAR | Students, imports (and fees/payments in the next step) |
| TEACHER, VIEWER | Read-only for now |

---

## Production: Neon + Vercel

1. **Neon:** `DATABASE_URL` = pooled connection string (hostname has `-pooler`), `DIRECT_URL` = the same without `-pooler`.
2. Run migrations from your machine against Neon:
   ```powershell
   $env:DATABASE_URL="<neon pooled>"; $env:DIRECT_URL="<neon direct>"
   npm run db:deploy
   npm run rls:check
   ```
3. Production gets its own `school_app` role, created exactly as in "Database setup", and its own `rls:check` run.
4. **Vercel:** add your apex domain **and** a wildcard `*.yourapp.co.ke` (wildcards need Vercel's nameservers). Set env vars: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `AUTH_TRUST_HOST=true`, `ROOT_DOMAIN=yourapp.co.ke`, `ADMIN_SUBDOMAIN=admin`.
5. The student import allows up to 60 s per request (`maxDuration`); that needs a Vercel plan that permits it.

---

## Changes from the spec doc

- `tenantId` was added to the four child tables that lacked it (`StudentGuardian`, `FeeStructureLine`, `InvoiceLine`, `Allocation`) so every school-owned table uses the same RLS policy.
- `datasource` now has `directUrl` for Neon migrations.
- Admission numbers are stored trimmed, uppercase and without spaces (`adm 001` → `ADM001`) so M-Pesa matching is predictable.

## Project map

```
prisma/
  schema.prisma        full v1 model (fees, payments, SMS included)
  rls.sql              RLS for every tenantId table, idempotent
  seed.ts              platform admin + demo school
scripts/
  local-app-role.sql   only if you run Postgres locally instead of Neon
  rls-check.ts         isolation proof
src/
  middleware.ts        subdomain → area rewrite
  auth.ts              Auth.js credentials (email or phone), per-host sessions
  lib/db.ts            prisma, withTenant, withSystem
  lib/school.ts        requireSchool, requirePlatformAdmin, role sets
  lib/students-import.ts  template, validation, upsert/import
  lib/phone.ts         Kenyan phone normalisation (2547…/2541…)
  app/site | app/platform | app/school
```
#   s c h o o l - s a a s  
 