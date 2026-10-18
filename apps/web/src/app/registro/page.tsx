import type { Metadata } from "next";
import { headers } from "next/headers";

import { RootFrame } from "@/components/onboarding/root-frame";
import { SignupForm } from "@/components/onboarding/signup-form";

export const metadata: Metadata = {
  title: "Crear tu espacio — Nutreitor",
  description: "Registrá tu consultorio o tu equipo de nutrición en Nutreitor.",
};

/** Alta autoservicio (dominio raíz). El host se muestra como sufijo de la dirección. */
export default async function SignupPage() {
  const host = (await headers()).get("host") ?? "nutreitor.com";
  return (
    <RootFrame>
      <SignupForm rootHost={host} />
    </RootFrame>
  );
}
