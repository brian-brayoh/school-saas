"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";

export type LoginState = { error?: string; redirectTo?: string } | null;

/**
 * Sign in WITHOUT a server-side redirect. Next.js renders a server-action
 * redirect inside the same request, which skips the subdomain middleware and
 * lands on a 404. The client does a full page load to `redirectTo` instead.
 */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const raw = String(formData.get("redirectTo") || "/dashboard");
  const redirectTo = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
  try {
    await signIn("credentials", {
      identifier: formData.get("identifier"),
      password: formData.get("password"),
      redirect: false,
    });
    return { redirectTo };
  } catch (err) {
    if (err instanceof AuthError) return { error: "Wrong email/phone or password, or no access to this school." };
    throw err;
  }
}

/** Same reason as above: the client navigates to /login after this resolves. */
export async function logoutAction() {
  await signOut({ redirect: false });
}
