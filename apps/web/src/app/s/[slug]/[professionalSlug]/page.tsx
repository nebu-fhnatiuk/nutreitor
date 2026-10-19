import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProfessionalJsonLd } from "@/components/public/json-ld";
import { ProfessionalView } from "@/components/public/professional-view";
import { PublicBooking } from "@/components/public/public-booking";
import { PublicContact } from "@/components/public/public-contact";
import { fetchPublicOrg, fetchPublicProfessional } from "@/lib/server/public-api";

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; professionalSlug: string }>;
}): Promise<Metadata> {
  const { slug, professionalSlug } = await params;
  const [org, pro] = await Promise.all([
    fetchPublicOrg(slug),
    fetchPublicProfessional(slug, professionalSlug),
  ]);
  if (!pro) return { title: "Nutreitor" };
  const orgName = org?.displayName ?? org?.name ?? "";
  const title = `${pro.fullName}${orgName ? ` — ${orgName}` : ""}`;
  const description = pro.headline ?? pro.bio ?? undefined;
  return {
    title,
    description,
    openGraph: { title, description, type: "profile" },
    twitter: { card: "summary", title, description },
  };
}

export default async function ProfessionalPublicPage({
  params,
}: {
  params: Promise<{ slug: string; professionalSlug: string }>;
}) {
  const { slug, professionalSlug } = await params;
  const [org, pro] = await Promise.all([
    fetchPublicOrg(slug),
    fetchPublicProfessional(slug, professionalSlug),
  ]);
  if (!pro) notFound();
  const orgName = org?.displayName ?? org?.name ?? "";

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <ProfessionalJsonLd
        name={pro.fullName}
        headline={pro.headline}
        bio={pro.bio}
        photoUrl={pro.photoUrl}
        affiliation={orgName}
      />
      <ProfessionalView professional={pro} orgName={orgName} backHref="/" />
      <div id="reservar" className="mx-auto max-w-3xl scroll-mt-8 px-6 pb-16">
        <PublicBooking slug={slug} profileSlug={professionalSlug} professionalName={pro.fullName} />
      </div>
      <div id="consultar" className="mx-auto max-w-3xl scroll-mt-8 px-6 pb-16">
        <PublicContact slug={slug} profileSlug={professionalSlug} recipientName={pro.fullName} />
      </div>
    </main>
  );
}
