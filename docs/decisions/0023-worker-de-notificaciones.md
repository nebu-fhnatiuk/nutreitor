# 0023 — Worker de notificaciones: BullMQ, rol propio sin BYPASSRLS, SES

- **Estado**: aceptada
- **Fecha**: 2026-10-18

## Contexto

Fase 4.3 necesita avisos fuera de la sesión: recordatorio de turno (deuda de
agendamiento), aviso de mensajes sin leer del chat (ADR 0022) y un recordatorio
diario de registro de adherencia. Eso exige un proceso que corra solo, programado,
con reintentos, y que lea datos de **todos** los consultorios sin romper la regla de
que RLS es la barrera dura entre tenants.

## Decisión

### Proceso y cola

- `apps/worker` (Node 22) con **BullMQ** sobre el Redis que ya existe (ADR 0017).
  Escala y se despliega aparte de la API (otra tarea Fargate, sin puertos).
- Una cola `notifications` con dos tipos de job:
  - `scan` (programado, cada 5 min en prod): recorre los consultorios y genera avisos;
  - `deliver`: manda cada aviso (5 intentos, backoff exponencial).

### Acceso a datos

- Rol **`nutreitor_worker` sin BYPASSRLS**: recorre los consultorios uno por uno con
  `withTenant` (SET LOCAL), bajo las mismas policies que la API. GRANT de lectura
  acotado a lo que necesita para decidir y redactar; escribe sólo `notifications`.
- La lista de consultorios sale de `worker_tenant_ids()` (SECURITY DEFINER, sólo
  ids): lo único cross-tenant del worker. Sin tenant fijado, el rol no ve ninguna fila.

### Idempotencia y fallas

- `notifications` registra cada aviso **sin contenido** y es la llave de
  idempotencia: `UNIQUE (tenant, kind, ref_key, destinatario, canal)`.
- El registro y el **encolado van en la misma transacción**: si Redis falla, rollback
  y el próximo escaneo reintenta; si el commit falla después de encolar, la entrega
  no encuentra el registro (`pending`) y no manda nada. La entrega es *at-least-once*
  (si el email sale y falla la marca, puede repetirse).

### Avisos y contenido

| Aviso | Cuándo | A quién | Contenido |
|---|---|---|---|
| Turno | 20–26 h antes | paciente | fecha, hora, profesional (sin datos clínicos) |
| Mensaje sin leer | ≥ 15 min sin leer (últimas 48 h), uno por ráfaga | destinatario del chat | **sin el mensaje**: "X te escribió" + link |
| Registro diario | opt-in, pasada su hora local, sin comidas marcadas | paciente | link al portal |

### Canal

- **Amazon SES** (`MAIL_PROVIDER=ses`): misma cuenta e IAM de AWS; el nombre visible es
  el del consultorio. En dev, consola. WhatsApp queda como canal a enchufar.

## Alternativas descartadas

- **Llamar a la API interna** desde el worker: más superficie HTTP y la lógica de
  cada aviso partida en dos procesos.
- **Rol owner (BYPASSRLS)**: un bug en una query cruzaría consultorios.
- **pg-boss / cron en la API**: duplicación de jobs con varias instancias (cron) o
  carga extra en Postgres (pg-boss); Redis ya está.

## Consecuencias

- Producción necesita: dominio verificado en SES (salir del sandbox), el secreto del
  rol `nutreitor_worker` y `REDIS_URL` del worker.
- El contenido de cada aviso viaja en el job de Redis hasta entregarse (se borra al
  completarse); no se guarda en Postgres.
