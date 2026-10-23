import type { Metadata } from "next";

import { ConfirmSignup } from "@/components/onboarding/confirm-signup";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = {
  title: "Confirmá tu alta — Nutreitor",
  robots: { index: false },
};

export default async function ConfirmSignupPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  return (
    <AuthShell>
      <ConfirmSignup token={token} />
    </AuthShell>
  );
}
