import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma, withTenant } from "@/lib/db";
import { parseHost } from "@/lib/host";
import { normalizeKePhone } from "@/lib/phone";

declare module "next-auth" {
  interface User {
    tenantId?: string | null;
    isPlatformAdmin?: boolean;
    sessionVersion?: number;
  }
  interface Session {
    user: {
      id: string;
      tenantId: string | null;
      isPlatformAdmin: boolean;
      sessionVersion: number;
    } & DefaultSession["user"];
  }
}

// Used to keep "unknown user" as slow as "wrong password".
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

const credentialsSchema = z.object({
  identifier: z.string().trim().min(3),
  password: z.string().min(1),
});

/**
 * Sessions are host-only cookies, so a login on stmarys.* is never sent to
 * another school's subdomain. The token also records which school it was
 * issued for, and requireSchool() re-checks it plus the live membership
 * on every request (so role changes and removals apply immediately).
 */
export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [
    Credentials({
      credentials: { identifier: {}, password: {} },
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { identifier, password } = parsed.data;

        const phone = normalizeKePhone(identifier);
        const user = await prisma.user.findFirst({
          where: phone ? { phone } : { email: identifier.toLowerCase() },
        });
        if (!user) {
          await bcrypt.compare(password, DUMMY_HASH);
          return null;
        }
        if (!(await bcrypt.compare(password, user.passwordHash))) return null;

        const host = parseHost(request.headers.get("host"));

        if (host.area === "admin") {
          if (!user.isPlatformAdmin) return null;
          return { id: user.id, name: user.name, email: user.email, tenantId: null, isPlatformAdmin: true, sessionVersion: user.sessionVersion };
        }

        if (host.area !== "school") return null;
        const tenant = await prisma.tenant.findUnique({ where: { slug: host.slug } });
        if (!tenant || tenant.status === "SUSPENDED") return null;

        const membership = await withTenant(tenant.id, (tx) =>
          tx.membership.findUnique({ where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } } }),
        );
        if (!membership) return null;

        return { id: user.id, name: user.name, email: user.email, tenantId: tenant.id, isPlatformAdmin: false, sessionVersion: user.sessionVersion };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.uid = user.id;
        token.tenantId = user.tenantId ?? null;
        token.isPlatformAdmin = user.isPlatformAdmin ?? false;
        token.sv = user.sessionVersion ?? 0;
      }
      // After changing their own password, keep THIS device signed in (others drop off).
      if (trigger === "update" && typeof (session as { sessionVersion?: unknown })?.sessionVersion === "number") {
        token.sv = (session as { sessionVersion: number }).sessionVersion;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.uid as string;
      session.user.tenantId = (token.tenantId as string | null) ?? null;
      session.user.isPlatformAdmin = Boolean(token.isPlatformAdmin);
      session.user.sessionVersion = typeof token.sv === "number" ? token.sv : 0;
      return session;
    },
  },
});
