"use client";

import { Printer, RefreshCw, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { monthLabel, type PatientReportDto } from "@nutreitor/shared";

import { Alert, Button, cn, EmptyState, Loading, useFeedback } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { ReportView } from "./report-view";

/** Últimos meses que se pueden reportar (el actual incluido). */
function recentMonths(n = 6): string[] {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

/**
 * Pestaña "Reportes" de la ficha (Fase 4.4): armar el reporte del mes, comentarlo y
 * publicarlo al portal del paciente. Publicado queda fijo.
 */
export function ReportsPanel({ patientId, canWrite }: { patientId: string; canWrite: boolean }) {
  const base = `patients/${patientId}/reports`;
  const [reports, setReports] = useState<PatientReportDto[] | null>(null);
  const [current, setCurrent] = useState<PatientReportDto | null>(null);
  const [month, setMonth] = useState(recentMonths()[1]!); // por defecto, el mes anterior
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm, toast } = useFeedback();

  const load = useCallback(async () => {
    try {
      setReports(await api<PatientReportDto[]>(base));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [base]);
  useEffect(() => {
    void load();
  }, [load]);

  const show = (r: PatientReportDto) => {
    setCurrent(r);
    setComment(r.comment ?? "");
  };

  async function run(fn: () => Promise<PatientReportDto>, done?: string) {
    setBusy(true);
    setError(null);
    try {
      show(await fn());
      void load();
      if (done) toast(done);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const post = (path: string, body?: unknown) =>
    api<PatientReportDto>(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  const saveComment = () =>
    api<PatientReportDto>(`${base}/${current!.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: comment.trim() || null }),
    });

  if (!reports && !error) return <Loading />;
  const isDraft = current?.status === "draft";

  return (
    <div className="space-y-4">
      {error && <Alert>{error}</Alert>}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {canWrite && (
          <>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              aria-label="Mes del reporte"
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm capitalize"
            >
              {recentMonths().map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
            <Button disabled={busy} onClick={() => void run(() => post(base, { month }))}>
              Armar reporte
            </Button>
          </>
        )}
        {reports?.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => show(r)}
            aria-pressed={current?.id === r.id}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm capitalize transition",
              current?.id === r.id ? "border-brand bg-brand/10 text-brand" : "border-stone-200 text-stone-600 hover:border-brand/40",
            )}
          >
            {monthLabel(r.month)}
            <span className={cn("ml-1.5 text-xs normal-case", r.status === "published" ? "text-emerald-700" : "text-amber-700")}>
              {r.status === "published" ? "publicado" : "borrador"}
            </span>
          </button>
        ))}
      </div>

      {!current ? (
        <EmptyState>
          {reports?.length
            ? "Elegí un reporte para verlo."
            : "Todavía no hay reportes. Se arman solos con los datos del mes: mediciones, adherencia, cómo se sintió y turnos."}
        </EmptyState>
      ) : (
        <>
          {isDraft && canWrite && (
            <div className="space-y-2 rounded-2xl border border-dashed border-stone-300 p-4 print:hidden">
              <label className="block text-sm font-medium text-stone-800" htmlFor="report-comment">
                Tu comentario para el paciente
              </label>
              <textarea
                id="report-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                maxLength={4000}
                placeholder="Qué salió bien, qué ajustar el mes que viene…"
                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" disabled={busy} onClick={() => void run(saveComment, "Comentario guardado")}>
                  Guardar comentario
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void run(() => post(`${base}/${current.id}/refresh`), "Datos actualizados")}
                >
                  <RefreshCw className="h-4 w-4" aria-hidden /> Actualizar datos
                </Button>
                <Button
                  disabled={busy}
                  className="ml-auto"
                  onClick={async () => {
                    const ok = await confirm({
                      title: `¿Publicar el reporte de ${monthLabel(current.month)}?`,
                      body: "El paciente lo va a ver en su portal y le llega un aviso. Publicado ya no se puede editar.",
                      confirmLabel: "Publicar",
                    });
                    if (!ok) return;
                    await run(async () => {
                      await saveComment();
                      return post(`${base}/${current.id}/publish`);
                    }, "Reporte publicado");
                  }}
                >
                  <Send className="h-4 w-4" aria-hidden /> Publicar al paciente
                </Button>
              </div>
            </div>
          )}
          <div className="flex justify-end print:hidden">
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" aria-hidden /> Imprimir
            </Button>
          </div>
          <ReportView report={isDraft ? { ...current, comment: comment.trim() || null } : current} />
        </>
      )}
    </div>
  );
}
