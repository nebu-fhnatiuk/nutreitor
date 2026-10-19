# Flujo: métricas de eficiencia

Para medir si la plataforma ahorra tiempo de verdad (Fase 4.4: "sin medirlo no se
puede afirmar que superamos a INDYA"). `GET /efficiency?days=30|90` (`patient:read`).

| Quién | Ve |
|---|---|
| Admin | una fila por quien atiende: profesionales activos y admins con pacientes asignados (Resumen → "Eficiencia del equipo") |
| Profesional | sólo su fila ("Hoy" → "Tus números") |
| Admin que atiende (org individual) | sólo su fila con `mine=true` ("Hoy" → "Tus números", [ADR 0026](../decisions/0026-profesional-independiente-org-de-una-persona.md)) |

## Métricas (por profesional, en el período)

| Métrica | Cómo se calcula |
|---|---|
| Armado de un plan | **Mediana** de segundos entre abrir el editor y guardar la versión (el editor lo manda al guardar; el servidor topea a 2 h). Versiones previas a la instrumentación no cuentan. |
| Partiendo de plantilla o NUTRI | De las versiones con origen registrado, % que partió de una plantilla o un borrador de NUTRI (vs. de cero o de la versión anterior). |
| Pacientes activos | Asignaciones activas con ficha activa. |
| Adherencia | Sobre lo registrado por sus pacientes (cumplí 1, en parte ½). |
| Tiempo de respuesta | **Mediana** entre el primer mensaje de cada ráfaga del paciente y la respuesta del profesional, en sus conversaciones privadas (ADR 0024). Las ráfagas sin respuesta se cuentan aparte ("pendientes"). |

Medianas y no promedios: un editor olvidado abierto o una respuesta de fin de semana
no deforman el número.

## Instrumentación

`meal_plans.edit_seconds` y `meal_plans.drafted_from` (`scratch` | `previous` |
`template` | `nutri`), migración 0036. El editor arranca en `previous` si revisa un
plan existente o `scratch` si es nuevo, y pasa a `template` / `nutri` al cargar una
plantilla o un borrador.
