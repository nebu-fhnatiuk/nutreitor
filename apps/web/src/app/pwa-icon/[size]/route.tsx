import { ImageResponse } from "next/og";
import { headers } from "next/headers";

import { appName, DEFAULT_BRAND_HEX, PWA_ICON_SIZES } from "@/lib/pwa";
import { fetchTenant } from "@/lib/server/api";

/**
 * Ícono de la PWA por tenant: inicial del consultorio sobre su color de marca. La
 * inicial ocupa el centro (zona segura de los íconos "maskable").
 */
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!(PWA_ICON_SIZES as readonly number[]).includes(size)) return new Response("Not found", { status: 404 });
  const slug = (await headers()).get("x-tenant-slug");
  const org = slug ? await fetchTenant(slug) : null;
  const letter = (org ? appName(org) : "Nutreitor").trim().charAt(0).toUpperCase() || "N";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: org?.brandPrimaryColor ?? DEFAULT_BRAND_HEX,
          color: "white",
          fontSize: size * 0.46,
          fontWeight: 600,
        }}
      >
        {letter}
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
