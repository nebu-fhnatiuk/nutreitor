import { NextResponse, type NextRequest } from "next/server";

/**
 * Resolución de tenant subdomain-first.
 *
 *  - host raíz (localhost / nutreitor.com / www.*) → landing de producto (sin tocar).
 *  - {slug}.ROOT_DOMAIN → workspace del tenant: reescribe el path a /s/{slug}/...
 *    e inyecta el header `x-tenant-slug` (lo consume el proxy /api y la API).
 *  - rutas /api/* NO se reescriben (las maneja el proxy), pero igual reciben el header.
 *  - chequeo coarse de auth: ruta protegida sin cookie de access → redirect a /login.
 *
 * El slug sale del hostname; la API lo valida por lookup (no es un tenant_id de confianza).
 */
const PROTECTED = ["/admin", "/pro", "/app"];

function resolveSlug(hostname: string): string | null {
  const root = process.env.ROOT_DOMAIN ?? "localhost";
  if (hostname === root || hostname === `www.${root}`) return null;
  if (!hostname.endsWith(`.${root}`)) return null;
  const sub = hostname.slice(0, -(root.length + 1)).split(".")[0];
  return sub && sub !== "www" ? sub : null;
}

export function middleware(req: NextRequest): NextResponse {
  const hostname = (req.headers.get("host") ?? "").split(":")[0];
  const slug = resolveSlug(hostname);
  const { pathname, search } = req.nextUrl;

  // Host raíz → landing de producto, sin reescritura.
  if (!slug) return NextResponse.next();

  const headers = new Headers(req.headers);
  headers.set("x-tenant-slug", slug);

  // /api/* lo maneja el proxy catch-all; sólo propagamos el header.
  if (pathname.startsWith("/api/")) {
    return NextResponse.next({ request: { headers } });
  }

  // Gate coarse: rutas protegidas requieren cookie de access.
  const isProtected = PROTECTED.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (isProtected && !req.cookies.get("access_token")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Reescribe a la sección del tenant manteniendo la URL del browser limpia.
  return NextResponse.rewrite(new URL(`/s/${slug}${pathname}${search}`, req.url), {
    request: { headers },
  });
}

export const config = {
  // Excluye assets estáticos del middleware.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
