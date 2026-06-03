/**
 * Schema.org JSON-LD para las superficies públicas. SÓLO recibe campos ya
 * serializados (públicos): nunca un campo privado entra acá. Compartido por la
 * página de org y la de profesional para no divergir.
 */

function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

/** Organization/MedicalBusiness — para la página de org (modo roster). */
export function OrgJsonLd({
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
  return <JsonLd data={data} />;
}

/** Person/Physician — para la página de profesional (y el modo perfil-único). */
export function ProfessionalJsonLd({
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
  return <JsonLd data={data} />;
}
