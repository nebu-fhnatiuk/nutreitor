import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { serverEnv } from "@/lib/server/env";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Nutreitor", robots: { index: false } };

/**
 * La landing de producto vive en `apps/site` (Astro, S3 + CloudFront, ADR 0028). En
 * prod CloudFront sirve "/" desde S3, así que esta ruta no se alcanza. En dev
 * (`SITE_URL`) redirige a la landing; sin `SITE_URL`, un respaldo mínimo.
 */
export default function RootPage() {
  const site = serverEnv().SITE_URL;
  if (site) redirect(site);
  return (
    <main className="grid min-h-screen place-items-center px-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold">Nutreitor</h1>
        <p className="mt-2">
          <a className="underline" href="/registro">
            Creá tu espacio
          </a>
        </p>
      </div>
    </main>
  );
}
