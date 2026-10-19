# 0012 — Modular monolith ahora, evolución incremental a servicios

- **Estado**: aceptada
- **Fecha**: 2026-06-04

## Contexto

La **arquitectura objetivo** del producto es **orientada a servicios** (decisión de
estándar/convicción, no por un disparador puntual de hoy). El estado actual es un
**modular monolith**:

- **1 API NestJS** (`apps/api`) con módulos por *bounded context* (auth,
  organizations, patients, scheduling, portal, public, members, invitations) — un
  proceso, un deployable.
- **Web Next.js separado** (`apps/web`) — ya hay split edge ↔ API.
- **Servicio de agentes Python reservado** y desacoplado (`apps/api/src/agents`,
  slot vacío) — la primera frontera de servicio decidida de entrada.
- **1 Postgres** multi-tenant POOL + RLS; contratos compartidos en `packages/shared`.

No hay hoy un disparador concreto (escala despareja, equipos múltiples, requisito
de aislamiento físico) que justifique partir en microservicios.

## Opciones consideradas

1. **Microservicios ya**: máxima separación, pero prematura para un producto único
   con equipo chico — paga el "tax" completo (sagas, propagación de contexto, ops ×
   N, IaC, observabilidad distribuida) sin un beneficio que lo amortice todavía.
2. **Modular monolith indefinido**: simple, pero sin disciplina las fronteras se
   erosionan y la migración futura se vuelve cara/improbable.
3. **Modular monolith "service-ready", extracción por disparadores** *(elegida)*:
   se mantiene el monolito modular y se alcanza la arquitectura objetivo
   **incrementalmente**, extrayendo un contexto cuando se cumple un disparador real.

## Decisión

**Opción 3.** Mantener el modular monolith **ahora**; la arquitectura objetivo
sigue siendo orientada a servicios y se alcanza **extrayendo contextos de a uno**
cuando aplique un disparador — no de un big-bang. Para que la extracción sea barata,
se sostienen **costuras afiladas** y se definen **disparadores** explícitos.

### Reglas para mantener las costuras (disciplina)

- Un módulo **no** lee las tablas de otro contexto a mano: cruza por el
  service/interface del dueño. (Deuda actual a contener: hay JOINs cross-context por
  conveniencia —ej. `scheduling` joinea `users`/`patients`/`memberships` para
  nombres; `portal` lee `patients`/`meal_plans`—. Normal en un monolito; al extraer
  se reemplazan por una API call o una proyección/réplica de lectura.)
- El **contexto de tenant** viaja por un único mecanismo (JWT → ALS → GUC
  `app.current_tenant_id` → RLS). Al extraer, eso pasa a **contexto firmado
  propagado** (HMAC+TTL / mTLS) — ya existe la costura edge↔API (`x-internal-secret`).
- Los **DTOs/contratos** de `packages/shared` son los contratos entre futuros
  servicios: cambios con versionado, no romper consumidores.
- Cada tabla lleva `tenant_id` + `region` (ya): un servicio extraído **se lleva sus
  tablas** sin romper el aislamiento, y cada servicio usa un rol `*_app` **sin
  `BYPASSRLS`** (RLS se mantiene por servicio).
- Diseñar para que las **transacciones vivan dentro de un contexto**: minimizar
  flujos que cruzan contextos en una sola tx (hoy son ACID bajo RLS; cruzarlos
  obligaría a sagas).

### Disparadores de extracción (extraer cuando se cumpla, no antes)

- **Runtime distinto**: agentes IA (Python) — el primer servicio por diseño.
- **Escala/tuning despareja**: un contexto necesita escalar o configurarse distinto
  (CPU/mem, tráfico anónimo, picos).
- **Blast radius**: un contexto cuyo fallo no debe tumbar el núcleo.
- **Ownership**: un equipo dedicado que necesita deployar solo.
- **Aislamiento duro**: residencia/compliance que exige separación física de un dato.

### Orden de extracción probable

1. **Agentes** (ya separado; runtime Python, consume el mismo Postgres bajo RLS).
2. **Capa pública / captación** (vidriera + reserva pública): tráfico **anónimo**,
   perfil de escala y seguridad distinto del workspace autenticado; candidato
   natural a aislar (y a poner rate-limiting propio — deuda ya anotada).
3. **Notificaciones / scheduling async** cuando entren recordatorios (cron/worker +
   cola).
4. El **núcleo clínico** (patients/plans/metrics/portal) queda último: comparte
   muchas transacciones ACID bajo RLS; es el corazón transaccional, no se fragmenta
   por moda.

### Topología destino (AWS, ya documentada como objetivo)

ALB/API-gateway → servicios en **Fargate** (subnets privadas) → Postgres con
**transaction pooling** (pgBouncer); **SQS/SNS** para lo async; secretos en
**Secrets Manager/SSM**. La API hoy es **stateless** → escala horizontal detrás del
ALB y aguanta mucho **antes** de necesitar partir nada.

## Consecuencias

- **A favor**: velocidad de entrega ahora; costo de extracción acotado y **por
  demanda**; sin pagar el tax de microservicios antes de tiempo; camino claro y
  reversible hacia la arquitectura objetivo.
- **En contra / costos**: exige **disciplina** (un JOIN cross-context "rápido" hoy es
  deuda de extracción mañana); la arquitectura objetivo se materializa **gradual**,
  no de golpe; hay que **revisar el disparador en cada sprint grande** y registrar la
  extracción cuando ocurra (nuevo ADR por servicio extraído).

Componentes y límites de aislamiento en
[`../architecture/overview.md`](../architecture/overview.md); modelo de datos
(tenant/region por tabla) en [`../architecture/data-model.md`](../architecture/data-model.md).

## Actualización (2026-10-19)

Lo que ya se separó: **agents** (Python), **worker** (notificaciones, ADR 0023) y
**site** (landing estática, ADR 0028), además de **web** y de la tarea de
**migraciones**. El núcleo clínico sigue siendo un monolito modular y no se parte.

Nuevo orden de extracción:

1. **control-plane** (alta de orgs, consola de plataforma, resolución pre-auth del
   login), **antes de producción**. Disparador: *blast radius*. Hoy la API clínica
   tiene credenciales `owner` (bypassa RLS) para estas operaciones; si se compromete,
   se lleva la llave de todos los tenants. Extraído, la API queda sólo con el rol
   `app`. Es la extracción más barata: casi no comparte transacciones con el núcleo.
2. **billing**, cuando haya precios: webhooks de terceros y datos de pago lejos de
   los de salud.
3. **integraciones** (wearables, balanzas de bioimpedancia), diferencial para el
   sector deportivo: ingesta con picos y dependencias externas que no deben afectar
   al núcleo.
4. **files**, **capa pública** (vidriera, reserva, consultas), **analytics** y
   **auditoría de lecturas**, cuando aparezca su disparador (adjuntos, tráfico
   anónimo, consultas pesadas, Fase 3).
