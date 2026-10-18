"use client";

import { normalizeMealPlanBody, fmtGrams, shoppingList, type MealPlanBody } from "@nutreitor/shared";

import { EmptyState } from "@/components/ui";

/**
 * Lista de compras de una semana del plan, agrupada por góndola (grupo del
 * alimento). Los items vinculados a la base traen gramos exactos; los de texto
 * libre, cuántas veces aparecen. La usan el portal (imprimible) y el profesional.
 */
export function ShoppingListView({ body }: { body: unknown }) {
  const groups = shoppingList(normalizeMealPlanBody(body) as MealPlanBody);
  if (groups.length === 0) return <EmptyState>El plan no tiene alimentos cargados.</EmptyState>;
  return (
    <div className="columns-1 gap-8 sm:columns-2 print:columns-2">
      {groups.map((g) => (
        <section key={g.group} className="mb-6 break-inside-avoid">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-stone-500">{g.group}</h3>
          <ul className="space-y-1.5">
            {g.items.map((it) => (
              <li key={it.name} className="flex items-baseline gap-2 text-sm">
                <span aria-hidden className="mt-1 inline-block h-3.5 w-3.5 shrink-0 rounded border border-stone-300" />
                <span className="flex-1 text-stone-800">{it.name}</span>
                <span className="shrink-0 tabular-nums text-stone-600">
                  {it.grams != null ? fmtGrams(it.grams) : `${it.times} ${it.times === 1 ? "vez" : "veces"}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="break-inside-avoid text-xs text-stone-500">
        Cantidades para una semana. Lo marcado “cocido” está en peso cocido: en crudo
        es menos (el arroz y las legumbres rinden de 2 a 3 veces su peso al cocinarse).
        Las alternativas del plan no están sumadas.
      </p>
    </div>
  );
}
