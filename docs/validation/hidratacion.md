# Validación — hidratación

**Estado: a confirmar** (KAN-58). Las fórmulas son aritmética directa; lo que hay que
confirmar son las **referencias** del plan de líquidos, que están en
`packages/shared/src/hydration.ts`.

## Caso: futbolista, 90 min con calor

Peso antes 74,2 kg · después 72,5 kg · tomó 750 ml · no orinó · 31 °C.

| Resultado | App | Tu planilla |
|---|---|---|
| Pérdida de peso | 1,70 kg (2,3 %) | |
| Sudor total | 2,45 L | |
| Tasa de sudoración | 1,63 L/h | |
| Repuso | 31 % del sudor | |
| Antes | 350–500 ml unas 4 h antes | |
| Durante | al menos 650 ml/h para no pasar el 2 % | |
| Después | 2150–2550 ml | |
| Sodio | sí (tasa ≥ 1,2 L/h) | |

## Referencias a confirmar

| Qué | Criterio en la app | Fuente que usé |
|---|---|---|
| Umbral de deshidratación | aviso por encima del 2 % del peso | ACSM 2007 |
| Antes de la sesión | 5–7 ml/kg unas 4 h antes | ACSM 2007 |
| Durante | lo necesario para no superar el 2 % en una sesión igual | criterio de la app a partir del 2 % |
| Después | 1,25–1,5 L por kg perdido | Shirreffs 1996 |
| Sodio | sesión de 2 h o más, o tasa de 1,2 L/h o más | criterio de la app |
| Error de tipeo | se rechaza más de 5 kg de diferencia entre antes y después | criterio de la app |
