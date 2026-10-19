# Validación de las fórmulas de antropometría

**Estado: pendiente.** Hasta que la nutricionista valide estos casos contra su planilla
o software de referencia, `ANTHROPOMETRY_VALIDATED` queda en `false`: la UI marca los
cálculos como "en validación" y el portal del deportista no muestra resultados
([ADR 0030](../decisions/0030-antropometria-isak.md)).

Los resultados esperados salen de una implementación independiente (Python) de las
fórmulas publicadas, y son los mismos que verifican los tests
(`apps/api/test/anthropometry.spec.ts`). Las medidas son un valor final por sitio
(como si ya estuvieran promediadas las tomas).

## Medidas de entrada

| Sitio | Unidad | Futbolista (varón, 24 años) | Corredora (mujer, 31 años) |
|---|---|---|---|
| Masa corporal | kg | 74,2 | 56,8 |
| Talla | cm | 178,4 | 164,0 |
| Talla sentado | cm | 92,1 | 86,0 |
| Tríceps | mm | 7,5 | 12,0 |
| Subescapular | mm | 9,0 | 9,5 |
| Bíceps | mm | 4,0 | 6,0 |
| Cresta ilíaca | mm | 11,5 | 13,0 |
| Supraespinal | mm | 7,0 | 8,5 |
| Abdominal | mm | 12,0 | 14,0 |
| Muslo frontal | mm | 10,5 | 18,0 |
| Pantorrilla medial | mm | 6,0 | 10,0 |
| Brazo relajado | cm | 30,5 | 26,0 |
| Brazo flexionado y contraído | cm | 33,0 | 27,5 |
| Cintura (mínima) | cm | 78,0 | 66,0 |
| Cadera (máxima) | cm | 95,5 | 91,0 |
| Pantorrilla (máxima) | cm | 37,5 | 34,5 |
| Antebrazo (máximo) | cm | 27,5 | 23,5 |
| Tórax (mesoesternal) | cm | 96,0 | 84,0 |
| Muslo medio | cm | 55,5 | 51,0 |
| Cabeza | cm | 57,0 | 55,0 |
| Húmero (biepicondilar) | cm | 7,0 | 6,0 |
| Biestiloideo | cm | 5,8 | 4,9 |
| Fémur (bicondilar) | cm | 9,8 | 8,7 |
| Biacromial | cm | 40,5 | 35,5 |
| Biiliocrestídeo | cm | 28,0 | 26,5 |
| Tórax transverso | cm | 29,5 | 25,5 |
| Tórax anteroposterior | cm | 19,5 | 17,0 |

## Resultados que calcula la app

| Resultado | Futbolista | Corredora | ¿Coincide con tu planilla? |
|---|---|---|---|
| Σ6 pliegues (mm) | 52,0 | 72,0 | |
| Σ8 pliegues (mm) | 67,5 | 91,0 | |
| % graso Durnin-Womersley + Siri | 13,5 | 25,6 | |
| % graso Yuhasz | 8,1 | 14,7 | |
| % graso Faulkner | 11,2 | 12,5 | |
| Endomorfia | 2,2 | 3,2 | |
| Mesomorfia | 5,0 | 3,7 | |
| Ectomorfia | 2,5 | 2,7 | |
| Kerr · masa de piel (kg) | 3,97 | 3,16 | |
| Kerr · masa adiposa (kg) | 16,55 | 16,64 | |
| Kerr · masa muscular (kg) | 36,61 | 23,30 | |
| Kerr · masa residual (kg) | 8,62 | 5,26 | |
| Kerr · masa ósea (kg) | 8,61 | 6,16 | |
| Kerr · masa estimada (kg) | 74,36 | 54,52 | |
| Kerr · diferencia con la medida | +0,2% | −4,0% | |
| Índice músculo/óseo | 4,25 | 3,78 | |

## Qué conviene revisar especialmente

- **Faulkner**: la app usa supraespinal como el pliegue "suprailíaco" de la ecuación
  original. Confirmar que es el mismo criterio de tu planilla.
- **Somatotipo**: valores negativos se llevan a 0,1 (como la ectomorfía en la fórmula
  original). Confirmar que es el criterio que usás.
- **Kerr**: piel con superficie corporal de DuBois (constante 68,308) y grosor 2,07 mm
  (varones) / 1,96 mm (mujeres); residual escalada por talla sentado (Phantom 89,92 cm).
- **Durnin-Womersley**: tablas desde los 17 años; en menores no se calcula.

Cuando todo coincida (o con las correcciones aplicadas), se pasa
`ANTHROPOMETRY_VALIDATED` a `true` en `packages/shared/src/anthropometry.ts` y se
actualiza el estado de este documento.
