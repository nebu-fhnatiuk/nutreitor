# Validación — requerimiento energético

Caso para cruzar con tu planilla ([ADR 0032](../decisions/0032-requerimiento-energetico-periodizado.md)).
Los valores salen de `packages/shared/src/energy.ts` y los tests
(`apps/api/test/energy.spec.ts`) los comparan contra una implementación
independiente en Python.

**Futbolista**: varón, 24 años, 74,2 kg, 178,4 cm, masa libre de grasa 64,2 kg
(antropometría: 13,5 % graso por Durnin-Womersley).

## Gasto en reposo

| Fórmula | App | Tu planilla |
|---|---|---|
| Mifflin-St Jeor | 1742 kcal | |
| Harris-Benedict revisada | 1802 kcal | |
| FAO/OMS/UNU (18–30) | 1814 kcal | |
| Cunningham (500 + 22 × MLG) | 1912 kcal | |

## Tipos de día (Mifflin, factor 1,5, sin ajuste)

| Día | Sesiones | Objetivo | CHO | PRO | Grasa |
|---|---|---|---|---|---|
| Entrenamiento | fútbol 90 min (7 MET) + musculación 30 min (6 MET) | 3466 kcal (2613 + 853) | 445 g (6 g/kg) | 134 g (1,8 g/kg) | 128 g (33 %) |
| Partido | fútbol 95 min (10 MET) | 3670 kcal (2613 + 1057) | 594 g (8 g/kg) | 134 g | 85 g (21 %) |
| Descanso | — | 2613 kcal | 223 g (3 g/kg) | 134 g | 132 g (45 %, avisa) |

Semana tipo de 4 entrenamientos, 1 partido y 2 descansos: **3251 kcal/día** de promedio.

## Qué conviene revisar

- Las sesiones suman **(MET − 1) × peso × horas**: el reposo ya está en GER × factor.
- El factor de actividad es **sin el entrenamiento** (1,2 sedentaria · 1,4 ligera · 1,6
  activa).
- Los MET del catálogo (Compendio 2011), sobre todo los de los deportes que más usás.
