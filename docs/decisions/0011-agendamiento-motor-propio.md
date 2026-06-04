# 0011 — Agendamiento: motor propio (no Cal.com)

- **Estado**: aceptada
- **Fecha**: 2026 (Sprint 3 — agendamiento)

## Contexto

El agendamiento es el módulo que más esfuerzo esconde (husos, DST, disponibilidad,
no-overlap, reserva pública). Antes de implementar había una decisión abierta
(registrada en el stub `scheduling.module.ts`): **Cal.com self-hosted vs motor
propio**. El ROADMAP sugería "integrar Cal para arrancar".

## Opciones consideradas

1. **Cal.com self-hosted**: time-to-market alto (husos/DST/buffers/booking UI/
   notificaciones ya resueltos). Costos: las citas (un grafo sensible de quién se
   reúne con quién y cuándo) viven en **otra DB/Prisma, fuera de RLS** y del modelo
   `region`; su multi-tenancy (orgs) es un modelo distinto y en parte **comercial
   (EE)**; hay que correr/actualizar/asegurar otro servicio grande; integrar
   (webhooks/embeds) y mapear `tenant↔org` / `patient↔booking`; licencia **AGPL**
   en el core.
2. **Motor propio**: las citas son una tabla más tenant-scoped bajo RLS
   (residencia/`region`/audit/white-label nativos), atada directo a `patient_id` +
   `membership`. Costo: reimplementar la lógica de husos/DST/disponibilidad.

## Decisión

**Motor propio**, en MVP acotado. El producto está **arquitecturado alrededor de
RLS + residencia de datos**; meter el grafo de citas en un store paralelo sin RLS
contradice eso justo cuando el próximo eje es **compliance**. El costo de
integrar+operar+licenciar Cal no se justifica para un nutricionista independiente
con agenda simple (consultas 1:1). Lo verdaderamente difícil (DST por país) se
**delega a Luxon**, no se reimplementa a mano.

Forma concreta:

- `availability_rules` (disponibilidad semanal por `membership`, con huso IANA) +
  `appointments` (`starts_at`/`ends_at` en **UTC**; conversión en presentación).
- **No-overlap por profesional forzado por la DB**: `EXCLUDE USING gist`
  (`btree_gist`) sobre `tstzrange(starts_at, ends_at)` con `status='booked'`. Se
  guarda `ends_at` explícito porque `timestamptz + interval` no es `IMMUTABLE`
  (requisito del índice).
- Slots derivados puros (huso del pro → UTC), unit-tested incl. EDT/EST y el **gap
  de spring-forward** (que Luxon "forwardea": se descarta comparando el wall-clock).
- Reserva interna (pro/paciente con sesión, scoping assigned-only) y **pública**
  (vidriera, sin login, `runAs(org)`, lead → cita, audit con actor nulo).

## Consecuencias

- **A favor**: aislamiento/residencia nativos (auditable, regionable, promovible a
  SILO como el resto); white-label de la UI de reserva; vínculo directo a las
  entidades del dominio; sin servicio extra ni licencias.
- **En contra / deuda consciente**: reimplementamos husos (mitigado por Luxon); sin
  sync con Google/Outlook Calendar; **recordatorios** (necesitan cron/worker)
  diferidos — sólo confirmación al reservar; email real reusa el `ConsoleMailSender`
  (deuda, igual que invitaciones); **rate-limiting** de los endpoints públicos
  pendiente (riesgo de spam/denial-of-booking); el lead público se crea siempre
  nuevo (sin dedupe — lo reconcilia el profesional).

Detalle del modelo en [`../architecture/data-model.md`](../architecture/data-model.md);
flujo en [`../flows/scheduling.md`](../flows/scheduling.md).
