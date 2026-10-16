# 0018 — Base de alimentos: USDA + curado AR, catálogo global + alimentos propios

- **Estado**: aceptada
- **Fecha**: 2026-10-16

## Contexto

El editor del plan (ADR 0009) acepta macros por item, pero el profesional los carga
**a mano**. Es el cuello de botella de la eficiencia: competidores como INDYA arman
planes "en segundos" porque el plan se calcula contra una base de alimentos con su
composición nutricional. La Fase 4 del roadmap ("Eficiencia del profesional") empieza
por esa base, y de ella dependen el cálculo automático, los intercambios, la lista de
compras y el plan borrador generado por NUTRI.

Hay que decidir **de dónde salen los datos** y **cómo se reparten entre tenants**.

### Fuentes evaluadas

| Fuente | Fidelidad AR | Licencia para un SaaS comercial |
|---|---|---|
| **ARGENFOODS** (Univ. Nac. de Luján, 2010) | Alta | **Prohíbe** incorporarla a sistemas informáticos con fines comerciales sin permiso escrito (Ley 11.723) |
| **SARA 2** (Min. de Salud, compilación para ENNyS 2) | Alta | Se compiló en parte **desde ARGENFOODS** (más USDA y la tabla británica McCance & Widdowson): hereda restricciones; no encontramos una licencia explícita |
| **USDA FoodData Central** | Media (alimentos genéricos, nombres en inglés) | **Dominio público (CC0)**: uso comercial libre, se pide atribución |
| Open Food Facts | Productos envasados | ODbL (share-alike sobre la base): complementa, no sirve de base |

## Decisión

### Fuente: USDA FoodData Central + capa curada AR

- Los **valores nutricionales** (por 100 g) salen de USDA FoodData Central (CC0),
  guardando la procedencia (`source = "usda"`, `source_ref = fdc_id`) para la
  atribución y para poder re-sincronizar.
- Encima va una **capa curada propia**: nombre argentino, grupo de alimentos y
  **medidas caseras** ("1 taza", "1 feta", "1 cucharada sopera"), que es como trabaja
  el nutricionista local y lo que USDA no trae en castellano. Esa capa es trabajo
  propio, sin restricciones.
- Se arranca con un **subconjunto curado** de alimentos de uso frecuente, no con los
  miles de ítems de USDA: un catálogo enorme en inglés no le sirve al profesional.
- **En paralelo** se pide permiso escrito a la Universidad de Luján (ARGENFOODS). Si lo
  dan, entra como fuente preferida para los alimentos locales; el modelo ya guarda la
  fuente por fila, así que conviven sin migración.

### Alcance: catálogo global de sólo lectura + alimentos propios por tenant

- **`food_catalog`**: referencia **global**, sin tenant y sin PHI. Es la segunda tabla
  global del sistema (después de `users`) y va **declarada en el test de RLS por
  catálogo** con su justificación. El rol app tiene **sólo `SELECT`**: se carga por
  seed con el owner, y el test verifica que el runtime no la pueda escribir.
- **`tenant_foods`**: alimentos propios del consultorio (preparaciones, marcas
  locales), con las **mismas columnas nutricionales**, bajo RLS. Sin `DELETE`: se
  archivan, porque un plan viejo puede haberlos usado.
- La búsqueda del editor une las dos capas. El índice es por nombre **sin acentos ni
  mayúsculas** (`unaccent` + `pg_trgm`), para que "almendra" encuentre "Almendras".

Se descartó **copiar el catálogo a cada tenant**: duplica miles de filas por
consultorio y las correcciones de la base nunca llegan a quien ya tiene su copia.

### Los macros del plan son una copia (snapshot)

Cuando un item del plan referencia un alimento, se guarda el **alimento elegido, la
cantidad y los macros calculados en ese momento**. Si después se corrige un valor del
catálogo, las versiones ya guardadas del plan no cambian: se respeta el versionado
inmutable de `meal_plans` (ADR 0009) y lo que el paciente recibió queda tal cual.

## Consecuencias

- **A favor**: se arranca ya, sin riesgo legal; la capa AR (nombres y medidas
  caseras) es un activo propio que la competencia española no tiene; un alimento que
  falta se resuelve en el tenant sin esperar a la base global; agregar ARGENFOODS
  más adelante no requiere cambiar el modelo.
- **En contra / costos**: los valores de USDA son de alimentos estadounidenses
  genéricos; para preparaciones y productos locales la precisión depende de la
  curación y de los alimentos propios del tenant. La curación de medidas caseras es
  trabajo manual y hay que revisarla con criterio profesional.
- **Infra**: la migración usa las extensiones `unaccent` y `pg_trgm`. Las dos están
  disponibles en Amazon RDS for PostgreSQL; el rol que corre las migraciones tiene
  que poder crearlas (`rds_superuser` en RDS).
- **Atribución**: la app debe citar a USDA FoodData Central como fuente de los datos
  nutricionales del catálogo.

## Cómo se carga y se actualiza

- La curación AR vive en `packages/db/catalog/foods-ar.curation.json`: por alimento,
  nombre local, grupo, la **descripción exacta** en SR Legacy y las medidas caseras.
- `pnpm --filter @nutreitor/db catalog:build <dir-SR-Legacy-CSV>` cruza la curación
  con el dataset y genera una **migración SQL** (upsert por `slug`). El catálogo es
  dato de referencia que también hace falta en producción, así que viaja por el job de
  migraciones y no por el seed de demo.
- El generador falla si una descripción no existe (y sugiere las más parecidas), si
  falta un nutriente obligatorio (kcal, proteínas, carbohidratos, grasas) o si los ids
  de nutriente del dataset no significan lo esperado.
- Para sumar o corregir alimentos: editar la curación, regenerar y commitear la
  migración nueva (`00NN_food_catalog_data_*.sql`); nunca editar a mano una migración
  ya aplicada.
