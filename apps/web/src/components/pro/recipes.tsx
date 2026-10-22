"use client";

import { ChevronDown, Copy, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FoodDto, RecipeDto, RecipeIngredientInput } from "@nutreitor/shared";

import { FoodPicker } from "@/components/patients/food-picker";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  Loading,
  SlideOver,
  Tabs,
  Textarea,
  fieldClass,
  tabPanelProps,
  useFeedback,
} from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

const CATEGORIES = [
  "Platos principales",
  "Ensaladas",
  "Desayunos y meriendas",
  "Colaciones",
  "Bebidas",
  "Postres",
];

type View = "mine" | "library";

/**
 * Recetas del profesional (ADR 0019): las suyas y la biblioteca común. Una receta
 * de la biblioteca se copia para adaptarla. En el editor del plan, cualquier receta
 * aparece en la búsqueda como "1 porción" con sus macros calculados.
 */
export function Recipes() {
  const [list, setList] = useState<RecipeDto[] | null>(null);
  const [view, setView] = useState<View>("mine");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<RecipeDto | "new" | null>(null);
  const { confirm, toast } = useFeedback();

  const load = useCallback(async () => {
    try {
      setList(await api<RecipeDto[]>("recipes"));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const mine = list?.filter((r) => r.source === "recipe") ?? [];
  const library = list?.filter((r) => r.source === "library") ?? [];
  const shown = (view === "mine" ? mine : library).filter((r) => !q.trim() || norm(r.name).includes(norm(q.trim())));

  async function copy(r: RecipeDto) {
    try {
      const created = await api<RecipeDto>(`recipes/library/${r.id}/copy`, { method: "POST" });
      toast("Copiada a tus recetas");
      await load();
      setView("mine");
      setEditing(created);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function archive(r: RecipeDto) {
    const ok = await confirm({
      title: `¿Archivar "${r.name}"?`,
      body: "Deja de aparecer en tus recetas y en la búsqueda del plan. Los planes que ya la usan no cambian.",
      confirmLabel: "Archivar",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await api(`recipes/tenant/${r.id}/archive`, { method: "POST" });
      toast("Receta archivada");
      void load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="space-y-4">
      {error && <Alert>{error}</Alert>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs<View>
          label="Recetas"
          value={view}
          onChange={setView}
          items={[
            { id: "mine", label: "Mis recetas", count: mine.length },
            { id: "library", label: "Biblioteca", count: library.length },
          ]}
        />
        <Button onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" aria-hidden />
          Nueva receta
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-stone-500" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar receta"
          aria-label="Buscar receta"
          className={`${fieldClass} w-full pl-9`}
        />
      </div>

      <div {...tabPanelProps(view)} className="focus-visible:outline-none">
        {list === null ? (
          <Loading />
        ) : shown.length === 0 ? (
          <Card>
            <EmptyState
              action={
                view === "mine" && !q ? (
                  <Button variant="secondary" size="sm" onClick={() => setView("library")}>
                    Ver la biblioteca
                  </Button>
                ) : undefined
              }
            >
              {q
                ? "No hay recetas con ese nombre."
                : view === "mine"
                  ? "Todavía no tenés recetas. Creá una o copiá una de la biblioteca para adaptarla."
                  : "La biblioteca está vacía."}
            </EmptyState>
          </Card>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {shown.map((r) => (
              <RecipeCard
                key={r.id}
                recipe={r}
                actions={
                  r.source === "library" ? (
                    <Button variant="secondary" size="sm" onClick={() => void copy(r)}>
                      <Copy className="h-4 w-4" aria-hidden />
                      Copiar a mis recetas
                    </Button>
                  ) : (
                    <>
                      <Button variant="secondary" size="sm" onClick={() => setEditing(r)}>
                        <Pencil className="h-4 w-4" aria-hidden />
                        Editar
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => void archive(r)}>
                        <Trash2 className="h-4 w-4" aria-hidden />
                        Archivar
                      </Button>
                    </>
                  )
                }
              />
            ))}
          </ul>
        )}
      </div>

      <SlideOver
        wide
        open={editing !== null}
        onClose={() => setEditing(null)}
        header={
          <h2 className="text-sm font-semibold text-stone-800">
            {editing === "new" ? "Nueva receta" : "Editar receta"}
          </h2>
        }
      >
        {editing !== null && (
          <RecipeEditor
            initial={editing === "new" ? null : editing}
            onSaved={() => {
              toast(editing === "new" ? "Receta creada" : "Receta guardada");
              setEditing(null);
              setView("mine");
              void load();
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </SlideOver>
    </div>
  );
}

function RecipeCard({ recipe: r, actions }: { recipe: RecipeDto; actions: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const s = r.perServing;
  return (
    <li className="rounded-2xl border border-stone-200 bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-stone-900">{r.name}</p>
          <p className="text-xs text-stone-500">
            {r.category} · rinde {r.servings} {r.servings === 1 ? "porción" : "porciones"}
          </p>
        </div>
        <span className="shrink-0 text-right text-sm font-medium tabular-nums text-stone-800">
          {s.energyKcal} kcal
          <span className="block text-xs font-normal text-stone-500">por porción</span>
        </span>
      </div>
      <p className="mt-2 text-xs text-stone-600">
        P {s.proteinG} g · C {s.carbsG} g · G {s.fatG} g
      </p>
      {r.missingIngredients > 0 && (
        <p className="mt-2 text-xs text-amber-800">
          {r.missingIngredients} ingrediente(s) ya no existen: el cálculo los omite.
        </p>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mt-2 flex items-center gap-1 text-xs text-stone-600 hover:text-brand"
      >
        <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} aria-hidden />
        {open ? "Ocultar" : "Ver"} ingredientes
      </button>
      {open && (
        <div className="mt-2 space-y-2 text-sm">
          <ul className="text-stone-700">
            {r.ingredients.map((i, k) => (
              <li key={k}>
                <span className="tabular-nums text-stone-500">{i.grams} g</span>{" "}
                {i.name ?? <span className="italic text-amber-800">ingrediente inexistente</span>}
              </li>
            ))}
          </ul>
          {r.steps && <p className="whitespace-pre-line text-stone-600">{r.steps}</p>}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">{actions}</div>
    </li>
  );
}

interface Row {
  kind: "catalog" | "tenant";
  ref: string;
  name: string;
  grams: number;
  per100g: { kcal: number; protein_g: number; carbs_g: number; fat_g: number } | null;
}

function RecipeEditor({
  initial,
  onSaved,
  onCancel,
}: {
  initial: RecipeDto | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? CATEGORIES[0]!);
  const [servings, setServings] = useState(String(initial?.servings ?? 1));
  const [steps, setSteps] = useState(initial?.steps ?? "");
  const [rows, setRows] = useState<Row[]>(
    initial?.ingredients
      .filter((i) => i.name !== null)
      .map((i) => ({ kind: i.kind, ref: i.ref, name: i.name!, grams: i.grams, per100g: i.per100g })) ?? [],
  );
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function add(f: FoodDto) {
    const ref = f.source === "catalog" ? f.slug : f.id;
    if (!ref || (f.source !== "catalog" && f.source !== "tenant")) return;
    setRows((rs) => [
      ...rs,
      {
        kind: f.source as "catalog" | "tenant",
        ref,
        name: f.name,
        grams: f.portions[0]?.grams ?? 100,
        per100g: { kcal: f.per100g.energyKcal, protein_g: f.per100g.proteinG, carbs_g: f.per100g.carbsG, fat_g: f.per100g.fatG },
      },
    ]);
    setSearch("");
  }

  const n = Math.max(1, Number(servings) || 1);
  const perServing = useMemo(() => {
    const t = { kcal: 0, p: 0, c: 0, g: 0 };
    for (const r of rows) {
      if (!r.per100g) continue;
      const f = r.grams / 100;
      t.kcal += r.per100g.kcal * f;
      t.p += r.per100g.protein_g * f;
      t.c += r.per100g.carbs_g * f;
      t.g += r.per100g.fat_g * f;
    }
    const r1 = (x: number) => Math.round((x / n) * 10) / 10;
    return { kcal: Math.round(t.kcal / n), p: r1(t.p), c: r1(t.c), g: r1(t.g) };
  }, [rows, n]);

  async function save() {
    setError(null);
    if (!name.trim()) return setError("Poné un nombre a la receta.");
    if (rows.length === 0) return setError("Sumá al menos un ingrediente.");
    setBusy(true);
    const ingredients: RecipeIngredientInput[] = rows.map((r) =>
      r.kind === "catalog" ? { kind: "catalog", slug: r.ref, grams: r.grams } : { kind: "tenant", id: r.ref, grams: r.grams },
    );
    const body = JSON.stringify({ name: name.trim(), category, servings: n, ingredients, steps: steps.trim() || null });
    try {
      await api(initial ? `recipes/tenant/${initial.id}` : "recipes", {
        method: initial ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="space-y-4 px-5 py-4">
        {error && <Alert>{error}</Alert>}
        <Label label="Nombre">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Tarta de calabaza" />
        </Label>
        <div className="grid gap-3 sm:grid-cols-2">
          <Label label="Categoría">
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${fieldClass} w-full`}>
              {[...new Set([...CATEGORIES, category])].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Label>
          <Label label="Porciones que rinde">
            <Input type="number" min={1} max={50} value={servings} onChange={(e) => setServings(e.target.value)} />
          </Label>
        </div>

        <div>
          <p className="mb-1 text-xs text-stone-500">Ingredientes (gramos de la receta entera)</p>
          <ul className="space-y-2">
            {rows.map((r, i) => (
              <li key={`${r.ref}-${i}`} className="flex items-center gap-2 rounded-lg bg-stone-50 p-2">
                <Input
                  type="number"
                  min={1}
                  value={String(r.grams)}
                  onChange={(e) => {
                    const g = Number(e.target.value);
                    setRows((rs) => rs.map((x, j) => (j === i ? { ...x, grams: g > 0 ? g : x.grams } : x)));
                  }}
                  aria-label={`Gramos de ${r.name}`}
                  className="w-20"
                />
                <span className="text-xs text-stone-500">g</span>
                <span className="min-w-0 flex-1 truncate text-sm text-stone-800">{r.name}</span>
                <button
                  type="button"
                  onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                  aria-label={`Quitar ${r.name}`}
                  className="rounded p-1 text-stone-500 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2">
            <FoodPicker value={search} onText={setSearch} onPick={add} allowRecipes={false} className={`${fieldClass} w-full`} />
            <p className="mt-1 text-xs text-stone-500">Buscá un alimento del catálogo o uno propio para sumarlo.</p>
          </div>
        </div>

        <div className="rounded-lg bg-stone-50 px-3 py-2 text-sm">
          <span className="font-medium text-stone-800">Por porción:</span>{" "}
          <span className="tabular-nums text-stone-700">
            {perServing.kcal} kcal · P {perServing.p} g · C {perServing.c} g · G {perServing.g} g
          </span>
        </div>

        <Label label="Preparación (opcional)">
          <Textarea value={steps} onChange={(e) => setSteps(e.target.value)} rows={4} />
        </Label>
      </div>
      <div className="mt-auto flex gap-2 border-t border-stone-200 px-5 py-4">
        <Button onClick={() => void save()} disabled={busy}>
          {busy ? "Guardando…" : "Guardar receta"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
