"use client";

import { Download, FileUp } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  IMPORT_COLUMN_LABEL,
  IMPORT_MAX_ROWS,
  IMPORT_TEMPLATE,
  importColumns,
  type ImportPreviewDto,
  type ImportResultDto,
} from "@nutreitor/shared";

import { Alert, Button, Card, Loading, SectionHeading, Toggle, ZoneMark, buttonClass, cn } from "@/components/ui";
import { ApiError, api, errorMessage } from "@/lib/api";

const SEX_LABEL = { female: "F", male: "M", other: "X", unspecified: "—" } as const;

/**
 * Excel en Windows guarda el CSV en Windows-1252, no en UTF-8: si el archivo no es
 * UTF-8 válido se relee así, para que "Pérez" no llegue como "P�rez".
 */
async function readCsv(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

function downloadTemplate() {
  // BOM: Excel abre el UTF-8 con las tildes bien.
  const blob = new Blob(["﻿" + IMPORT_TEMPLATE], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: "plantilla-deportistas.csv" });
  a.click();
  URL.revokeObjectURL(url);
}

const COLUMN_HINT: Record<(typeof importColumns)[number], string> = {
  fullName: "obligatoria",
  email: "para invitar al portal",
  documentId: "DNI, con o sin puntos",
  birthDate: "DD/MM/AAAA",
  sex: "F, M o X",
  phone: "",
  groups: "un grupo que ya exista; varios con |",
  professionalEmail: "email del profesional a cargo",
};

/**
 * Alta masiva desde un CSV (KAN-42/43/44): subir, ver la vista previa con los
 * errores por fila y confirmar. Si una fila tiene error no se importa ninguna.
 */
