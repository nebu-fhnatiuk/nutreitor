# Flujo: agentes de IA (NUTRI / CHEF)

Asistentes que ayudan al **profesional** sobre un paciente. Viven en un **servicio
Python separado** (`apps/agents`) — la decisión de sacarlos del monolito y su
contrato están en el ADR
[`../decisions/0013-agentes-servicio-ia.md`](../decisions/0013-agentes-servicio-ia.md)
(seam de servicios: [`0012`](../decisions/0012-modular-monolith-evolucion-a-servicios.md)).
El front nunca habla directo con el servicio: pasa por el **gateway** Nest, que
valida sesión + acceso al paciente y reenvía con un **contexto de tenant firmado**.

Hoy hay dos agentes:

- **NUTRI** — asiste sobre la **evolución** del paciente e ideas de **ajuste del plan**.
- **CHEF** — traduce el **plan activo** a **recetas** concretas, respetando
  preferencias, restricciones y **alergias**.

Ambos producen un **borrador** que el profesional revisa: nunca se aplica solo.

Modelo (`agent_conversations`, `agent_messages`, `agent_runs`) y los GRANT del rol
`nutreitor_agents` en
[`../architecture/data-model.md`](../architecture/data-model.md).

## De punta a punta

```mermaid
flowchart TD
  subgraph web["Web (dock flotante en la ficha)"]
    A["el pro elige NUTRI o CHEF y escribe"] --> B["POST /agents/chat<br/>agent, patientId, conversationId?, message"]
  end
  B --> G{"Gateway Nest (capability agent:use)"}
  G --> H["scoping assigned-only: el paciente debe ser accesible<br/>admin = todos, profesional = sólo asignados"]
  H -->|no| H0["404 — no accesible"]
  H -->|sí| S["firma contexto HMAC+TTL<br/>tenantId, region, userId, role, exp"]
  S --> P["POST agents:8000/chat (header x-agent-context)"]
  P --> V{"servicio Python verifica la firma"}
  V -->|inválida o vencida| V0["401 — fail-closed, no abre tx"]
  V -->|ok| T["abre tx como nutreitor_agents (sin BYPASSRLS)<br/>SET LOCAL app.current_tenant_id"]
  T --> C["lee el contexto clínico bajo RLS<br/>(ficha, plan activo, evolución)"]
  C --> I["inferencia: provider stub en dev<br/>real Anthropic bajo BAA"]
  I --> W["persiste conversación + mensajes + run (audit)"]
  W --> R["responde conversationId + reply"]
```

- **Defensa en profundidad**: el gateway ya chequea el acceso al paciente *antes* de
  salir del proceso; el servicio igual opera bajo **RLS** con un rol propio
  (equivalente a `nutreitor_app`, sin BYPASSRLS), así un bug del gateway no alcanza
  para cruzar tenants. Sin contexto firmado válido y vigente **no hay tenant** y el
  servicio no abre nada.
- **Hilo**: cada `(agente, paciente)` mantiene su conversación; el front reusa el
  `conversationId` para continuar. En el dock, NUTRI y CHEF tienen hilos separados.

## Contexto clínico por agente

El servicio carga sólo lo que cada agente necesita (todo bajo RLS, vía el rol
`nutreitor_agents` que tiene `SELECT` acotado):

- **NUTRI**: nombre/objetivo del paciente, plan activo (título + versión), y las
  últimas mediciones (peso/fecha).
- **CHEF**: además del paciente y el plan, **lee el cuerpo del plan** (`body` jsonb,
  layouts `day`/`week`) para derivar las **comidas**, más `dietary_preferences` y
  `allergies` para respetarlas en las recetas.

## Provider de inferencia

Detrás de `INFERENCE_PROVIDER`. En dev/tests el provider es **stub**: ejercita todo
el pipeline (firma, RLS, contexto, persistencia, audit) **sin API key ni PHI a la
nube**. El provider real (Anthropic, con prompt caching) se enchufa **cuando esté
firmado el BAA** — es un gate legal, no técnico.

## Autorización y UI

- Capacidad **`agent:use`** (admin + profesional; el paciente no la tiene).
- UI: **dock flotante** ("✨ Asistentes") siempre visible en la ficha del paciente,
  con tabs **NUTRI / CHEF**. Cada respuesta se marca como **borrador · revisá vos**.

## Pendiente

PSICO (detección de crisis + escalamiento humano + consentimiento), provider real
bajo BAA, y hardening (rate-limit + tope de costo por tenant, pool de conexiones, CI
del toolchain Python).
