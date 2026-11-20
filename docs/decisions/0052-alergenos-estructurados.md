# 0052 — Alérgenos estructurados en la ficha y en los alimentos

- **Estado**: aceptada e implementada (KAN-105): datos, reglas A1 a A3 del motor de
  alertas y exclusiones de NUTRI.
- **Fecha**: 2026-11-20
- **Épica**: KAN-91 · Relacionados: [ADR 0018](0018-base-de-alimentos.md),
  [ADR 0019](0019-recetas.md), [ADR 0051](0051-alertas-del-plan.md)

## Contexto

Las alertas de alergias e intolerancias (sección A del catálogo de alertas) y las
exclusiones de NUTRI necesitan cruzar el plan con la ficha. Hasta ahora las alergias
eran texto libre y los alimentos no tenían alérgenos: NUTRI adivinaba con palabras
clave ("gluten" → pan, fideos…), lo que falla con sinónimos y negaciones ("no es
alérgica al maní").

La lista de alérgenos, las reglas y la curación del catálogo las validó la
nutricionista en [`docs/validation/alergenos.md`](../validation/alergenos.md).

## Decisión

1. **Una lista cerrada de claves** en `packages/shared/src/allergens.ts`: los
   alérgenos del Código Alimentario (art. 235 séptimo), más sésamo y lactosa.
2. **Ficha:** casillas (`patients.allergy_flags`) con la alergia a cada alérgeno, más
   celiaquía e intolerancia a la lactosa. El texto libre (`allergies`) queda para el
   detalle. Son dato clínico: se leen y escriben con `patient:read_clinical` y llegan
   al portal con la visibilidad de `allergies`.
3. **Alimentos:** `allergens` es un dato del alimento.
   - Catálogo: curado y validado; la fuente es `foods-ar.curation.json` y lo aplica la
     migración 0055. Un test verifica que la base coincida con el JSON.
   - Alimentos propios: los marca el profesional.
   - Recetas: la unión de los alérgenos de sus ingredientes, calculada al leer.
4. **Copia al plan:** al vincular un alimento a un item, se copian sus alérgenos
   (`food.allergens`), igual que los nutrientes. Una versión guardada no cambia si
   después se corrige el catálogo.
5. **`CHECK` en la base** sobre las claves válidas, además de la validación con Zod.

Criterio de curación: solo los alérgenos propios del alimento genérico. Lo que
depende de la marca y las trazas ("puede contener") no se marcan.

6. **NUTRI** (borrador de plan) excluye primero por las casillas de la ficha contra
   los alérgenos del catálogo. La heurística sobre el texto libre queda como red de
   seguridad: solo puede excluir de más (por ejemplo, ante "no es alérgica al maní").
   Las listas de `apps/agents/app/inference.py` son un espejo de `allergens.ts`.

## Consecuencias

- **A favor:** las reglas y NUTRI dejan de depender del texto; el dato es auditable
  y está validado; las recetas se mantienen solas.
- **En contra:**
  - Los items de texto libre (sin vínculo a la base) no tienen alérgenos conocidos, y
    los vinculados antes de esta versión tampoco. Las alertas tienen que decirlo, no
    suponer que no hay alérgenos.
  - Las fichas existentes quedan sin casillas hasta que el profesional las cargue: el
    texto libre de alergias no se convierte solo.
  - Agregar un alérgeno a la lista requiere una migración (el `CHECK`).
- **Pendiente:** no hay pantalla para dar de alta alimentos propios (solo la API, que
  ya acepta los alérgenos). La anamnesis del portal podría proponer casillas.

## Alternativas descartadas

- **Interpretar el texto libre:** sin cambiar la ficha, pero frágil (es lo que hacía
  NUTRI) y no es auditable.
- **Consultar los alérgenos al evaluar, sin copiarlos al plan:** corregir el catálogo
  cambiaría las alertas de versiones viejas y obligaría al editor a pedirlos a la API.
- **Gramos de lactosa por alimento (para el umbral de 12 g):** exige importar y
  validar un nutriente nuevo, y los alimentos propios no lo tendrían. Se usa la marca
  "contiene lactosa".
