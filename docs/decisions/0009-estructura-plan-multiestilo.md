# 0009 — Estructura multi-estilo del plan alimentario

- **Estado**: aceptada
- **Fecha**: 2026 (vertical clínica — planes + métricas)

## Contexto

El plan alimentario se había shippeado (Sprint 4) con un `body` JSONB día-tipo plano:
`{ meals: [{ name, time?, items: [{ text, note? }] }], generalNotes? }`. Cantidad,
alternativas/intercambios y macros quedaban como texto libre en `note`. Un
nutricionista que atiende online arma planes de formas distintas según su estilo:
algunos cualitativos, otros con cantidades y macros; algunos día-tipo, otros
plantilla semanal. La estructura tenía que dar **opciones que el profesional elija**,
sin forzar una rigidez.

## Opciones consideradas

1. **Dejar el día-tipo plano**: cero trabajo, pero no modela cantidades estructuradas,
   alternativas ni macros, ni plantilla semanal.
2. **N tipos rígidos de plan** (un schema por estilo): claro por tipo, pero multiplica
   modelos, validación y editores; difícil de versionar uniforme.
3. **Un schema flexible único**: discriminado por `layout` (`day`/`week`), con el
   detalle (cantidad/unidad, alternativas, macros, targets) **opcional y ortogonal**.
   El estilo emerge de `layout` + cuánto detalle se carga.

## Decisión

**Opción 3.** `body` discriminado por `layout`:

- `{ layout: "day",  day: { meals }, targets?, generalNotes? }`
- `{ layout: "week", days: { mon: {meals}, … }, targets?, generalNotes? }`

Cada item: `text` (siempre) + `qty?`/`unit?`, `alternatives?`, `macros?`, `note?`.
Cortes de diseño:

- **Macros a nivel item; totales derivados en UI.** Única fuente = items, sin drift
  de totales que quedan stale al editar. `targets` (objetivo del plan) sí se guarda:
  es input del profesional, no un derivado.
- **Un solo JSONB, una sola tabla, mismo versionado.** No cambia `meal_plans`
  (columnas), `status`, el unique de "un activo", ni el flujo supersede+`version+1`.
- **Entrega incremental.** A1 = día-tipo + enriquecimiento (cantidad/alternativas/
  macros/targets). El layout semanal queda forward-compatible en el schema y la
  lectura, con el **editor semanal diferido** (A2): se validó el costo del editor
  enriquecido antes de comprometer la grilla semanal.

## Consecuencias

- **A favor**: un nutri cualitativo escribe sólo `text` (camino rápido intacto); el
  que trabaja fino agrega detalle; el versionado y el aislamiento no cambian; el
  editor adapta su complejidad al estilo.
- **En contra / costos**: el editor es más complejo (cantidad inline + detalle
  expandible por item + targets); el `body` admite formas variadas (hay que validar
  con Zod y normalizar). El editor del layout `week` todavía no existe (deuda
  consciente, A2).
- **Compatibilidad**: `normalizeMealPlanBody` (shared) envuelve bodies legacy a
  `layout: "day"` (idempotente); la migración `0021` migró las filas existentes y
  actualizó el default. La normalización en runtime queda como blindaje.

Detalle del shape en [`../architecture/data-model.md`](../architecture/data-model.md);
flujo en [`../flows/patients.md`](../flows/patients.md).
