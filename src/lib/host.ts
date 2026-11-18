// Edge-safe: used by middleware and by server code.

export type HostInfo = { area: "root" } | { area: "admin" } | { area: "school"; slug: string };

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
export const RESERVED_SLUGS = new Set(["www", "app", "api", "admin", "mail", "static", "assets", "help", "support"]);

export function rootDomain(): string {
  return (process.env.ROOT_DOMAIN ?? "localhost:3000").toLowerCase();
}

export function parseHost(rawHost: string | null | undefined): HostInfo {
  const host = (rawHost ?? "").toLowerCase().trim();
  const root = rootDomain();
  const adminSub = (process.env.ADMIN_SUBDOMAIN ?? "admin").toLowerCase();

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
  return `${proto}://${slug}.${root}${path}`;
}
