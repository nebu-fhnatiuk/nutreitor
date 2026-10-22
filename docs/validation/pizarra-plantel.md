# Validación — pizarra del plantel

**Estado: a confirmar** (KAN-70). Los umbrales del semáforo son referencias de trabajo
que elegí yo; están en `BOARD_THRESHOLDS` (`packages/shared/src/squad-board.ts`) y se
cambian en un solo lugar.

## Umbrales

| Aviso | Zona | Umbral en la app | Por qué | ¿Lo confirmás? |
|---|---|---|---|---|
| Días sin antropometría | en el límite | más de 30 días, o nunca medido | un control por mes en temporada | |
| Pérdida de peso en la prueba | en el límite | más de 2 % | mismo umbral que hidratación (ACSM 2007) | |
| Pérdida de peso en la prueba | fuera | más de 3 % | criterio de la app: deshidratación marcada | |
| Suba de Σ6 | en el límite | 2 mm o más contra la anterior | por debajo puede ser error técnico de medición | |
| Caída de adherencia | en el límite | 15 puntos o más de una semana a la otra | criterio de la app | |
| Adherencia baja | fuera | menos de 50 % en los últimos 7 días | criterio de la app | |

## Decisiones a revisar

- **"Sin medir" sólo mira antropometría.** Una prueba de sudoración no lo resetea.
- **La suba de Σ6 es siempre "en el límite".** No depende del objetivo del deportista:
  en alguien que busca ganar masa también avisa, para que lo mires.
- **La adherencia se calcula sobre lo registrado.** Igual que en la ficha: cumplí = 1,
  en parte = ½. Sin registros no avisa: no sabemos.
- **Orden.** Primero fuera de rango, después en el límite, después en rango. Dentro de
  cada zona va primero quien tiene más avisos, y después por nombre.
