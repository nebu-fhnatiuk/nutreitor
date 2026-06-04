-- ─────────────────────────────────────────────────────────────────────────────
-- 0022_scheduling — agendamiento (motor propio, tenant-scoped bajo RLS).
--
-- Dos tablas:
--   - availability_rules: ventanas de disponibilidad SEMANAL del profesional
--     (por membership), con su huso IANA. Los slots se derivan de acá.
--   - appointments: citas. `starts_at` en UTC (timestamptz); la conversión a huso
--     es de presentación. No-overlap por profesional forzado a nivel DB con un
--     EXCLUDE gist (requiere btree_gist para la igualdad de membership_id).
--
-- Invariantes: UTC en storage, conversión en presentación, DST por país (lo
-- resuelve la capa de slots con la librería de husos; la DB sólo guarda instantes).
-- ─────────────────────────────────────────────────────────────────────────────

-- btree_gist habilita operadores de igualdad (=) dentro de un índice gist, que el
-- EXCLUDE de abajo necesita para combinar `membership_id =` con `rango &&`.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── enums ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE appointment_status AS ENUM ('booked', 'cancelled', 'completed', 'no_show');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  -- Origen de la reserva (traza, análogo a recorded_by_role de las métricas).
  CREATE TYPE appointment_booked_via AS ENUM ('professional', 'patient', 'public');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── availability_rules ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS availability_rules (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL,
  region        region      NOT NULL,
  membership_id uuid        NOT NULL,
  -- Huso IANA en el que el profesional define sus horarios (ej. America/Argentina/Buenos_Aires).
  timezone      text        NOT NULL,
  -- Día de la semana ISO: 1=lunes … 7=domingo.
  weekday       smallint    NOT NULL,
  -- Minutos desde medianoche, en el huso del profesional.
  start_minute  smallint    NOT NULL,
  end_minute    smallint    NOT NULL,
  -- Largo del slot en minutos (granularidad de la agenda).
  slot_minutes  smallint    NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT availability_rules_weekday_chk   CHECK (weekday BETWEEN 1 AND 7),
  CONSTRAINT availability_rules_window_chk    CHECK (start_minute >= 0 AND start_minute < end_minute AND end_minute <= 1440),
  CONSTRAINT availability_rules_slot_chk      CHECK (slot_minutes BETWEEN 5 AND 480),
  CONSTRAINT availability_rules_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT availability_rules_membership_id_fk
    FOREIGN KEY (membership_id) REFERENCES memberships (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS availability_rules_membership_idx
  ON availability_rules (membership_id, weekday);

GRANT SELECT, INSERT, UPDATE, DELETE ON availability_rules TO nutreitor_app;

ALTER TABLE availability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_rules FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON availability_rules
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ── appointments ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointments (
  id                        uuid                    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid                    NOT NULL,
  region                    region                  NOT NULL,
  patient_id                uuid                    NOT NULL,
  membership_id             uuid                    NOT NULL,
  -- Inicio y fin como instantes UTC. Se guardan ambos (no la duración) para que
  -- el rango del EXCLUDE sea IMMUTABLE: `timestamptz + interval` es STABLE (depende
  -- del huso de sesión) y Postgres no lo admite en un índice. La app fija
  -- ends_at = starts_at + duración; la duración se deriva en presentación.
  starts_at                 timestamptz             NOT NULL,
  ends_at                   timestamptz             NOT NULL,
  status                    appointment_status      NOT NULL DEFAULT 'booked',
  booked_via                appointment_booked_via  NOT NULL DEFAULT 'professional',
  created_by_membership_id  uuid,
  notes                     text,
  created_at                timestamptz             NOT NULL DEFAULT now(),
  CONSTRAINT appointments_time_chk CHECK (ends_at > starts_at),
  CONSTRAINT appointments_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT appointments_patient_id_fk
    FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
  CONSTRAINT appointments_membership_id_fk
    FOREIGN KEY (membership_id) REFERENCES memberships (id) ON DELETE RESTRICT,
  -- No dos citas RESERVADAS del mismo profesional que se solapen en el tiempo.
  -- `&&` sobre el rango [starts_at, ends_at) detecta solapamiento. Sólo aplica a
  -- status='booked' (canceladas/completadas no bloquean). tstzrange(ts,ts) es
  -- IMMUTABLE, requisito del índice.
  CONSTRAINT appointments_no_overlap EXCLUDE USING gist (
    membership_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status = 'booked')
);

CREATE INDEX IF NOT EXISTS appointments_membership_starts_idx
  ON appointments (membership_id, starts_at);
CREATE INDEX IF NOT EXISTS appointments_patient_idx
  ON appointments (patient_id, starts_at);

-- Sin DELETE: una cita no se borra, se cancela (status). Historia preservada.
GRANT SELECT, INSERT, UPDATE ON appointments TO nutreitor_app;

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON appointments
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
