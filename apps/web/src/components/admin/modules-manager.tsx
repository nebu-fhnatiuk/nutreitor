"use client";

import { useCallback, useEffect, useState } from "react";
import { MODULE_CATALOG, type ModuleKey, type OrgModuleStateDto } from "@nutreitor/shared";

import { api, errorMessage } from "@/lib/api";
import { Alert, Button, Card, Loading, Select } from "@/components/ui";

/**
 * Complementos instalables de la organización (ADR 0016). El admin instala
 * aceptando términos + plan; desinstalar es soft (conserva datos). El acceso real a
 * la feature lo gatea el servidor (ModuleGuard).
 */
export function ModulesManager() {
  const [modules, setModules] = useState<OrgModuleStateDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setModules(await api<OrgModuleStateDto[]>("organizations/current/modules"));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <Alert>{error}</Alert>;
  if (!modules) return <Loading label="Cargando complementos…" />;

  return (
    <div className="space-y-4">
      {modules.map((m) => (
        <ModuleCard key={m.key} state={m} onChange={load} onError={setError} />
      ))}
    </div>
  );
}

function ModuleCard({
  state,
  onChange,
  onError,
}: {
  state: OrgModuleStateDto;
  onChange: () => void;
  onError: (e: string) => void;
}) {
  const catalog = MODULE_CATALOG[state.key as ModuleKey];
  const [plan, setPlan] = useState(catalog.plans[0]?.id ?? "");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = state.status === "active";

  async function run(path: string, body?: unknown) {
    setBusy(true);
    onError("");
    try {
      await api(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      onChange();
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-stone-800">{catalog.name}</h3>
            <span
              className={
                "rounded-full px-2 py-0.5 text-[11px] " +
                (active ? "bg-brand/10 text-brand" : "bg-stone-100 text-stone-500")
              }
            >
              {active ? "instalado" : "no instalado"}
            </span>
          </div>
          <p className="mt-1 max-w-prose text-sm text-stone-500">{catalog.blurb}</p>
        </div>
      </div>

      {active ? (
        <div className="mt-4 border-t border-stone-100 pt-4">
          <p className="text-sm text-stone-600">
            Plan <b>{state.plan}</b>
            {state.installedAt && (
              <> · desde {new Date(state.installedAt).toLocaleDateString("es-AR")}</>
            )}
          </p>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void run(`organizations/current/modules/${state.key}/uninstall`)}
            className="mt-3 hover:border-red-300 hover:text-red-600"
          >
            {busy ? "Desinstalando…" : "Desinstalar"}
          </Button>
          <p className="mt-2 text-xs text-stone-500">
            Desinstalar deshabilita el complemento; las conversaciones y consentimientos se conservan.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3 border-t border-stone-100 pt-4">
          <ul className="list-disc space-y-1 pl-5 text-xs text-stone-500">
            {catalog.termsSummary.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <label className="block max-w-xs">
            <span className="mb-1 block text-xs text-stone-500">Plan</span>
            <Select value={plan} onChange={(e) => setPlan(e.target.value)}>
              {catalog.plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.priceText}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex items-start gap-2 text-sm text-stone-600">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5"
            />
            <span>Acepto los términos del complemento (versión {catalog.termsVersion}).</span>
          </label>
          <Button
            disabled={busy || !accepted || !plan}
            onClick={() =>
              void run(`organizations/current/modules/${state.key}/install`, {
                plan,
                acceptTerms: true,
              })
            }
          >
            {busy ? "Instalando…" : "Instalar complemento"}
          </Button>
        </div>
      )}
    </Card>
  );
}
