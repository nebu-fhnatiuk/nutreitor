"use client";

import { useEffect, useState } from "react";
import {
  finalValue,
  type AnthropometrySessionDto,
  type EnergyRequirementDto,
  type SweatTestDto,
} from "@nutreitor/shared";

import { api } from "@/lib/api";
import { Stat, cn, type Zone } from "@/components/ui";
import { fmt, val } from "./anthro-format";
import type { Moment } from "./moments";

type Data = {
  anthro: AnthropometrySessionDto[];
  sweat: SweatTestDto[];
  energy: EnergyRequirementDto[];
};

const byDateDesc = <T,>(list: T[], key: (x: T) => string) =>
  [...list].sort((a, b) => key(b).localeCompare(key(a)));

/** "19/10": la fecha corta de la última medición, bajo la cifra. */
function shortDate(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

/**
 * Marcador de la ficha: las últimas cifras del deportista, grandes y con zona
 * (tema Estadio). Cada tarjeta lleva al momento donde se cargó el dato. Si una
 * lista falla o está vacía, esa cifra no se muestra (no bloquea la ficha).
 */
export function AthleteScoreboard({
  patientId,
  onGo,
}: {
  patientId: string;
  onGo: (moment: Moment, section: string) => void;
}) {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    const safe = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);
    void Promise.all([
      safe(api<AnthropometrySessionDto[]>(`patients/${patientId}/anthropometry`)),
      safe(api<SweatTestDto[]>(`patients/${patientId}/sweat-tests`)),
      safe(api<EnergyRequirementDto[]>(`patients/${patientId}/energy`)),
    ]).then(([anthro, sweat, energy]) => setData({ anthro, sweat, energy }));
  }, [patientId]);

  if (!data) return <div className="h-[104px] animate-pulse rounded-2xl bg-stone-100" aria-hidden />;

  const [last, prev] = byDateDesc(data.anthro, (s) => s.measuredAt);
  const sweat = byDateDesc(data.sweat, (t) => t.measuredOn)[0];
  const energy = byDateDesc(data.energy, (e) => e.createdAt)[0];

  const mass = last ? finalValue(last.takes.bodyMass) : null;
  const sum6 = last ? val(last.results.sum6) : null;
  const prevSum6 = prev ? val(prev.results.sum6) : null;
  const sum6Delta = sum6 !== null && prevSum6 !== null ? Math.round((sum6 - prevSum6) * 10) / 10 : null;
  // Mismo criterio que el requerimiento: Durnin-Womersley, si no Yuhasz.
  const dw = last ? val(last.results.fat.durninWomersley) : null;
  const fat = dw ?? (last ? val(last.results.fat.yuhasz) : null);
  const lossZone: Zone | undefined = sweat ? (sweat.results.dehydrationPct > 2 ? "warn" : "ok") : undefined;

  const cards: { key: string; go: [Moment, string]; node: React.ReactNode }[] = [];
  if (mass !== null && last)
    cards.push({
      key: "mass",
      go: ["evaluar", "antropometria"],
      node: <Stat label="Masa corporal" value={fmt(mass)} unit="kg" hint={`Antropometría ${shortDate(last.measuredAt)}`} />,
    });
  if (sum6 !== null)
    cards.push({
      key: "sum6",
      go: ["evaluar", "antropometria"],
      node: (
        <Stat
          label="Σ6 pliegues"
          value={fmt(sum6)}
          unit="mm"
          hint={
            sum6Delta === null ? (
              "Primera medición"
            ) : sum6Delta === 0 ? (
              "Igual que la anterior"
            ) : (
              <span className={sum6Delta < 0 ? "text-zone-ok" : "text-zone-warn"}>
                {sum6Delta < 0 ? "▼" : "▲"} {fmt(Math.abs(sum6Delta))} mm desde la anterior
              </span>
            )
          }
        />
      ),
    });
  if (fat !== null)
    cards.push({
      key: "fat",
      go: ["evaluar", "antropometria"],
      node: <Stat label="% graso" value={fmt(fat)} unit="%" hint={dw !== null ? "Durnin-Womersley + Siri" : "Yuhasz"} />,
    });
  if (sweat)
    cards.push({
      key: "sweat",
      go: ["evaluar", "hidratacion"],
      node: (
        <Stat
          label="Sudoración"
          value={fmt(sweat.results.sweatRateLh, 2)}
          unit="L/h"
          hint={
            <span className={lossZone === "warn" ? "text-zone-warn" : undefined}>
              Perdió {fmt(sweat.results.dehydrationPct)} % · {shortDate(sweat.measuredOn)}
            </span>
          }
        />
      ),
    });
  if (energy?.results.weekAvgKcal)
    cards.push({
      key: "energy",
      go: ["prescribir", "requerimiento"],
      node: (
        <Stat
          label="Requerimiento"
          value={Math.round(energy.results.weekAvgKcal).toLocaleString("es-AR")}
          unit="kcal/día"
          hint="Promedio de la semana tipo"
        />
      ),
    });

  if (cards.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-stone-300 px-5 py-4 text-sm text-stone-500">
        Todavía no hay mediciones. Empezá por <strong className="text-stone-700">Evaluar</strong>: antropometría,
        ingesta o una prueba de sudoración.
      </p>
    );
  }

  return (
    <div
      className={cn(
        "grid overflow-hidden rounded-2xl border border-stone-200 bg-surface",
        "grid-cols-2 sm:grid-cols-3",
        cards.length >= 5 ? "lg:grid-cols-5" : cards.length === 4 ? "lg:grid-cols-4" : "",
      )}
    >
      {cards.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => onGo(...c.go)}
          className="-ml-px -mt-px border-l border-t border-stone-200 px-5 py-4 text-left transition hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40"
        >
          {c.node}
        </button>
      ))}
    </div>
  );
}
