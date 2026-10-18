# 0020 — Borrador de plan con NUTRI: el agente propone, la API resuelve

- **Estado**: aceptada
- **Fecha**: 2026-10-18

## Contexto

Fase 4: sacarle al profesional el trabajo repetitivo de armar un plan desde cero.
NUTRI ya existía como chat de texto (ADR 0013–0015); el paso siguiente es que proponga
un **plan cargable en el editor**. Dos riesgos:

- Un modelo que escribe **valores nutricionales** puede inventarlos, y el plan los
  mostraría como si vinieran de la base (ADR 0018).
- Un borrador que **no sabe qué no puede comer** el paciente (alergias) es peligroso;
  el contexto de NUTRI no las incluía (minimización de datos).

Además, el provider real (Bedrock) sigue detrás del gate legal: la función tiene que
ser útil y testeable con el provider `stub`.

## Decisión

### Reparto: NUTRI propone, la API resuelve

- El servicio de agentes (`POST /plan-draft`) devuelve sólo **comidas → alimentos del
  catálogo por `slug` + gramos** (+ notas del criterio).
- El gateway Nest (`POST /agents/plan-draft`, `agent:use` + `plan:write`, módulo
  `agents`) **valida** la propuesta con Zod (es salida de un modelo), **resuelve** los
  slugs contra el catálogo y arma los items vinculados con la misma función que usa
  el editor (`foodRefFor`), con los macros **calculados** (`resolvePlanDraft`). Slugs
  inexistentes se descartan y se informan.
- El borrador **no se guarda**: se abre en el editor; lo revisa y guarda el
  profesional (nueva versión, como siempre).

### Contexto del borrador

Nuevo perfil `nutri_draft` en la allow-list del servicio: nombre, objetivo,
**preferencias alimentarias y alergias**, mediciones. El objetivo de macros lo manda
el gateway (el del editor o, si no hay, el del plan activo). El rol
`nutreitor_agents` recibe `SELECT` sobre `food_catalog` (referencia, sin PHI).

### Providers

- **`stub`**: armado determinístico — día tipo base (desayuno/almuerzo/merienda/cena,
  25/35/15/25 % de las kcal) con candidatos por prioridad, excluyendo por alergias y
  preferencias (heurística conservadora: excluye de más) y escalado a las kcal
  objetivo dentro de 0,5×–1,75× por comida (más allá las cantidades dejan de ser
  realistas). No ajusta el reparto de macros: las notas lo dicen.
- **`bedrock`**: Claude recibe el catálogo **ya filtrado** (bloque cacheado), el
  contexto y el objetivo, y responde JSON. Lo excluido se vuelve a filtrar al parsear.

Queda asentado como conversación + run de NUTRI (audit y tope de costo, igual que el chat).

## Alternativas descartadas

- **Armador determinístico sólo en la API**: más simple, pero dejaba a NUTRI afuera y
  había que reconectarlo al activar Bedrock.
- **NUTRI devuelve el `MealPlanBody` completo**: menos código, pero los macros los
  escribiría el modelo.

## Consecuencias

- El modelo nunca es fuente de valores nutricionales; el catálogo sí.
- NUTRI ve alergias y preferencias **sólo** para el borrador (no en el chat).
- Por ahora sólo usa el **catálogo global**: alimentos propios y recetas del
  consultorio quedan para una segunda iteración (necesitan GRANT bajo RLS).
- La exclusión por alergias del stub es heurística sobre texto libre: no reemplaza
  la revisión profesional (el borrador lo explicita).
