"use client";

import { ArrowLeft, FileText, Printer } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { monthLabel, type PatientReportDto } from "@nutreitor/shared";

import { ReportStory } from "@/components/reports/report-story";
import { ReportView } from "@/components/reports/report-view";
import { Alert, Button, Card, EmptyState, Loading, SectionHeading } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

/** Inicio del portal: los reportes mensuales publicados (si hay). */
export function PortalReportsCard() {
  const [reports, setReports] = useState<PatientReportDto[] | null>(null);
  useEffect(() => {
    api<PatientReportDto[]>("portal/me/reports")
      .then(setReports)
      .catch(() => setReports([]));
  }, []);
  if (!reports?.length) return null;
  return (
    <Card>
      <SectionHeading className="mb-3">Tus reportes</SectionHeading>
      <ul className="space-y-1">
        {reports.slice(0, 3).map((r) => (
          <li key={r.id}>
            <Link
              href={`/app/reportes/${r.id}`}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-stone-800 transition hover:bg-stone-50"
            >
              <FileText className="h-4 w-4 text-brand" aria-hidden />
              <span className="first-letter:uppercase">{monthLabel(r.month)}</span>
              {r.data.adherence.pct != null && (
                <span className="ml-auto text-xs text-stone-500">{r.data.adherence.pct} % del plan</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
      {reports.length > 3 && (
        <Link href="/app/reportes" className="mt-2 inline-block text-sm text-brand hover:underline">
          Ver todos
        </Link>
      )}
    </Card>
  );
}

export function PortalReportsList() {
  const [reports, setReports] = useState<PatientReportDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<PatientReportDto[]>("portal/me/reports")
      .then(setReports)
      .catch((e) => setError(errorMessage(e)));
  }, []);
  if (error) return <Alert>{error}</Alert>;
  if (!reports) return <Loading />;
  if (!reports.length) return <EmptyState>Cuando tu profesional publique tu reporte del mes, lo vas a ver acá.</EmptyState>;
  return (
    <ul className="divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-surface shadow-sm">
      {reports.map((r) => (
        <li key={r.id}>
          <Link href={`/app/reportes/${r.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-stone-50">
            <FileText className="h-4 w-4 text-brand" aria-hidden />
            <span className="font-medium text-stone-900 first-letter:uppercase">{monthLabel(r.month)}</span>
            <span className="ml-auto text-xs text-stone-500">{r.authorName}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function PortalReport({ id, athleteName, club }: { id: string; athleteName: string; club: string }) {
  const [report, setReport] = useState<PatientReportDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<PatientReportDto>(`portal/me/reports/${id}`)
      .then(setReport)
      .catch((e) => setError(errorMessage(e)));
  }, [id]);
  if (error) return <Alert>{error}</Alert>;
  if (!report) return <Loading />;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/app/reportes" className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Reportes
        </Link>
        <div className="flex gap-2">
          <ReportStory report={report} athleteName={athleteName} club={club} />
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="h-4 w-4" aria-hidden /> Imprimir
          </Button>
        </div>
      </div>
      <ReportView report={report} forPatient />
    </div>
  );
}
