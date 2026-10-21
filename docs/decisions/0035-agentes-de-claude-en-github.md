# 0035 — Agentes de Claude en GitHub y chequeo de documentación viva

- **Estado**: aceptada
- **Fecha**: 2026-10-21

## Contexto

El equipo crece (se suma Emmanuel) y cada PR toca zonas sensibles: aislamiento entre
tenants, acceso a pacientes, datos de salud. Las reglas existen (ADRs, `CLAUDE.md`), pero
dependían de que quien revisa las recuerde. El equipo ya trabaja con Claude Code.

## Decisión

- **Revisor automático** (`.github/workflows/claude-review.yml`, Claude Code GitHub
  Action): revisa cada PR cuando se abre o sale de borrador, con el checklist de
  `.github/claude/review-checklist.md` (RLS y GRANTs, scoping de pacientes, validación,
  auditoría, tests de aislamiento, documentación viva, textos y mobile). Deja
  comentarios en línea y uno general ordenado por gravedad. Tiene permisos de **solo
  lectura** sobre el código; solo comenta.
- **Asistente a pedido** (`.github/workflows/claude.yml`): responde a `@claude` en
  issues, PRs y revisiones (por ejemplo "@claude revisá" para una segunda revisión,
  o "@claude implementá este issue"). Trabaja en una rama propia y abre PR, nunca
  empuja a `main`. La acción solo responde a quien tiene permiso de escritura.
- **Chequeo determinístico de documentación** (`scripts/check-docs.mjs`, job
  "Documentación viva" del CI): si un PR trae migraciones y no toca
  `docs/architecture/data-model.md`, o agrega un ADR sin su fila en el README, el CI
  falla. Escape explícito: `[sin-doc]` en la descripción del PR.
- **Credenciales**: el token de la suscripción de Claude (`claude setup-token` →
  secreto `CLAUDE_CODE_OAUTH_TOKEN`) o una API key (`ANTHROPIC_API_KEY`). Los agentes no
  tienen acceso a datos de producción ni a secretos de AWS.

## Alternativas descartadas

- **Revisar en cada push**: multiplica el costo. La segunda revisión se pide con
  "@claude revisá".
- **Chequear la documentación con el agente**: una regla fija es más barata, nunca se
  equivoca y no depende de un secreto.
- **Que el revisor apruebe o bloquee el merge**: la decisión sigue siendo humana; el
  revisor informa.

## Consecuencias

- Cada PR llega con una primera revisión contra las reglas del proyecto.
- El contenido clínico (fórmulas, umbrales) queda fuera de lo que los agentes pueden
  cambiar por su cuenta: lo dice el checklist y el prompt del asistente.
- Requiere instalar la app de Claude en el repo y cargar el secreto; sin eso, los dos
  workflows fallan sin afectar al CI.
