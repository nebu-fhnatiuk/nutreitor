# 0013 — Agentes de IA: servicio Python, gateway Nest, RLS y guardrails

- **Estado**: aceptada (en construcción por fases)
- **Fecha**: 2026-06-04

## Contexto

El producto reserva agentes **CHEF / NUTRI / PSICO** (slot vacío en
`apps/api/src/agents`). Es el **primer microservicio real** que extraemos (ver el
ADR [`0012`](./0012-modular-monolith-evolucion-a-servicios.md)): corre en un
servicio separado, runtime distinto (Python), y es **sensible** (IA en salud). Hay
que fijar arquitectura, postura de datos y seguridad **antes** de construir.

Decisiones de producto tomadas (con la dueña):

- **Proveedor / PHI**: **Claude (Anthropic) bajo BAA** — se le puede enviar contexto
  clínico una vez firmado el BAA.
- **Primer agente**: **NUTRI** (asiste al profesional; output revisado antes de
  aplicar → bajo riesgo).
- **Camino**: ADR + arrancar Fase 1.

## Decisión

### Topología

- **Servicio Python (FastAPI)** en contenedor propio (Fargate, subnet privada).
  Reemplaza el README del slot `apps/agents`. El front **nunca** habla directo.
- **Gateway en NestJS** (`apps/api/src/modules/agents`): aplica auth + capacidad
  (`agent:use`) + contexto de tenant como cualquier ruta; **firma un token de
  contexto** (HMAC+TTL: `tenantId`, `region`, `userId`, `role`, `exp`) y reenvía la
  request al servicio Python (`AGENTS_SERVICE_URL`) con ese token en un header.
- El **servicio Python verifica la firma**, abre conexión a Postgres con el rol
  **`nutreitor_agents`** (equivalente a `nutreitor_app`, **sin `BYPASSRLS`**), hace
  `SET LOCAL app.current_tenant_id` por request y **lee bajo RLS** (plan/ficha/
  métricas del paciente en cuestión). Nunca ve otro tenant. Llama a la inferencia,
  persiste el mensaje + el run, y responde.

El **token de contexto firmado** es el contrato reusable de extracción de servicios
(ADR 0012): el mismo mecanismo servirá para los próximos servicios.

### Inferencia

- **Claude** (modelo más capaz disponible) con **prompt caching** (system + contexto
  estable cacheado). Cliente **abstraído** detrás de una interfaz: un **provider
  stub** para dev/tests (sin API key, sin PHI a la nube) y el provider real Anthropic
  detrás de config. PHI sólo viaja al proveedor **bajo BAA**.

### Datos (tenant-scoped, RLS) — migración `0023_agents`

- `agent_conversations` / `agent_messages`: hilo por agente y por paciente/pro.
- `agent_runs`: **audit append-only** de cada llamada (agente, modelo, tokens/costo,
  latencia, veredicto de guardrails, input redactado). Sólo `INSERT`+`SELECT`.
- `agent_escalations`: para PSICO (riesgo → handoff humano) — se agrega en su fase.
- Rol `nutreitor_agents`: `SELECT` sobre lo que lee (patients, meal_plans,
  patient_metrics, …) e `INSERT` sobre `agent_*`. Sujeto a RLS (sin bypass).

### Guardrails y seguridad

- Prompt acotado por agente; el agente sólo ve datos del **tenant + paciente** en
  cuestión (RLS). Nada de diagnóstico/medicación fuera de alcance.
- **NUTRI/CHEF**: el output lo **revisa/aprueba el profesional** antes de aplicarse.
- **PSICO** (fase final): detección de crisis → el bot **nunca resuelve solo**,
  muestra recursos y **escala al profesional**; requiere **consentimiento** del
  paciente.
- **Audit** de cada interacción; **rate-limit + tope de costo por tenant** (en el
  gateway **y** en el servicio Python, defensa en profundidad);
  disclaimers ("no reemplaza atención profesional").
- **Minimización de datos por agente** (allow-list): cada agente recibe sólo los campos
  que necesita, no el contexto crudo completo. PSICO = contexto mínimo. Detalle y
  "a ratificar" en el ADR [`0015`](./0015-agentes-del-paciente-psico-supervisado.md).
- **Crisis (PSICO) en doble capa** (input del paciente + output del modelo), heurística
  normalizada; ver `0015`. (Endurecimiento 2026-06-05.)

### Fases

1. **NUTRI** (profesional-facing) end-to-end: servicio + gateway + contexto firmado
   + rol/RLS + audit + guardrails + tope de costo. Un caso acotado.
2. **CHEF** (recetas/alternativas respetando alergias/preferencias/macros).
3. **PSICO** (último): conversacional paciente + crisis + escalamiento + consentimiento.

## Consecuencias

- **A favor**: primer servicio bien aislado y **RLS-nativo** (no ve cross-tenant);
  contrato de **contexto firmado** reusable para futuras extracciones; el front
  sigue hablando sólo con la API Nest (auth/capacidades uniformes).
- **En contra / deuda**: nuevo **toolchain Python** (Dockerfile, deps, lint/test
  propios, CI) que sumar; el **BAA** es un gate **legal** real previo a enviar PHI;
  sin API key no se ejerce inferencia real en dev → **provider stub**; hay que
  vigilar **costo/rate-limit**; **PSICO** exige su propio andamiaje de seguridad y no
  se libera sin él.

Encuadre de servicios en [`0012`](./0012-modular-monolith-evolucion-a-servicios.md).
