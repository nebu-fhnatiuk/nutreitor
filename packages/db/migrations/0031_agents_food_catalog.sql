-- ─────────────────────────────────────────────────────────────────────────────
-- 0031_agents_food_catalog — NUTRI lee el catálogo de alimentos (ADR 0020).
--
-- Para proponer un borrador de plan, el servicio de agentes elige alimentos del
-- catálogo global por slug. Es dato de REFERENCIA (sin tenant ni PHI): sólo lectura.
-- Los alimentos propios del consultorio y las recetas quedan fuera por ahora.
-- ─────────────────────────────────────────────────────────────────────────────

GRANT SELECT ON food_catalog TO nutreitor_agents;
