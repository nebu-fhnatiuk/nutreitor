# 0033 — Recordatorio de 24 horas

- **Estado**: aceptada
- **Fecha**: 2026-10-20

## Contexto

La primera consulta empieza por saber qué come el deportista. Nutreitor tenía el plan
(lo que se prescribe) y la adherencia (si cumplió cada comida), pero no la **ingesta
real**: los softwares del sector (Nutritics, Dietopro, Nutrium) la registran con
recordatorios de 24 h analizados contra la base de alimentos.

## Decisión

- **Lo carga el profesional en la consulta**, como entrevista. La UI guía el **método
  de pasadas múltiples**: primero la lista rápida, después una lista de lo que suele
  olvidarse (bebidas, infusiones, aceites y aderezos, picoteos, lo que come alrededor
  del entrenamiento, suplementos y bebidas deportivas) y por último cantidades y
  horarios. El checklist es una ayuda de la UI: no se guarda.
- **Las comidas tienen la misma forma que las del plan** (`planMealSchema`), con los
  items vinculados a la base de alimentos y las medidas caseras. Se reutiliza el editor
  del plan en una variante sin alternativas ni intercambios, que solo sirven para
  prescribir.
- **Los totales se derivan al leer** (`recallTotals`): kcal y macros, g/kg con el peso
  más reciente, % de la energía y kcal por comida. Si hay items en texto libre sin
  macros, el total se marca como **parcial** y no se compara.
- **Contra el requerimiento**: el recordatorio se etiqueta con el tipo de día
  ("Entrenamiento", "Partido"…) y se compara contra el objetivo de ese tipo de día del
  requerimiento vigente ([ADR 0032](0032-requerimiento-energetico-periodizado.md)).
- **Día habitual o atípico**: solo los habituales entran al **promedio** (con dos o más),
  que es lo que describe la dieta.
- Tabla `dietary_recalls` bajo RLS, editable y borrable para corregir la carga, con
  auditoría. Permisos y scoping del plan (`plan:read`, `plan:write`; profesional →
  asignados).

## Alternativas descartadas

- **Que lo complete el deportista desde el portal**: el recordatorio es una entrevista;
  autoadministrado se subestima. Queda como posible registro alimentario aparte.
- **Un modelo propio de items**: duplicaría el vínculo con la base de alimentos y las
  medidas caseras que ya resuelve el plan.
- **Guardar los totales**: si se corrige un alimento del catálogo, los items guardan la
  copia de sus nutrientes por 100 g (igual que el plan); los totales se suman al leer.

## Consecuencias

- Hay ingesta real para comparar con el plan y el requerimiento.
- Sigue la **frecuencia de consumo** por grupos de alimentos, en un PR aparte.
- Micronutrientes: la base guarda solo energía y macros, así que el análisis llega
  hasta ahí.