export function PatientImport({ backHref, orgActive }: { backHref: string; orgActive: boolean }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [invite, setInvite] = useState(orgActive);
  const [preview, setPreview] = useState<ImportPreviewDto | null>(null);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResultDto | null>(null);
  /** Para revalidar el mismo archivo (422: algo cambió desde la vista previa). */
  const [rev, setRev] = useState(0);

  useEffect(() => {
    if (csv === null) return;
    let alive = true;
    setBusy(true);
    setErr(null);
    api<ImportPreviewDto>("patients/import/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv, invite }),
    })
      .then((p) => {
        if (!alive) return;
        setPreview(p);
        setOnlyErrors(p.errorCount > 0);
      })
      .catch((e) => alive && setErr(errorMessage(e)))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [csv, invite, rev]);

  async function pick(file: File | undefined) {
    if (!file) return;
    setResult(null);
    setPreview(null);
    setFileName(file.name);
    setCsv(await readCsv(file));
  }

  async function confirm() {
    if (!csv) return;
    setBusy(true);
    setErr(null);
    try {
      setResult(
        await api<ImportResultDto>("patients/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ csv, invite }),
        }),
      );
      setPreview(null);
      setCsv(null);
      setFileName(null);
    } catch (e) {
      // 422: algo cambió desde la vista previa (otro alta, un grupo borrado): se revalida.
      if (e instanceof ApiError && e.status === 422) setRev((r) => r + 1);
      setErr(e instanceof ApiError && e.status === 422 ? "Algo cambió desde la vista previa. Revisá los errores." : errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <Card className="space-y-4">
        <div className="flex items-center gap-2">
          <ZoneMark zone="ok" />
          <SectionHeading>Listo</SectionHeading>
        </div>
        <p className="font-display text-4xl font-bold tabular-nums">
          {result.created} <span className="text-xl font-semibold text-stone-500">deportistas importados</span>
        </p>
        <ul className="space-y-1 text-sm text-stone-600">
          {result.grouped > 0 && <li>{result.grouped} quedaron en su grupo.</li>}
          {result.assigned > 0 && <li>{result.assigned} quedaron asignados a su profesional.</li>}
          {result.invited > 0 && (
            <li>
              {result.invited} invitaciones al portal en camino: salen de a poco en los próximos minutos, una sola vez a cada uno.
            </li>
          )}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Link href={backHref} className={buttonClass("primary")}>
            Ver deportistas
          </Link>
          <Button variant="ghost" onClick={() => setResult(null)}>
            Importar otro archivo
          </Button>
        </div>
      </Card>
    );
  }

  const rows = preview ? (onlyErrors ? preview.rows.filter((r) => r.errors.length) : preview.rows) : [];

  return (
    <div className="space-y-6">
      <Card className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <SectionHeading>1 · El archivo</SectionHeading>
            <p className="mt-1 max-w-2xl text-sm text-stone-600">
              Un CSV con una fila por deportista (desde Excel: Guardar como → CSV). Hasta {IMPORT_MAX_ROWS} filas por archivo. Los
              datos clínicos se cargan después, en la ficha de cada uno.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={downloadTemplate}>
            <Download className="h-4 w-4" aria-hidden />
            Bajar plantilla
          </Button>
        </div>

        <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          {importColumns.map((c) => (
            <div key={c} className="flex gap-2">
              <dt className="font-display font-semibold uppercase tracking-wider text-stone-700">{IMPORT_COLUMN_LABEL[c]}</dt>
              {COLUMN_HINT[c] && <dd className="text-stone-500">{COLUMN_HINT[c]}</dd>}
            </div>
          ))}
        </dl>

        <label
          className={cn(
            "flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-300 px-4 py-6 text-center transition",
            "hover:border-brand focus-within:border-brand focus-within:ring-2 focus-within:ring-brand",
          )}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void pick(e.dataTransfer.files[0]);
          }}
        >
          <FileUp className="h-6 w-6 text-stone-500" aria-hidden />
          <span className="font-medium">{fileName ?? "Elegí o arrastrá el archivo CSV"}</span>
          {fileName && <span className="text-sm text-stone-500">Elegir otro</span>}
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              void pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-stone-200 px-4 py-3">
          <div>
            <p className="font-medium">Invitar al portal a quienes tengan email</p>
            <p className="text-sm text-stone-500">
              {orgActive
                ? "Les llega un mail para crear su cuenta. Salen de a poco, una sola vez a cada uno."
                : "Vas a poder invitar cuando aprobemos tu organización."}
            </p>
          </div>
          <Toggle on={invite} onChange={() => setInvite((v) => !v)} label="Invitar al portal" busy={!orgActive} />
        </div>
      </Card>

      {err && <Alert>{err}</Alert>}
      {busy && !preview && csv !== null && <Loading label="Revisando el archivo…" />}

      {preview && (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <SectionHeading>2 · Vista previa</SectionHeading>
              <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-display text-lg font-semibold tabular-nums" aria-live="polite">
                <span>{preview.rows.length} filas</span>
                <span className={preview.errorCount ? "text-zone-bad" : "text-zone-ok"}>
                  {preview.errorCount} con error
                </span>
                {invite && <span className="text-stone-600">{preview.inviteCount} invitaciones</span>}
              </p>
            </div>
            {preview.errorCount > 0 && (
              <label className="flex min-h-11 items-center gap-2 text-sm text-stone-600">
                <input type="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} className="h-4 w-4 accent-brand" />
                Sólo las filas con error
              </label>
            )}
          </div>

          {preview.fileErrors.map((f) => (
            <Alert key={f}>{f}</Alert>
          ))}
          {preview.ignoredHeaders.length > 0 && (
            <p className="text-sm text-stone-500">
              Columnas que no usamos (se ignoran): {preview.ignoredHeaders.join(", ")}.
            </p>
          )}

          {rows.length > 0 && (
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="font-display text-xs uppercase tracking-wider text-stone-500">
                  <tr className="border-b border-stone-200">
                    <th scope="col" className="py-2 pr-3 font-semibold">Línea</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Nombre</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Email</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Documento</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Nac.</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Sexo</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Grupo</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Profesional</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 300).map((r) => (
                    <tr key={r.line} className="border-b border-stone-100 align-top">
                      <td className="py-2 pr-3">
                        <span className="flex items-center gap-2 font-display tabular-nums">
                          <ZoneMark zone={r.errors.length ? "bad" : "ok"} />
                          {r.line}
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        <p className="font-medium">{r.fullName || "—"}</p>
                        {r.errors.map((e) => (
                          <p key={e} className="mt-0.5 text-zone-bad">
                            {e}
                          </p>
                        ))}
                      </td>
                      <td className="break-all py-2 pr-3 text-stone-600">{r.email ?? "—"}</td>
                      <td className="py-2 pr-3 tabular-nums text-stone-600">{r.documentId ?? "—"}</td>
                      <td className="py-2 pr-3 tabular-nums text-stone-600">
                        {r.birthDate ? r.birthDate.split("-").reverse().join("/") : "—"}
                      </td>
                      <td className="py-2 pr-3 text-stone-600">{r.sex ? SEX_LABEL[r.sex] : "—"}</td>
                      <td className="py-2 pr-3 text-stone-600">{r.groups.join(", ") || "—"}</td>
                      <td className="break-all py-2 pr-3 text-stone-600">{r.professionalEmail ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 300 && (
                <p className="mt-2 text-sm text-stone-500">Mostramos las primeras 300 de {rows.length}.</p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-stone-200 pt-4">
            <Button onClick={confirm} disabled={!preview.canImport || busy}>
              {busy ? "Importando…" : `Importar ${preview.rows.length} deportistas`}
            </Button>
            <p className="text-sm text-stone-500">
              {preview.canImport
                ? "Se dan de alta todos juntos."
                : "Corregí el archivo y volvé a subirlo: con una fila con error no se importa ninguna."}
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
