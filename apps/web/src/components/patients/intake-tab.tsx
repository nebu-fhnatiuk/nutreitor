"use client";

import { useState } from "react";
import type { FfqSex } from "@nutreitor/shared";

import { cn } from "@/components/ui";

import { FoodFrequencyPanel } from "./food-frequency-panel";
import { IntakePanel } from "./intake-panel";

type View = "recall" | "frequency";

/** Pestaña "Ingesta": lo que comió un día (ADR 0033) y su dieta habitual (ADR 0034). */
export function IntakeTab({ patientId, sex, canWrite }: { patientId: string; sex: FfqSex | null; canWrite: boolean }) {
  const [view, setView] = useState<View>("recall");
  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Instrumento" className="inline-flex rounded-lg border border-stone-200 bg-white p-0.5 text-sm">
        {(
          [
            ["recall", "Recordatorio de 24 h"],
            ["frequency", "Frecuencia de consumo"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={cn("min-h-10 rounded-md px-3 transition", view === id ? "bg-brand text-brand-fg" : "text-stone-600 hover:bg-stone-100")}
          >
            {label}
          </button>
        ))}
      </div>
      {view === "recall" ? (
        <IntakePanel patientId={patientId} canWrite={canWrite} />
      ) : (
        <FoodFrequencyPanel patientId={patientId} sex={sex} canWrite={canWrite} />
      )}
    </div>
  );
}
