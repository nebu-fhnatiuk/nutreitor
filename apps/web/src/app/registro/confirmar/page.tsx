import type { Metadata } from "next";

import { ConfirmSignup } from "@/components/onboarding/confirm-signup";
import { RootFrame } from "@/components/onboarding/root-frame";

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
    <RootFrame>
      <ConfirmSignup token={token} />
    </RootFrame>
  );
}
