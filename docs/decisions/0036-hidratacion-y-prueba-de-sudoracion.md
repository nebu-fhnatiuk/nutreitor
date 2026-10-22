# 0036 — Hidratación: prueba de sudoración y plan de líquidos

- **Estado**: aceptada (referencias del plan a confirmar)
- **Fecha**: 2026-10-22
- **Jira**: KAN-58

## Contexto

La hidratación es parte del trabajo diario con deportistas: cuánto suda cada uno, si
llega deshidratado al final de la sesión y cuánto tiene que tomar. En los clubes se mide
**a todo el plantel** en la misma sesión, pesando antes y después.

## Decisión

- **Prueba de sudoración** por deportista: peso antes y después de una sesión, líquido
  tomado y orina en el medio, duración y condiciones (temperatura, humedad,
  nombre de la sesión).
- **Resultados al leer**, con funciones puras en `packages/shared` (`sweatTestResults`):
  - pérdida de peso;
  - sudor = pérdida de peso + lo tomado − la orina (1 kg ≈ 1 L);
  - tasa en L/h;
  - % de pérdida sobre el peso antes, con aviso por encima del **2 %**;
  - % del sudor que repuso.

  También avisa si ganó peso (riesgo de hiponatremia en sesiones largas) o si los datos
  dan una pérdida de sudor imposible.
- **Plan de líquidos para una sesión igual**:
  - antes: 5–7 ml/kg unas 4 h antes (ACSM 2007);
  - durante: lo necesario para no superar el 2 % de pérdida;
  - después: 1,25–1,5 L por kg perdido (Shirreffs 1996);
  - sugiere sodio si la sesión dura 2 h o más, o si la tasa es de 1,2 L/h o más.

  Los volúmenes se redondean a 50 ml.
- **Por plantel**: una planilla con los datos de la sesión una sola vez y, por
  deportista, peso antes y después, lo tomado y la orina, con la tasa y el % en vivo.
  Mismas reglas que la antropometría de grupo ([ADR 0031](0031-grupos-y-carga-por-plantel.md)):
  una transacción, todo o nada, solo miembros visibles, borrador en el navegador. La
  prueba guarda el `group_id` (`ON DELETE SET NULL`: borrar el grupo no borra las
  pruebas). El detalle del grupo muestra la última prueba de cada deportista.
- Tabla `sweat_tests` con columnas tipadas (no jsonb) y `CHECK` de rangos, bajo RLS,
  editable y borrable, con auditoría. Permisos de las mediciones (`metric:read`,
  `metric:record`; profesional → asignados). Una diferencia de más de 5 kg entre antes y
  después se rechaza por error de tipeo.

## Alternativas descartadas

- **Guardar la tasa calculada**: una corrección de criterio no alcanzaría a las pruebas
  viejas.
- **Plan de líquidos fijo por kg**: ignora cuánto suda cada uno, que es justamente lo
  que mide la prueba.
- **Sodio en sudor**: necesita un análisis de laboratorio. Se puede agregar como campo
  opcional si aparece el caso.

## Consecuencias

- Las referencias (umbral del 2 %, 5–7 ml/kg, 1,25–1,5 L/kg, criterio de sodio) están en
  [`docs/validation/hidratacion.md`](../validation/hidratacion.md) para que la
  nutricionista las confirme.
