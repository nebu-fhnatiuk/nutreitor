import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProfessionalView } from "@/components/public/professional-view";
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
    </main>
  );
}

/** JSON-LD Person/Physician (sólo campos públicos). */
function ProfessionalJsonLd({
  name,
  headline,
  bio,
  photoUrl,
  affiliation,
}: {
  name: string;
  headline: string | null;
  bio: string | null;
  photoUrl: string | null;
  affiliation: string;
}) {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Physician",
    name,
  };
  if (headline) data.jobTitle = headline;
  if (bio) data.description = bio;
  if (photoUrl) data.image = photoUrl;
  if (affiliation) data.worksFor = { "@type": "MedicalBusiness", name: affiliation };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
