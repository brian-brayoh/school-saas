"use client";

import { useActionState, useEffect } from "react";
import { loginAction, type LoginState } from "@/lib/auth-actions";
import { btnCls, inputCls, Field, Notice } from "@/components/ui";

export function LoginForm({
  title,
  subtitle,
  notice,
  redirectTo = "/dashboard",
  imageUrl,
  forgotHelp,
}: {
  imageUrl?: string | null;
  forgotHelp?: string;
  title: string;
  subtitle?: string;
  notice?: string;
  redirectTo?: string;
}) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, null);

  // Full page load (not a client transition) so the request goes through the subdomain middleware.
  useEffect(() => {
    if (state?.redirectTo) window.location.assign(state.redirectTo);
  }, [state]);
  const busy = pending || Boolean(state?.redirectTo);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {imageUrl && <img src={imageUrl} alt="" className="mx-auto mb-4 h-20 w-20 object-contain" />}
        <h1 className="text-center text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-center text-sm text-stone-600">{subtitle}</p>}
        <form action={action} className="mt-8 space-y-4 rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
          <input type="hidden" name="redirectTo" value={redirectTo} />
          {notice && <Notice>{notice}</Notice>}
          {state?.error && <Notice tone="error">{state.error}</Notice>}
          <Field label="Email or phone">
            <input name="identifier" required autoComplete="username" className={inputCls} />
          </Field>
          <Field label="Password">
            <input name="password" type="password" required autoComplete="current-password" className={inputCls} />
          </Field>
          <button type="submit" disabled={busy} className={`${btnCls} w-full`}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        {forgotHelp && (
          <details className="mt-4 text-center text-sm text-stone-600">
            <summary className="cursor-pointer text-brand-700 hover:underline">Forgot your password?</summary>
            <p className="mx-auto mt-2 max-w-xs">{forgotHelp}</p>
          </details>
        )}
      </div>
    </main>
  );
}
