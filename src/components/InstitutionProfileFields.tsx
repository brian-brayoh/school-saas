import { Field, inputCls } from "@/components/ui";
import { formatKePhone } from "@/lib/phone";

type Current = {
  name?: string;
  address?: string | null;
  county?: string | null;
  phone?: string | null;
  email?: string | null;
  motto?: string | null;
};

function ImageField({ name, label, hint, url }: { name: "seal" | "logo"; label: string; hint: string; url: string | null }) {
  const removeName = name === "seal" ? "removeSeal" : "removeLogo";
  return (
    <div className="space-y-2">
      <span className="text-sm font-medium text-stone-700">{label}</span>
      <div className="flex items-center gap-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md border border-dashed border-stone-300 bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {url ? <img src={url} alt="" className="max-h-full max-w-full object-contain p-1" /> : <span className="text-xs text-stone-400">none</span>}
        </div>
        <div className="space-y-1 text-sm">
          <input type="file" name={name} accept="image/png,image/jpeg,image/webp" className="text-sm file:mr-3 file:rounded-md file:border file:border-stone-300 file:bg-white file:px-3 file:py-1.5" />
          <span className="block text-xs text-stone-500">{hint}</span>
          {url && (
            <label className="flex items-center gap-2 text-xs text-stone-600">
              <input type="checkbox" name={removeName} /> Remove
            </label>
          )}
        </div>
      </div>
    </div>
  );
}

/** Name, contacts and images printed on receipts and statements. */
export function InstitutionProfileFields({ current = {}, sealUrl = null, logoUrl = null }: { current?: Current; sealUrl?: string | null; logoUrl?: string | null }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Institution name"><input name="name" required defaultValue={current.name ?? ""} className={inputCls} /></Field>
      <Field label="Motto (optional)"><input name="motto" defaultValue={current.motto ?? ""} className={inputCls} placeholder="Strive for excellence" /></Field>
      <Field label="Postal / physical address"><input name="address" defaultValue={current.address ?? ""} className={inputCls} placeholder="P.O. Box 123-10200, Murang'a" /></Field>
      <Field label="County"><input name="county" defaultValue={current.county ?? ""} className={inputCls} /></Field>
      <Field label="Phone"><input name="phone" defaultValue={current.phone ? formatKePhone(current.phone) : ""} className={inputCls} placeholder="0712 345 678" /></Field>
      <Field label="Email"><input name="email" type="email" defaultValue={current.email ?? ""} className={inputCls} /></Field>
      <ImageField name="seal" label="Seal / crest (left of the header)" hint="PNG, JPG or WebP, under 500 KB. A transparent PNG looks best." url={sealUrl} />
      <ImageField name="logo" label="Logo (right of the header)" hint="PNG, JPG or WebP, under 500 KB." url={logoUrl} />
    </div>
  );
}
