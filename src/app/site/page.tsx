import { PRODUCT_NAME, demoHref } from "@/lib/brand";
import { HeroLedger } from "./HeroLedger";
import { SchoolFinder } from "./SchoolFinder";

const STEPS = [
  { title: "A parent pays your paybill", body: "They enter the admission number as the account, the way they already do." },
  { title: `${PRODUCT_NAME} finds the student`, body: "Even when it's typed as d-0001, adm 1 or with a space. Real near misses wait for the bursar to confirm." },
  { title: "The receipt is issued", body: "Numbered, against the oldest unpaid invoice first. Overpayments carry to next term." },
  { title: "The balance list is right", body: "By class, largest first. No end-of-day reconciliation." },
];

const CHANGES = [
  { before: "Matching M-Pesa statements to names with a highlighter", after: "Payments land on the right student as they arrive" },
  { before: "Writing carbon-copy receipts for every parent", after: "A numbered receipt for every payment, cash and bank included" },
  { before: "Adding up each class's fees at the start of term", after: "One click invoices every enrolled student from the fee structure" },
  { before: "“How much does my child owe?” calls", after: "Each student's statement shows invoices, bursaries and payments" },
];

const FEATURES = [
  { title: "Automatic M-Pesa matching", body: "Your own paybill, connected once. Payments are matched by admission number, and typos are learnt.", live: true },
  { title: "Termly invoicing", body: "Fee structures per class and day or boarding. Late admissions invoiced without double billing.", live: true },
  { title: "Receipts for every payment", body: "M-Pesa, cash, bank deposits and sponsor cheques, each with a printable numbered receipt.", live: true },
  { title: "Balances and statements", body: "Who owes what, by class. Bursaries, waivers and extra charges recorded with a reason.", live: true },
  { title: "Excel import", body: "Students and guardians from the spreadsheet you already have, with every problem listed by row.", live: true },
  { title: "Staff roles", body: "Owner, bursar, teacher and viewer each see only what they need. Every money change is logged.", live: true },
  { title: "Fee SMS to parents", body: "Payment confirmations, balance reminders and announcements from the school's own sender name.", live: false },
  { title: "CBC assessments and report cards", body: "Competency-based records per learner and report cards in the current format.", live: false },
];

const KINDS = [
  { who: "Schools", words: "Classes, streams, terms, day and boarding" },
  { who: "TVETs", words: "Courses, intakes, trainees, resident and non-resident" },
  { who: "Universities", words: "Programmes, cohorts, semesters, reg numbers" },
];

function DemoButton({ tone }: { tone: "light" | "dark" }) {
  const href = demoHref();
  if (!href) return null;
  return (
    <a
      href={href}
      className={`inline-flex items-center rounded-md px-5 py-3 text-base font-semibold ${
        tone === "light" ? "bg-carbon text-white hover:bg-carbon-deep" : "bg-trip text-ink hover:bg-white"
      }`}
    >
      Book a demo
    </a>
  );
}

