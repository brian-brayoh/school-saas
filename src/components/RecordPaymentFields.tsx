import { Field, inputCls } from "@/components/ui";
import { METHOD_LABELS } from "@/lib/payments";

/** Shared fields for the record-payment form (payments page and student statement). */
export function RecordPaymentFields({ studentId }: { studentId?: string }) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
  return (
    <>
      {studentId ? (
        <input type="hidden" name="studentId" value={studentId} />
      ) : (
        <Field label="Admission no"><input name="admissionNo" required className={inputCls} placeholder="D0001" /></Field>
      )}
      <Field label="Amount (KES)"><input name="amount" required inputMode="decimal" className={inputCls} placeholder="15000" /></Field>
      <Field label="Method">
        <select name="method" defaultValue="MPESA" className={inputCls}>
          {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label="Reference" hint="M-Pesa code or bank slip no. Optional for cash">
        <input name="reference" className={`${inputCls} uppercase`} placeholder="SKL4ABCD12" autoCapitalize="characters" />
      </Field>
      <Field label="Date paid"><input name="paidOn" type="date" defaultValue={today} max={today} required className={inputCls} /></Field>
      <Field label="Paid by (optional)"><input name="payerName" className={inputCls} /></Field>
    </>
  );
}
