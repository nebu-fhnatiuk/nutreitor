# 0015 — Agentes del paciente: CHEF y PSICO supervisado, con consentimiento

- **Estado**: aceptada
- **Fecha**: 2026-06-05

## Contexto

Los ADRs [0013](./0013-agentes-servicio-ia.md)/[0014](./0014-inferencia-bedrock-y-controles-de-costo.md)
dejaron el servicio de agentes con NUTRI y CHEF **del lado del profesional**. Al
revisar el modelo de producto con la dueña, quedó claro que **CHEF y PSICO son del
lado del PACIENTE** (le hablan directo en su portal), mientras **NUTRI sigue siendo
una herramienta del profesional** (su output es un borrador que él revisa).

Esto cambia el riesgo: un agente que le habla **directo al paciente** —y más PSICO,
sobre salud mental— ya no tiene a un profesional filtrando cada respuesta. Hay que
fijar quién puede usar qué, con qué resguardos, antes de exponerlo.

## Decisión

### Reparto de agentes

- **NUTRI** → profesional (`agent:use`), sobre un paciente asignado. Sin cambios.
- **CHEF** y **PSICO** → paciente (`portal:agent` nueva), sobre la **propia ficha**.
  Se quitó CHEF del lado del profesional.

El gateway tiene dos caras: `POST /agents/chat` (profesional, sólo `nutri`) y
`POST /portal/agents/chat` (paciente, sólo `chef`/`psico`). El endpoint del paciente
**nunca recibe un patientId**: resuelve "mi ficha" por la sesión (igual que el resto
del portal).

### PSICO es supervisado (human-in-the-loop)

- Sólo se habilita si el paciente tiene un **profesional asignado activo** que pueda
  acompañar; si no, se rechaza con un mensaje claro.
- **Todas** las conversaciones del paciente (CHEF y PSICO) son **visibles para el
  profesional asignado** (`GET /agents/conversations`), bajo el mismo scoping
  assigned-only del resto de la ficha.

### Consentimiento explícito (opt-in)

- Antes del primer uso, el paciente acepta un **consentimiento informado** (no es
  terapia / no es emergencia / su profesional puede ver las charlas). Se registra en
  `agent_consents` (versión + fecha) — dato sensible, **Ley 25.326**.
- El gateway exige el consentimiento vigente antes de habilitar cualquier chat del
  portal.

### Guardrail de crisis (PSICO) — DOBLE CAPA

- **Capa 1 — input del paciente (PRE-inferencia)**: antes de llamar a cualquier
  provider, una heurística es-AR detecta señales de crisis (autolesión/suicidio).
- **Capa 2 — output del modelo**: la MISMA heurística se aplica a la respuesta generada
  antes de devolverla; si el texto del modelo toca temas de riesgo, no se devuelve y se
  dispara el guardrail. (Endurecimiento 2026-06-05: antes sólo se evaluaba el input.)
- La heurística es **deliberadamente sensible** (preferimos falso positivo) y trabaja
  **normalizada** (minúsculas + sin acentos) para no escaparse por tildes/variantes
  ("no doy más", "hacerme daño", etc.). El corte heurístico va **SIEMPRE primero**;
  queda un **gancho** (`_model_crisis_classifier`, hoy no-op) para sumar, con Bedrock
  activo, un clasificador del propio modelo como segunda señal.
- En crisis NO se sigue la charla normal: se responde con **contención + recursos de
  emergencia** (AR: 135 / 0800-345-1435 / 911 / SAME 107) y el run queda
  `status = 'crisis'`.
- El profesional asignado ve la conversación **marcada como crisis** en la ficha. (La
  notificación *activa* —email/push— queda pendiente: hoy no hay worker; se asienta y
  se hace visible.)

### Minimización de datos por agente (allow-list)

Cada agente recibe **sólo** los campos del contexto clínico que necesita para su
función (no el dict crudo completo) — principio de minimización, defendible bajo Ley
25.326:

- **NUTRI** (profesional): nombre, objetivo, motivo, plan (título/versión), métricas.
- **CHEF** (recetas): nombre, preferencias/restricciones, alergias, plan (con `body`).
- **PSICO** (habla con el paciente): **contexto MÍNIMO** — sólo nombre y objetivo
  general. **NO** alergias, **NO** plan, **NO** métricas, **NO** motivo de consulta.

> **A RATIFICAR (decisión clínica de Matías): qué contexto recibe PSICO.** Se
> implementó el **default mínimo**; si se ratifica distinto, cambiar la allow-list en
> `apps/agents/app/main.py` (`_AGENT_CONTEXT_FIELDS`) y este ADR.

## Consecuencias

- **A favor**: el paciente tiene asistentes útiles sin perder la red de un profesional;
  la crisis se corta de forma robusta y barata (antes de gastar en inferencia); el
  consentimiento queda auditado.
- **En contra / pendiente**: la detección por keywords tiene falsos positivos/negativos
  (un clasificador del provider real la mejora, pero el corte por keywords va SIEMPRE
  primero como red de seguridad); la notificación al profesional es pasiva (visible en
  la ficha) hasta que haya worker; los recursos de emergencia están hardcodeados a AR
  (configurables por región del tenant a futuro).
- **Modelo de datos**: nueva tabla `agent_consents` (tenant-scoped, RLS). La crisis NO
  agrega tabla: se asienta como `agent_runs.status = 'crisis'` (append-only), que el
  profesional lee bajo su scoping.

## Alternativas descartadas

- **PSICO autónomo** (cualquier paciente, sin profesional en el loop): más alcance,
  pero traslada toda la responsabilidad clínica al producto. Descartado por riesgo.
- **Sin consentimiento, sólo disclaimer**: más liviano, pero insuficiente para dato
  sensible bajo Ley 25.326.
- **Marcar la crisis mutando la conversación**: obligaría a dar UPDATE al rol del
  servicio; se prefirió el run append-only.
