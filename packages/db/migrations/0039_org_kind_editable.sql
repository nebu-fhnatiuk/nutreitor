-- ─────────────────────────────────────────────────────────────────────────────
-- 0039_org_kind_editable — la admin cambia el tipo de su org (ADR 0026).
--
-- Un independiente que suma colegas pasa a `team` (y vuelve a `individual` si
-- queda sola). No es un dato que decida la plataforma: se suma al GRANT por
-- columna de 0038. El estado (`status`) sigue fuera del alcance del rol app.
-- ─────────────────────────────────────────────────────────────────────────────

GRANT UPDATE (kind) ON organizations TO nutreitor_app;
