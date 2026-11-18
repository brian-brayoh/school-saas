import type { ReactNode } from "react";
import { formatKePhone } from "@/lib/phone";

type Institution = {
  name: string;
  address: string | null;
  county: string | null;
  phone: string | null;
  email: string | null;
  motto: string | null;
};

/**
 * Letterhead for printed documents: seal on the left, name and contacts in
 * the middle, logo on the right, then the document's own title row.
 * Missing images leave their column empty so the name stays centred.
 */
export function InstitutionHeader({
  tenant,
  sealUrl,
  logoUrl,
  children,
}: {
  tenant: Institution;
  sealUrl: string | null;
  logoUrl: string | null;
  children?: ReactNode;
}) {
  const place = [tenant.address, tenant.address?.toLowerCase().includes((tenant.county ?? "").toLowerCase()) ? null : tenant.county]
    .filter(Boolean)
    .join(", ");
  const contacts = [tenant.phone ? `Tel ${formatKePhone(tenant.phone)}` : null, tenant.email].filter(Boolean);

  return (
    <header>
      <div className="grid grid-cols-[5.5rem_1fr_5.5rem] items-center gap-4">
        <div className="flex h-[5.5rem] items-center justify-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {sealUrl && <img src={sealUrl} alt={`${tenant.name} seal`} className="max-h-full max-w-full object-contain" />}
        </div>
        <div className="text-center">
          <h1 className="text-[1.35rem] font-bold uppercase leading-tight tracking-wide">{tenant.name}</h1>
          {place && <p className="mt-1 text-[0.82rem] leading-snug text-stone-700">{place}</p>}
          {contacts.length > 0 && (
            <p className="flex flex-wrap justify-center gap-x-4 text-[0.82rem] leading-snug text-stone-700">
              {contacts.map((c) => <span key={c} className="whitespace-nowrap">{c}</span>)}
            </p>
          )}
          {tenant.motto && <p className="mt-1 text-sm italic text-stone-600">&ldquo;{tenant.motto}&rdquo;</p>}
        </div>
        <div className="flex h-[5.5rem] items-center justify-end">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logoUrl && <img src={logoUrl} alt={`${tenant.name} logo`} className="max-h-full max-w-full object-contain" />}
        </div>
      </div>
      <div className="mt-3 border-t-[3px] border-double border-stone-800" />
      {children && <div className="mt-3 flex items-end justify-between gap-4">{children}</div>}
    </header>
  );
}
