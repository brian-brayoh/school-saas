import { NextResponse, type NextRequest } from "next/server";
import { parseHost } from "@/lib/host";

/**
 * One deployment, three areas, picked by subdomain:
 *   yourapp.co.ke            → src/app/site      (marketing / "find your school")
 *   admin.yourapp.co.ke      → src/app/platform  (platform admin)
 *   stmarys.yourapp.co.ke    → src/app/school    (a school's back office)
 *
 * The browser never sees the /site, /platform or /school prefix. A request
 * that already starts with one of them gets double-prefixed and 404s, so
 * one area can't be reached through another's host.
 */
export function middleware(req: NextRequest) {
  const info = parseHost(req.headers.get("host"));
  const prefix = info.area === "school" ? "/school" : info.area === "admin" ? "/platform" : "/site";

  const url = req.nextUrl.clone();
  url.pathname = `${prefix}${url.pathname === "/" ? "" : url.pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!api/|_next/|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|txt)$).*)"],
};
