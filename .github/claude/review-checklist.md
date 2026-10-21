# Checklist de revisión — Nutreitor

Lo usa el revisor automático (`.github/workflows/claude-review.yml`). Escribí en
español de Argentina, directo y sin relleno. Comentá **sólo lo que encontrás**: si un
punto no aplica o está bien, no lo menciones.

## Contexto

Plataforma SaaS multi-tenant para nutrición deportiva (profesionales, deportistas,
clubes y gimnasios). Maneja **datos de salud**: un error de aislamiento entre tenants o
de acceso a pacientes es lo más grave que puede pasar. Las decisiones están en
`docs/decisions/` (ADRs) y el modelo en `docs/architecture/data-model.md`.

## 1. Multi-tenancy y acceso (bloqueante)

- Toda tabla de negocio nueva tiene `tenant_id` + `region`, `ENABLE` **y** `FORCE ROW
  LEVEL SECURITY`, y la policy `tenant_isolation` con `USING` y `WITH CHECK`.
- Los GRANT al rol `nutreitor_app` son los mínimos: append-only = sólo `SELECT, INSERT`.
  Las tablas de control plane no tienen GRANT al rol app.
- `tenant_id` y `region` salen del contexto (`tenantDb.context`), **nunca** del request.
- Los servicios corren dentro de `tenantDb.run()`. Lo que toca un paciente llama a
  `assertCanAccessPatient` (el profesional sólo ve a sus **asignados**; 404, no 403).
- Una FK hacia otra tabla del tenant (sede, grupo, paciente) se valida bajo RLS antes
  de escribir: la FK corre como owner y no ve el aislamiento.
- Endpoints con `JwtAuthGuard` + `CapabilityGuard` y `@RequireCapability` acorde
  (ver `packages/shared/src/auth/capabilities.ts`). El portal nunca expone notas
  clínicas ni campos que el profesional no marcó visibles.

## 2. Datos y validación

- La entrada se valida con Zod en `packages/shared` (`ZodValidationPipe`), con topes
  de tamaño en arrays, strings y jsonb.
- Lo calculado (antropometría, requerimiento, ingesta) se guarda como **entrada** y se
  calcula al leer con funciones puras en `packages/shared`. Señalá si un PR empieza a
  guardar resultados derivados.
- Las mutaciones relevantes se auditan (`audit.recordForSession`) con una acción tipada.
- Fechas de día (`YYYY-MM-DD`) se tratan como locales en la UI (`new Date("2026-10-01")`
  es medianoche UTC y en Argentina muestra el día anterior).

## 3. Tests

- Una tabla o un servicio nuevo trae un e2e contra Postgres real con el rol app que
  cubre **scoping** (profesional no asignado → 404) y **RLS** (otro tenant no ve nada).
- Fórmulas clínicas: tests con valores de una implementación independiente.

## 4. Documentación viva (`CLAUDE.md`)

- Tabla nueva o cambiada → `docs/architecture/data-model.md` (tabla, notas de RLS y
  `erDiagram`).
- Flujo de negocio nuevo o cambiado → `docs/flows/`.
- Decisión con trade-offs → ADR nuevo en `docs/decisions/` y la fila en el README.

## 5. Producto

- Textos de la UI en español de Argentina (voseo), dirigidos al sector deportivo.
- Mobile: nada que fuerce scroll horizontal de la página.
- Contenido clínico (fórmulas, umbrales, referencias): **no lo corrijas por tu cuenta**;
  si algo te parece dudoso, preguntalo citando la fuente que esperarías.

## Formato

- Comentarios en línea para lo puntual, con la sugerencia concreta.
- Un comentario general al final: primero lo **bloqueante** (seguridad, aislamiento,
  datos), después lo importante y por último lo menor. Si no hay nada que objetar,
  decilo en una línea.
