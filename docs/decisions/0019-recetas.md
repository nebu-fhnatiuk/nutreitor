# 0019 — Recetas: biblioteca global + recetas del consultorio, calculadas desde sus ingredientes

- **Estado**: aceptada
- **Fecha**: 2026-10-18

## Contexto

Con la base de alimentos (ADR 0018) el editor calcula los macros de cada item. Pero
el nutricionista no planifica sólo con alimentos sueltos: planifica con
**preparaciones** ("tarta de verdura", "guiso de lentejas"). Cargar sus ingredientes
uno por uno en cada plan es justo el trabajo repetitivo que la Fase 4 quiere sacar.

Hay que decidir el alcance (¿sólo del consultorio o también un recetario común?), cómo
se referencian los ingredientes y si los nutrientes se guardan o se calculan.

## Decisión

### Dos capas, como los alimentos

- **`recipe_library`**: recetario de **referencia global**, sin tenant ni PHI, de
  **sólo lectura** para el rol app; se carga por migración generada desde una
  curación versionada. Va declarada en el test de RLS por catálogo con su
  justificación (tercera tabla global, después de `users` y `food_catalog`).
- **`tenant_recipes`**: recetas propias del consultorio, bajo RLS, sin `DELETE` (se
  archivan). Una receta de la biblioteca se puede **copiar** al consultorio para
  adaptarla.

### Ingredientes por `slug` del catálogo

Los ids del catálogo son `gen_random_uuid()`: **cambian entre bases** (dev, test,
producción). Una receta de la biblioteca que referenciara ids se rompería al pasar
de entorno. Por eso un ingrediente es `{ kind: "catalog", slug, grams }` (el `slug`
del curado es estable) o, sólo en las recetas del consultorio,
`{ kind: "tenant", id, grams }` (un alimento propio).

### Los nutrientes se calculan, no se guardan

La receta guarda ingredientes, gramos y **porciones que rinde**. Los nutrientes por
100 g y por porción se **calculan al servirla**. Si se corrige un alimento del
catálogo, todas las recetas que lo usan quedan bien sin re-sincronizar nada. El costo
(unir pocos ingredientes por receta) es despreciable a esta escala.

Se descartó guardar los totales en la fila: duplicaría el dato y quedaría
desactualizado ante cualquier corrección del catálogo.

### Una receta es "un alimento más" para el editor

La búsqueda del editor devuelve recetas con la misma forma que un alimento
(`FoodDto`): nutrientes por 100 g y una medida casera **"1 porción"** = peso total ÷
porciones. Así el cálculo, los totales del día y el vínculo del item (ADR 0018, con
copia de los valores al guardar el plan) funcionan sin cambios. Un ingrediente que ya
no existe (alimento propio archivado o slug inexistente) se marca y la receta se
calcula con el resto, avisándolo.

## Consecuencias

- **A favor**: el profesional arma una preparación una vez y la usa en todos sus
  planes; el recetario común da un punto de partida a un consultorio nuevo; el editor
  no cambia.
- **En contra / costos**: el contenido de la biblioteca hay que escribirlo y
  **validarlo con criterio profesional** (ingredientes, gramos, porciones); mientras
  tanto el recetario inicial es un borrador. Las recetas de la biblioteca sólo pueden
  usar alimentos del catálogo (no los propios de un consultorio).
- **Peso total = suma de los ingredientes**: no se modela la pérdida o ganancia de
  peso por cocción. Los nutrientes por porción son correctos (no dependen del peso);
  los "por 100 g" son aproximados en preparaciones que pierden o absorben agua.
- **Planes ya guardados**: como con los alimentos, el item del plan guarda una copia
  de los valores; editar una receta no altera versiones ya guardadas.
