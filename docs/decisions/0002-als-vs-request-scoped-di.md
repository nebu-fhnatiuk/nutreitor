# 0002 — Contexto de tenant por AsyncLocalStorage (no request-scoped DI)

- **Estado**: aceptada
- **Fecha**: 2026 (fundación multi-tenant)

## Contexto

El `tenant_id` que alimenta RLS vive por request y tiene que estar disponible para
guards, controllers y servicios sin viajar como parámetro explícito en cada
llamada. En NestJS hay dos formas idiomáticas de tener estado por request.

## Opciones consideradas

1. **Providers request-scoped de Nest** (`Scope.REQUEST`): Nest re-instancia todo el
   subárbol de providers que consume el scope en cada request. Es "viral" (todo lo
   que lo toca se vuelve request-scoped) y penaliza el throughput.
2. **AsyncLocalStorage** (`node:async_hooks`): un store por request; los providers
   siguen siendo **singletons** y leen el contexto del ALS cuando lo necesitan.

## Decisión

**AsyncLocalStorage**. Un `TenantContextMiddleware` abre un holder mutable vacío
para todo request; el `JwtAuthGuard` lo completa al autenticar (`context`, `org`,
`user`); las rutas públicas simplemente no lo completan. `TenantDbService` lee el
contexto del ALS en cada operación.

## Consecuencias

- **A favor**: mismo aislamiento por request manteniendo providers singleton → mejor
  throughput, especialmente bajo Fargate; el patrón es explícito (`getTenantContext`
  tira si no hay contexto, fail-closed a nivel app).
- **En contra / costos**: el contexto es "mágico" (no se ve en la firma de los
  métodos); hay que cuidar que el middleware se aplique a todas las rutas y que el
  guard corra dentro del mismo scope async. Cualquier código que rompa la cadena de
  `async`/`await` perdería el store.
