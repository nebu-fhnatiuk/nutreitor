import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProfessionalView } from "@/components/public/professional-view";
import { fetchPublicOrg, fetchPublicProfessional } from "@/lib/server/public-api";

// ISR: estática con revalidación (TTL de red de seguridad; el resto on-demand en PR2).
export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const org = await fetchPublicOrg(slug);
  if (!org) return { title: "Nutreitor" };
  const title = org.displayName ?? org.name;
  const description = org.publicDescription ?? org.publicHeadline ?? undefined;
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export default async function OrgPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await fetchPublicOrg(slug);
  if (!org) notFound();

  const displayName = org.displayName ?? org.name;

  // Modo perfil-único: si hay un solo profesional listado, mostramos su perfil.
  if (org.singleProfessional && org.roster[0]) {
    const pro = await fetchPublicProfessional(slug, org.roster[0].profileSlug);
    if (pro) {
      return (
        <main className="min-h-screen bg-stone-50 text-stone-900">
          <OrgJsonLd name={displayName} description={org.publicDescription} />
          <ProfessionalView professional={pro} orgName={displayName} />
        </main>
      );
    }
  }

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <OrgJsonLd name={displayName} description={org.publicDescription} />

      <section className="mx-auto max-w-4xl px-6 pt-16 pb-10 text-center sm:pt-24">
        {org.brandLogoUrl ? (
          <img
            src={org.brandLogoUrl}
            alt={displayName}
            className="mx-auto mb-6 h-16 w-16 rounded-2xl object-cover"
          />
        ) : (
          <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-brand text-2xl font-bold text-brand-fg">
            {displayName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <h1 className="font-serif text-4xl leading-tight text-stone-900 sm:text-6xl">
          {displayName}
        </h1>
        {org.publicHeadline && (
          <p className="mx-auto mt-4 max-w-2xl text-lg text-brand">
            {org.publicHeadline}
          </p>
        )}
        {org.publicDescription && (
          <p className="mx-auto mt-4 max-w-2xl text-stone-600">
            {org.publicDescription}
          </p>
        )}
      </section>

      <section className="mx-auto max-w-4xl px-6 pb-24">
        {org.roster.length === 0 ? (
          <p className="text-center text-stone-500">
            Todavía no hay profesionales publicados.
          </p>
        ) : (
          <>
            <h2 className="mb-6 text-center text-xs font-semibold uppercase tracking-widest text-stone-400">
              Profesionales
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2">
              {org.roster.map((m) => (
                <li key={m.profileSlug}>
                  <Link
                    href={`/${m.profileSlug}`}
                    className="group flex items-center gap-4 rounded-2xl border border-stone-200 bg-white p-5 transition hover:border-brand/50 hover:shadow-sm"
                  >
                    {m.photoUrl ? (
                      <img
                        src={m.photoUrl}
                        alt={m.fullName}
                        className="h-14 w-14 rounded-full object-cover"
                      />
                    ) : (
                      <span className="grid h-14 w-14 place-items-center rounded-full bg-brand/15 text-lg font-semibold text-brand">
                        {m.fullName.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0">
                      <div className="font-medium text-stone-900">{m.fullName}</div>
                      {m.headline && (
                        <div className="truncate text-sm text-stone-600">
                          {m.headline}
                        </div>
                      )}
                      {m.specialty && (
                        <div className="mt-1 inline-block rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">
                          {m.specialty}
                        </div>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <footer className="border-t border-stone-200 py-8 text-center text-sm text-stone-400">
        {displayName} · hecho con Nutreitor
      </footer>
    </main>
  );
}

/** JSON-LD Organization/MedicalBusiness (sólo campos públicos). */
function OrgJsonLd({
  name,
  description,
}: {
  name: string;
  description: string | null;
}) {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "MedicalBusiness",
    name,
  };
  if (description) data.description = description;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
