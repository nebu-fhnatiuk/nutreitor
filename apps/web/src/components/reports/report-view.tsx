import { fmtNumber } from "./format";
import { monthLabel, type PatientReportDto, type ReportMeasureDto } from "@nutreitor/shared";

import { Card, cn, SectionHeading } from "@/components/ui";

/**
 * Reporte mensual (Fase 4.4), igual para el profesional y el paciente: los números
 * del mes y el comentario del profesional. `forPatient` cambia el trato ("tu") y
 * oculta lo que es sólo de gestión. Pensado para imprimir.
 */
export function ReportView({ report, forPatient = false }: { report: PatientReportDto; forPatient?: boolean }) {
  const d = report.data;
  const you = (yes: string, no: string) => (forPatient ? yes : no);
  return (
    <Card className="space-y-6 print:border-0 print:p-0 print:shadow-none">
      <header>
        <p className="text-xs uppercase tracking-widest text-stone-500">Reporte mensual</p>
        <h2 className="mt-1 font-serif text-2xl font-semibold text-stone-900 first-letter:uppercase">
          {monthLabel(report.month)}
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          {report.publishedAt
            ? `Publicado por ${report.authorName} el ${new Date(report.publishedAt).toLocaleDateString("es-AR")}`
            : `Borrador · ${report.authorName}`}
        </p>
      </header>

      {report.comment && (
        <section className="rounded-xl border border-brand/20 bg-brand/5 p-4">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-brand">
            {you("Lo que te dice tu profesional", "Comentario del profesional")}
          </p>
          <p className="whitespace-pre-wrap text-stone-800">{report.comment}</p>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <section>
          <SectionHeading className="mb-2">{you("Tu evolución", "Evolución")}</SectionHeading>
          {d.measurements.count === 0 ? (
            <p className="text-sm text-stone-500">Sin mediciones este mes.</p>
          ) : (
            <dl className="space-y-1.5 text-sm">
              <Measure label="Peso" unit="kg" m={d.measurements.weightKg} lowerIsGood />
              <Measure label="% grasa" unit="%" m={d.measurements.bodyFatPct} lowerIsGood />
              <Measure label="Cintura" unit="cm" m={d.measurements.waistCm} lowerIsGood />
              <p className="pt-1 text-xs text-stone-500">{d.measurements.count} mediciones en el mes</p>
            </dl>
          )}
        </section>

        <section>
          <SectionHeading className="mb-2">{you("Cómo te fue con el plan", "Adherencia al plan")}</SectionHeading>
          {d.adherence.logs === 0 ? (
            <p className="text-sm text-stone-500">{you("No registraste comidas este mes.", "Sin registros este mes.")}</p>
          ) : (
            <>
              <p className="text-3xl font-semibold tabular-nums text-stone-900">{d.adherence.pct} %</p>
              <p className="mb-2 text-xs text-stone-500">
                {d.adherence.daysLogged} {d.adherence.daysLogged === 1 ? "día" : "días"} con registro ·{" "}
                {d.adherence.logs} {d.adherence.logs === 1 ? "comida" : "comidas"} (en parte = ½)
              </p>
              <ul className="space-y-1.5">
                {d.adherence.byMeal.map((b) => (
                  <li key={b.meal} className="text-sm">
                    <div className="flex justify-between">
                      <span className="text-stone-700">{b.meal}</span>
                      <span className="tabular-nums text-stone-600">{b.pct} %</span>
                    </div>
                    <div className="mt-0.5 h-1.5 rounded-full bg-stone-100">
                      <div className="h-1.5 rounded-full bg-brand print:bg-stone-700" style={{ width: `${b.pct}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section>
          <SectionHeading className="mb-2">{you("Cómo te sentiste", "Cómo se sintió")}</SectionHeading>
          {d.checkins.count === 0 ? (
            <p className="text-sm text-stone-500">Sin registros de sensaciones.</p>
          ) : (
            <dl className="grid grid-cols-3 gap-2 text-center text-sm">
              {(
                [
                  ["Hambre", d.checkins.hunger],
                  ["Energía", d.checkins.energy],
                  ["Ánimo", d.checkins.mood],
                ] as const
              ).map(([label, v]) => (
                <div key={label} className="rounded-lg bg-stone-50 py-2">
                  <dt className="text-xs text-stone-500">{label}</dt>
                  <dd className="text-lg font-semibold tabular-nums">{v == null ? "—" : fmtNumber(v)}</dd>
                </div>
              ))}
              <p className="col-span-3 text-xs text-stone-500">
                Promedio de 1 a 5 · {d.checkins.count} {d.checkins.count === 1 ? "día" : "días"}
              </p>
            </dl>
          )}
        </section>

        <section>
          <SectionHeading className="mb-2">Consultas y plan</SectionHeading>
          <dl className="space-y-1 text-sm text-stone-700">
            <div className="flex justify-between">
              <dt>Turnos realizados</dt>
              <dd className="tabular-nums">{d.appointments.completed}</dd>
            </div>
            {!forPatient && (
              <div className="flex justify-between">
                <dt>Turnos cancelados</dt>
                <dd className="tabular-nums">{d.appointments.cancelled}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt>Plan vigente</dt>
              <dd className="truncate text-right">
                {d.plan.title ? `${d.plan.title} (v${d.plan.version})` : "—"}
              </dd>
            </div>
            {d.plan.versionsInMonth > 0 && (
              <p className="text-xs text-stone-500">
                {d.plan.versionsInMonth} {d.plan.versionsInMonth === 1 ? "ajuste" : "ajustes"} del plan en el mes
              </p>
            )}
          </dl>
        </section>
      </div>
    </Card>
  );
}

function Measure({ label, unit, m, lowerIsGood }: { label: string; unit: string; m: ReportMeasureDto; lowerIsGood?: boolean }) {
  if (m.end == null) return null;
  const good = m.delta != null && m.delta !== 0 && (lowerIsGood ? m.delta < 0 : m.delta > 0);
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-stone-600">{label}</dt>
      <dd className="tabular-nums text-stone-900">
        {m.start != null && m.start !== m.end && (
          <span className="text-stone-500">{fmtNumber(m.start)} → </span>
        )}
        {fmtNumber(m.end)} {unit}
        {m.delta != null && m.delta !== 0 && (
          <span className={cn("ml-2 text-xs", good ? "text-emerald-700" : "text-stone-500")}>
            {m.delta > 0 ? "+" : "−"}
            {fmtNumber(Math.abs(m.delta))}
          </span>
        )}
      </dd>
    </div>
  );
}
