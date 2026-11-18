// Edge-safe: used by middleware and by server code.

export type HostInfo = { area: "root" } | { area: "admin" } | { area: "school"; slug: string };

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
export const RESERVED_SLUGS = new Set(["www", "app", "api", "admin", "mail", "static", "assets", "help", "support"]);

export function rootDomain(): string {
  return (process.env.ROOT_DOMAIN ?? "localhost:3000").trim().toLowerCase();
}

/**
 * Extra hostnames mapped straight to a school or the admin console, for hosts
 * that aren't subdomains of ROOT_DOMAIN:
 *   TENANT_HOSTS="ada-demo.vercel.app=demo,ada-admin.vercel.app=admin,fees.stmarys.ac.ke=stmarys"
 * Useful before a wildcard domain is set up, and for schools on their own domain.
 */
function hostAliases(): Map<string, string> {
  const map = new Map<string, string>();
  for (const pair of (process.env.TENANT_HOSTS ?? "").split(",")) {
    const [host, target] = pair.split("=").map((s) => s?.trim().toLowerCase());
    if (host && target) map.set(host, target);
  }
  return map;
}

export function parseHost(rawHost: string | null | undefined): HostInfo {
  const host = (rawHost ?? "").toLowerCase().trim();
  const root = rootDomain();
  const adminSub = (process.env.ADMIN_SUBDOMAIN ?? "admin").trim().toLowerCase();

  const alias = hostAliases().get(host);
  if (alias) {
    if (alias === "admin" || alias === adminSub) return { area: "admin" };
    if (SLUG_RE.test(alias) && !RESERVED_SLUGS.has(alias)) return { area: "school", slug: alias };
  }

  if (!host || host === root || host === `www.${root}`) return { area: "root" };
  if (!host.endsWith(`.${root}`)) return { area: "root" };

  const sub = host.slice(0, -(root.length + 1));
  if (sub === adminSub) return { area: "admin" };
  if (!SLUG_RE.test(sub) || RESERVED_SLUGS.has(sub)) return { area: "root" };
  return { area: "school", slug: sub };
}

export function schoolUrl(slug: string, path = "/"): string {
  const root = rootDomain();
  const proto = root.startsWith("localhost") || root.includes("lvh.me") ? "http" : "https";
  for (const [host, target] of hostAliases()) {
    if (target === slug) return `${proto}://${host}${path}`;
  }
  return `${proto}://${slug}.${root}${path}`;
}
