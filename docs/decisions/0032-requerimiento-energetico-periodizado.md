# 0032 — Requerimiento energético con periodización deportiva

- **Estado**: aceptada
- **Fecha**: 2026-10-20

## Contexto

El plan alimentario compara el total del día contra un objetivo (`targets`), pero ese
objetivo se escribía a mano. Todos los softwares de nutrición calculan el
requerimiento, y en el sector deportivo además se trabaja por **tipo de día**: un día de
partido, uno de doble turno y uno de descanso no llevan la misma energía ni los mismos
carbohidratos.

## Decisión

- **Gasto en reposo (GER)** con cuatro fórmulas a elegir, comparadas en pantalla:
  Mifflin-St Jeor (1990), Harris-Benedict revisada (Roza y Shizgal, 1984), FAO/OMS/UNU
  (1985, por franja de edad desde los 3 años: cubre juveniles) y **Cunningham (1980)**,
  que usa la masa libre de grasa. La masa libre de grasa sale de la última
  antropometría ISAK ([ADR 0030](0030-antropometria-isak.md)): peso × (1 − % graso
  Durnin-Womersley, o Yuhasz si no aplica). Si hay masa libre de grasa, Cunningham es la
  fórmula sugerida.
- **Gasto del día** = GER × factor de actividad **sin el entrenamiento** + Σ (MET − 1)
  × peso × horas de cada sesión. Se suma MET − 1 porque el reposo ya está contado. Los
  MET salen del Compendio de Actividades Físicas (Ainsworth 2011), con un catálogo de
  deportes y la opción de cargar un MET propio.
- **Tipos de día** (hasta 7): cada uno con sus sesiones y CHO y PRO en **g/kg**. La
  grasa es el resto de la energía. Hay avisos (no bloquean) si la grasa queda fuera de
  20–35 % o si CHO + PRO superan la energía. Los rangos de referencia son los de la
  posición ACSM/AND/DC 2016. Hay un ajuste global en % para déficit o superávit.
- **Semana tipo** opcional: qué tipo de día es cada día, con el promedio semanal.
- **Se guardan las entradas, no los resultados**, como en la antropometría: los
  cálculos son funciones puras en `packages/shared` (`energyResults`). La versión guarda
  el peso, la talla y la masa libre de grasa usados, así la prescripción es reproducible
  aunque después cambie el peso.
- **Append-only**: tabla `energy_requirements` (sin UPDATE ni DELETE para el rol app).
  Cada ajuste es una versión nueva; la última es la vigente.
- **Plan**: el editor trae los objetivos del requerimiento vigente. Un tipo de día va al
  objetivo diario. En un plan semanal, "Aplicar la semana tipo" carga un **objetivo por
  día** (`dayTargets`, campo nuevo y opcional del layout `week`). El día sin objetivo
  propio usa el diario.
- **Permisos y scoping**: los del plan (`plan:read`, `plan:write`; profesional →
  asignados).

## Alternativas descartadas

- **Factor de actividad único (GER × 1,7)**: esconde el entrenamiento y no distingue el
  día de partido del de descanso.
- **Macros en % de la energía**: en deporte se prescribe en g/kg. El % se muestra como
  resultado.
- **Guardar los resultados**: congelaría un error de coeficiente. Las fórmulas tienen
  tests con valores de una implementación independiente.
- **Recalcular con el peso actual**: la prescripción cambiaría sola. El peso nuevo se
  sugiere al ajustar, y así queda una versión nueva.

## Consecuencias

- El objetivo del plan deja de ser un número suelto: tiene fórmula, sesiones y versión.
- Las ecuaciones de gasto específicas de deportistas (ten Haaf, De Lorenzo) y el gasto
  medido con wearables quedan para después.
- NUTRI sigue usando el objetivo diario del plan.
