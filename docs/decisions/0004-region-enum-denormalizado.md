# 0004 — `region` como enum denormalizado en toda tabla de negocio

- **Estado**: aceptada
- **Fecha**: 2026 (fundación; consolidado en migración 0004)

## Contexto

Residencia de datos (GDPR/HIPAA) es un requisito de un producto de salud vendible en
varias regiones. La región gobierna el placement/routing del dato y, a futuro, la
promoción a SILO regional. Había que decidir el tipo y la ubicación de `region`.

## Opciones consideradas

1. **`region` como `text` libre**: flexible pero sin gobierno del set de valores;
   permite typos (`us-east1`) y drift.
2. **`region` sólo en `organizations`** (normalizado): una sola fuente, pero todo
   routing/placement de una fila de negocio requiere un join contra la org.
3. **`region` como enum, denormalizado** en cada tabla de negocio.

## Decisión

**Enum denormalizado**. `region` es un enum (`us-east-1`, `eu-central-1`,
`sa-east-1`) — agregar una región es `ALTER TYPE region ADD VALUE`. Viaja
**denormalizado** en cada tabla tenant-scoped: la región acompaña al dato. Se hereda
de la organización al crear y se trata como **inmutable** salvo un job de migración
explícito (cambiar de región ES mover datos).

## Consecuencias

- **A favor**: el enum impide valores arbitrarios; la fila se autodescribe, así
  routing/placement y promoción a SILO regional no requieren join; sin migración de
  modelo cuando llega el requisito de residencia.
- **En contra / costos**: denormalización = la región está repetida; si se permitiera
  mutarla habría riesgo de inconsistencia, por eso se trata como inmutable (un cambio
  pasa por un job deliberado, no por un UPDATE suelto). Agregar regiones requiere
  `ALTER TYPE` (no es dato, es DDL).
