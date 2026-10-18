# Flujo: notificaciones (worker)

Avisos fuera de la sesión: recordatorio de turno, mensaje del chat sin leer y
recordatorio diario de registro. Los genera y manda `apps/worker` (BullMQ sobre
Redis). Decisión y trade-offs en el
[ADR 0023](../decisions/0023-worker-de-notificaciones.md).

```mermaid
sequenceDiagram
  autonumber
  participant Q as Redis (BullMQ)
  participant W as Worker
  participant DB as Postgres (rol nutreitor_worker)
  participant M as Email (SES | consola)
  Q->>W: job "scan" (programado)
  W->>DB: worker_tenant_ids() — sólo ids
  loop por consultorio (withTenant → RLS)
    W->>DB: turnos en 20–26 h · mensajes sin leer ≥ 15 min · registro diario pendiente
    W->>DB: INSERT notifications … ON CONFLICT DO NOTHING (idempotencia)
    W->>Q: encola "deliver" por cada aviso nuevo (en la misma transacción)
  end
  Q->>W: job "deliver" (5 intentos, backoff)
  W->>DB: notifications pending? (FOR UPDATE)
  W->>M: envía
  W->>DB: status = sent (o attempts+1 / failed)
```

## Avisos

- **Turno** (al paciente, ~24 h antes): fecha, hora y profesional, en la zona
  horaria de la disponibilidad del profesional. Llave: id del turno.
- **Mensaje sin leer** (chat, ADR 0022): si pasan 15 min sin leer, al destinatario
  (paciente → profesionales asignados; equipo → paciente). **No incluye el
  mensaje**. Llave: paciente + destinatario + hasta dónde había leído → un aviso
  por ráfaga.
- **Registro diario** (opt-in en el portal: interruptor + hora; toma la zona horaria
  del dispositivo): pasada esa hora local, si tiene plan activo y no marcó ninguna
  comida del día. Llave: paciente + fecha.

## Preferencias

`GET/PUT /portal/me/notification-preferences` (`portal:read` / `portal:self_report`)
→ `notification_preferences` (opt-in, hora 0–23, zona horaria). Default: apagado.

## Operación

- Env: `DATABASE_WORKER_URL`, `REDIS_URL`, `WEB_URL_TEMPLATE`
  (`https://{slug}.nutreitor.com`), `MAIL_PROVIDER` (`console` | `ses`),
  `MAIL_FROM`, `AWS_REGION`, `SCAN_EVERY_MS`.
- `notifications` queda como registro de lo enviado (sin contenido), legible por la
  app para una futura vista de avisos.
