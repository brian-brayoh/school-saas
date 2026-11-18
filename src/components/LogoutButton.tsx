"use client";

import { useTransition } from "react";
import { logoutAction } from "@/lib/auth-actions";

export function LogoutButton({ className = "text-brand-700 hover:underline" }: { className?: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={className}
      onClick={() =>
        start(async () => {
          await logoutAction();
          window.location.assign("/login");
        })
      }
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
