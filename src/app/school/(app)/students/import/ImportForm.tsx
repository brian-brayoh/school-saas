"use client";

import { useActionState, useState, startTransition } from "react";
import Link from "next/link";
import { importStudents, type ImportState } from "./actions";
import { Card, Notice, btnCls, btnSecondaryCls } from "@/components/ui";

export function ImportForm({ labels }: { labels: { admissionNo: string; class: string } }) {
  const [file, setFile] = useState<File | null>(null);
  const [state, dispatch, pending] = useActionState<ImportState, FormData>(importStudents, null);

  // Build FormData by hand: React resets <form> inputs after an action,
  // which would clear the chosen file between "Check" and "Import".
  const run = (intent: "validate" | "import") => {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    fd.set("intent", intent);
    startTransition(() => dispatch(fd));
  };

  const checked = state?.intent === "validate" && !state.fileError;
  const clean = checked && (state.errors?.length ?? 0) === 0 && (state.validCount ?? 0) > 0;

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm file:mr-3 file:rounded-md file:border file:border-stone-300 file:bg-white file:px-3 file:py-2 file:text-sm"
          />
          <button type="button" className={btnSecondaryCls} disabled={!file || pending} onClick={() => run("validate")}>
            {pending && state?.intent !== "import" ? "Checking…" : "1. Check file"}
          </button>
          <button type="button" className={btnCls} disabled={!file || pending || !clean} onClick={() => run("import")}>
            {pending ? "Working…" : "2. Import"}
          </button>
        </div>
        <p className="mt-3 text-xs text-stone-500">Nothing is saved until you click Import, and the import is all-or-nothing.</p>
      </Card>

      {state?.fileError && <Notice tone="error">{state.fileError}</Notice>}

      {state?.result && (
        <Notice tone="success">
          Imported {state.validCount} rows: {state.result.created} new, {state.result.updated} updated, {state.result.unchanged} unchanged.
          {" "}{state.result.guardiansCreated} new guardians, {state.result.links} guardian links
          {state.result.enrolled ? `, ${state.result.enrolled} enrolled in the current term` : ""}.{" "}
          <Link href="/students" className="font-medium underline">View students</Link>
        </Notice>
      )}

      {checked && state.noCurrentTerm && (
        <Notice>No current term is set, so students will be saved but not enrolled. Set one under Academic setup first if you want enrollment.</Notice>
      )}

      {checked && (
        <Card title={`Checked ${state.totalRows} rows: ${state.validCount} ready, ${state.errors?.length ?? 0} with problems`}>
          {(state.errors?.length ?? 0) > 0 && (
            <>
              <p className="mb-3 text-sm text-stone-700">Fix these rows in Excel, save, and check the file again.</p>
              <table className="w-full text-sm">
                <thead className="text-left text-stone-500"><tr><th className="w-16 pb-2">Row</th><th className="w-32">{labels.admissionNo}</th><th>Problem</th></tr></thead>
                <tbody className="divide-y divide-stone-100">
                  {state.errors!.map((e) => (
                    <tr key={e.row} className="align-top">
                      <td className="py-2 tabular-nums">{e.row}</td>
                      <td className="font-mono">{e.admissionNo ?? "—"}</td>
                      <td className="text-red-800">{e.messages.join("; ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {clean && state.preview && (
            <>
              <p className="mb-3 text-sm text-stone-700">Everything looks good. First rows:</p>
              <table className="w-full text-sm">
                <thead className="text-left text-stone-500"><tr><th className="pb-2">{labels.admissionNo}</th><th>Name</th><th>{labels.class}</th><th>Guardians</th></tr></thead>
                <tbody className="divide-y divide-stone-100">
                  {state.preview.map((p) => (
                    <tr key={p.admissionNo}><td className="py-2 font-mono">{p.admissionNo}</td><td>{p.name}</td><td>{p.classLabel}</td><td>{p.guardians}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