export default function SiteHome() {
  return (
    <>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <a href="/" className="flex items-center gap-2.5 text-2xl font-extrabold tracking-[-0.04em] text-carbon">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/ada-mark.svg" alt="" width={34} height={34} />
          {PRODUCT_NAME}
        </a>
        <nav className="flex items-center gap-6 text-sm font-medium">
          <a href="#how" className="hidden hover:text-carbon sm:inline">How it works</a>
          <a href="#features" className="hidden hover:text-carbon sm:inline">Features</a>
          <a href="#signin" className="hover:text-carbon">Sign in</a>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-6 lg:grid-cols-[1.05fr_1fr] lg:pt-12">
          <div>
            <h1 className="max-w-[13ch] text-[clamp(2.6rem,6vw,4.6rem)] font-extrabold leading-[0.98] tracking-[-0.035em]">
              Fees that reconcile themselves.
            </h1>
            <p className="mt-6 max-w-[52ch] text-lg leading-relaxed text-ink/75">
              Parents pay your paybill with the admission number. {PRODUCT_NAME} puts every shilling on the right student,
              issues the receipt and updates the balance list before the bursar opens the counter book.
            </p>
            <div className="mt-8 flex flex-wrap items-end gap-8">
              <DemoButton tone="light" />
              <div id="signin" className="scroll-mt-24"><SchoolFinder /></div>
            </div>
          </div>
          <HeroLedger />
        </section>

        <section id="how" className="scroll-mt-10 border-y border-ink/10 bg-white">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <h2 className="max-w-[24ch] text-3xl font-bold tracking-tight sm:text-4xl">What happens to one payment</h2>
            <ol className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <li key={s.title} className="relative border-t-2 border-carbon pt-5">
                  <span className="absolute -top-[0.95rem] left-0 bg-white pr-3 text-sm font-bold tabular-nums text-carbon">{i + 1}</span>
                  <h3 className="text-lg font-semibold leading-snug">{s.title}</h3>
                  <p className="mt-2 leading-relaxed text-ink/70">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="max-w-[28ch] text-3xl font-bold tracking-tight sm:text-4xl">What the bursar stops doing</h2>
          <div className="mt-10 overflow-hidden rounded-md ring-1 ring-ink/10">
            <div className="grid grid-cols-2 bg-dup/60 text-sm font-semibold">
              <div className="px-5 py-3">Before</div>
              <div className="border-l border-ink/10 bg-carbon px-5 py-3 text-white">With {PRODUCT_NAME}</div>
            </div>
            {CHANGES.map((c) => (
              <div key={c.before} className="grid grid-cols-2 border-t border-ink/10 bg-white">
                <p className="px-5 py-4 font-hand text-lg leading-snug text-ink/60">{c.before}</p>
                <p className="border-l border-ink/10 px-5 py-4 font-medium leading-snug">{c.after}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="features" className="scroll-mt-10 bg-carbon text-white">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <h2 className="max-w-[26ch] text-3xl font-bold tracking-tight sm:text-4xl">Everything the fees office needs</h2>
            <p className="mt-3 max-w-[60ch] text-white/75">Available now, and what comes next.</p>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((f) => (
                <article
                  key={f.title}
                  className={`rounded-lg p-6 ${f.live ? "bg-white text-ink" : "border border-dashed border-white/40 text-white"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-lg font-semibold leading-snug">{f.title}</h3>
                    {!f.live && <span className="shrink-0 rounded-full bg-trip px-2.5 py-0.5 text-xs font-semibold text-ink">Coming</span>}
                  </div>
                  <p className={`mt-3 leading-relaxed ${f.live ? "text-ink/70" : "text-white/75"}`}>{f.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Speaks your institution&apos;s language</h2>
            <dl className="mt-8 divide-y divide-ink/10 border-y border-ink/10">
              {KINDS.map((k) => (
                <div key={k.who} className="grid grid-cols-[8rem_1fr] gap-4 py-4">
                  <dt className="font-semibold text-carbon">{k.who}</dt>
                  <dd className="text-ink/75">{k.words}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <h2 className="text-3xl font-bold tracking-tight">The money never passes through us</h2>
            <ul className="mt-8 space-y-4 leading-relaxed text-ink/75">
              <li><strong className="text-ink">Paid straight to your paybill.</strong> {PRODUCT_NAME} only reads the payment notification.</li>
              <li><strong className="text-ink">Your records are walled off.</strong> Each school&apos;s data is separated inside the database itself, not just in the app.</li>
              <li><strong className="text-ink">Your M-Pesa keys are encrypted</strong> before they are stored, and every change to money is logged with who made it.</li>
            </ul>
          </div>
        </section>

        <section className="bg-ink text-white">
          <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-16 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="max-w-[22ch] text-3xl font-bold tracking-tight sm:text-4xl">Bring one term&apos;s fee structure. See it running the same day.</h2>
              <div className="mt-6"><DemoButton tone="dark" /></div>
            </div>
            <SchoolFinder tone="dark" />
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-wrap justify-between gap-4 px-6 py-8 text-sm text-ink/60">
        <span className="flex items-center gap-2 font-bold text-carbon">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/ada-mark.svg" alt="" width={20} height={20} />
          {PRODUCT_NAME}
        </span>
        <span>School fees, matched and receipted. Made in Kenya.</span>
      </footer>
    </>
  );
}
