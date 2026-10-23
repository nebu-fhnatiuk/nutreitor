# 0042 — Registro de lecturas de datos de salud

- **Estado**: aceptada
- **Fecha**: 2026-10-23
- **Jira**: KAN-23 (parte de KAN-6, legal y cumplimiento)

## Contexto

`audit_log` (0007) registra **cambios**: quién creó, editó o archivó algo. No registra
quién **vio** una ficha, un informe o una conversación. Con datos de salud (Ley 25.326,
datos sensibles) la organización tiene que poder responder "¿quién del equipo abrió
los datos de este deportista?". Es base para los consentimientos (KAN-26) y para la
retención (KAN-24).

## Decisión

- **Tabla propia `data_access_log`**, separada de `audit_log`: las lecturas son muchas
  más que los cambios y van a tener otra retención. Tenant-scoped por RLS (`tenant_id`
  + `region`), append-only por grant (el rol app sólo tiene `SELECT` + `INSERT`).
- **Qué se registra**: los GET del staff (admin y profesional) que devuelven datos de
  un deportista:
  - ficha;
  - notas;
  - asignaciones;
  - mediciones;
  - antropometría;
  - plan;
  - recordatorios de 24 h;
  - frecuencia de consumo;
  - pruebas de sudoración;
  - requerimiento energético;
  - adherencia;
  - lista de informes e informe;
  - mensajes de una conversación;
  - pizarra y resúmenes del plantel (por grupo, sin `patient_id`).
- **Qué no se registra**:
  - el deportista viendo lo suyo en el portal, que no es acceso de un tercero;
  - la lista de deportistas (sólo nombres);
  - las métricas de eficiencia del equipo (agregadas);
  - las conversaciones del profesional con sus asistentes.
- **Cómo**: un decorador `@LogsAccess(resource, { patientParam, targetParam })` en cada
  handler y un interceptor global que registra **después** de que el handler salió bien
  y **antes** de responder. Para los mensajes, el deportista se toma de la conversación.
  Agregar un endpoint de lectura de datos de salud implica marcarlo: el test
  `access-log.e2e.spec.ts` lista los marcados.
- **Fail-closed**: si no se puede registrar, la lectura falla. No hay acceso a datos de
  salud sin rastro.
- **Ventana de 15 minutos**: una fila por persona, recurso, deportista y objeto cada
  15 min (`window_start` + índice único `NULLS NOT DISTINCT` + `ON CONFLICT DO NOTHING`).
  El chat consulta cada pocos segundos (0022). Registrar cada consulta llenaría la tabla
  sin decir nada nuevo; para la pregunta "quién vio y cuándo", alcanza con la ventana.
- **Sin FK a `patients`**: el rastro tiene que sobrevivir al borrado o anonimización del
  deportista (KAN-24).
- **Consulta**:
  - `GET access-log?patientId=&before=&limit=` con `audit:read` (sólo admin), más nuevo
    primero y paginado por cursor;
  - en la web, "Quién vio esta ficha" dentro de la ficha clínica de la vista admin, con
    las lecturas agrupadas por visita (persona + ventana).

## Consecuencias

- Abrir una ficha deja varias filas, una por sección que carga la pantalla. Es lo que
  pasó: esos datos se mandaron al navegador.
- Cada lectura marcada suma un `INSERT` en su propia transacción. Es barato, y la
  deduplicación lo vuelve un no-op dentro de la ventana.
- Una lectura con el registro caído devuelve error. Se prefiere eso a un acceso sin rastro.
- Pendiente para KAN-24: cuánto tiempo se guardan estas filas y cómo se purgan (con el
  owner, nunca desde el runtime).
