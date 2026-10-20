# 0034 — Frecuencia de consumo por grupos (vs. GAPA)

- **Estado**: aceptada (referencias GAPA a confirmar)
- **Fecha**: 2026-10-20

## Contexto

El recordatorio de 24 h ([ADR 0033](0033-recordatorio-de-24-horas.md)) describe un día.
La **dieta habitual** se mira con un cuestionario de frecuencia de consumo, como hacen
los softwares del sector. En Argentina, la referencia para la población son las Guías
Alimentarias para la Población Argentina (GAPA, Ministerio de Salud, 2016).

## Decisión

- **21 items** agrupados como el gráfico de las GAPA: verduras y frutas; legumbres,
  cereales, papa, pan y pastas (con integrales y refinados por separado); lácteos;
  carnes y huevos; aceites, frutas secas y semillas; consumo opcional (azucarados,
  golosinas, panadería, fiambres); bebidas (agua, alcohol), y un grupo **deportivo**
  (bebidas deportivas y geles, suplementos proteicos). Cada item explica qué es una
  porción.
- **Respuesta**: una de las 9 categorías clásicas del cuestionario ("nunca" a "6 o más
  por día"), convertida a veces por semana, más las porciones de cada vez. Resultado:
  porciones por día y por semana.
- **Comparación con las GAPA**: verduras y frutas, lácteos, pescado, carne roja, huevo,
  agua, consumo opcional y alcohol (con un tope según el sexo de la ficha). Además, el %
  de integrales sobre el total de cereales. Lo no contestado no se evalúa.
- **Referencia, no objetivo**: las GAPA son para la población general. Para un
  deportista, el objetivo es su requerimiento ([ADR 0032](0032-requerimiento-energetico-periodizado.md)),
  y la UI lo aclara.
- **Lo carga el profesional**. Un cuestionario nuevo arranca con las respuestas del
  anterior: se cambia lo que cambió y se ve el "antes" de cada referencia.
- Se guardan las **respuestas**; los resultados se calculan al leer, con funciones
  puras en `packages/shared` (`food-frequency.ts`). Una corrección de la tabla de
  referencias alcanza a todos los cuestionarios. Tabla `food_frequency_surveys` bajo
  RLS, editable y borrable, con auditoría. Permisos del plan.

## Alternativas descartadas

- **Cuestionario semicuantitativo con nutrientes**: necesita porciones en gramos por
  item validadas para la población local. El análisis cuantitativo lo da el
  recordatorio de 24 h, con la base de alimentos.
- **Que lo complete el deportista desde el portal**: es un buen candidato, junto con
  formularios de anamnesis antes de la primera consulta. Queda para después.

## Consecuencias

- Los umbrales salen de las GAPA según se recuerdan, sin una fuente consultada en este
  trabajo. Están listados en [`docs/validation/frecuencia-de-consumo.md`](../validation/frecuencia-de-consumo.md)
  para que la nutricionista los confirme.
- El umbral de "consumo opcional" (más de 1 porción por día entre todos) es un criterio
  de la app: las GAPA dicen "limitar", sin número.
