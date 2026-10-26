-- ─────────────────────────────────────────────────────────────────────────────
-- 0052_intake_auto — anamnesis automática antes de la primera consulta (KAN-90).
--
-- trigger:  quién originó el pedido. manual (lo pidió el profesional, KAN-60),
--           assignment (al asignarle un profesional) o booking (al reservar turno).
-- delivery: por dónde le llega al deportista. portal = ya tiene cuenta, aviso de
--           KAN-60; invitation = no tenía cuenta, el mail de la invitación al portal
--           lo menciona y lleva directo al formulario.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE intake_requests
  ADD COLUMN IF NOT EXISTS trigger text NOT NULL DEFAULT 'manual'
    CHECK (trigger IN ('manual', 'assignment', 'booking')),
  ADD COLUMN IF NOT EXISTS delivery text NOT NULL DEFAULT 'portal'
    CHECK (delivery IN ('portal', 'invitation'));

-- El scan de invitaciones del worker busca el pedido abierto del paciente invitado.
CREATE INDEX IF NOT EXISTS intake_requests_patient_open_idx
  ON intake_requests (patient_id)
  WHERE status = 'requested';
