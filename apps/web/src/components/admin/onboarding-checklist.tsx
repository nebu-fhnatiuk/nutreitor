"use client";

import { CheckCircle2, Circle, Clock } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { LicenseStatus, OnboardingStatus } from "@nutreitor/shared";

import { Card, cn } from "@/components/ui";
import { api } from "@/lib/api";

const LICENSE_TEXT: Record<LicenseStatus, string> = {
  missing: "Cargá tu matrícula (si atendés)",
  declared: "Matrícula cargada: la estamos revisando",
  reviewed: "Matrícula revisada",
  rejected: "Matrícula rechazada: corregila",
};

/**
 * Primeros pasos de la org (ADR 0025): estado del alta + checklist derivada de los
 * datos. Desaparece cuando la org está activa y todo está hecho.
 */
export function OnboardingChecklist() {
  const [s, setS] = useState<OnboardingStatus | null>(null);

  useEffect(() => {
    api<OnboardingStatus>("organizations/current/onboarding").then(setS).catch(() => setS(null));
  }, []);

  if (!s) return null;

  const steps: { done: boolean; pending?: boolean; label: string; href: string }[] = [
    { done: s.steps.profile, label: "Completá tu perfil público (titular o bio)", href: "/pro/profile" },
    {
      done: s.steps.license === "reviewed",
      pending: s.steps.license === "declared",
      label: LICENSE_TEXT[s.steps.license],
      href: "/pro/profile",
    },
    { done: s.steps.branding, label: "Poné tu logo y tus colores", href: "/admin/settings" },
    { done: s.steps.availability, label: "Cargá tus horarios de atención", href: "/pro/agenda" },
    ...(s.kind === "team"
      ? [{ done: s.steps.team, label: "Invitá a tu equipo", href: "/admin/members" }]
      : []),
  ];
  const allDone = steps.every((x) => x.done);
  if (s.status === "active" && allDone) return null;

  return (
    <Card className="border-brand/30">
      {s.status === "pending_review" && (
        <div className="mb-4 flex items-start gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            <span className="font-medium">Estamos revisando tu alta.</span> Mientras tanto podés
            configurar todo; tu vidriera se publica y vas a poder invitar pacientes cuando la aprobemos.
            Te avisamos por mail.
          </p>
        </div>
      )}
      <h2 className="font-serif text-lg font-medium">Primeros pasos</h2>
      <ul className="mt-3 space-y-2">
        {steps.map((step) => (
          <li key={step.label}>
            <Link
              href={step.href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition hover:bg-stone-50",
                step.done ? "text-stone-500" : "text-stone-800",
              )}
            >
              {step.done ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-label="Hecho" />
              ) : step.pending ? (
                <Clock className="h-4 w-4 shrink-0 text-amber-600" aria-label="En revisión" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-stone-300" aria-label="Pendiente" />
              )}
              <span className={cn(step.done && "line-through decoration-stone-300")}>{step.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
