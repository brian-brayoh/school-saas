"use client";

import { startTransition, useActionState, type FormEvent, type ReactNode } from "react";
import { btnCls, Notice } from "@/components/ui";

export type FormState = { error?: string; ok?: string; link?: { href: string; label: string; sameTab?: boolean } } | null;

/**
 * Form bound to a server action that returns { error } or { ok }.
 * React clears a form after its action runs; pass keepValues for forms where
 * that would lose work (grids, long forms), so a validation error keeps input.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  className = "",
  buttonClassName = btnCls,
  keepValues = false,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  children: ReactNode;
  submitLabel: string;
  className?: string;
  buttonClassName?: string;
  keepValues?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  const onSubmit = keepValues
    ? (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }
    : undefined;

  return (
    <form action={keepValues ? undefined : formAction} onSubmit={onSubmit} className={className}>
      {children}
      <button className={buttonClassName} disabled={pending}>{pending ? "Saving…" : submitLabel}</button>
      {state?.error && <div className="basis-full"><Notice tone="error">{state.error}</Notice></div>}
      {state?.ok && (
        <div className="basis-full">
          <Notice tone="success">
            {state.ok}
            {state.link && (
              <>
                {" "}
                <a href={state.link.href} {...(state.link.sameTab ? {} : { target: "_blank", rel: "noopener" })} className="font-semibold underline">{state.link.label}</a>
              </>
            )}
          </Notice>
        </div>
      )}
    </form>
  );
}
