# Validación — referencias GAPA de la frecuencia de consumo

**Estado: a confirmar.** Los umbrales salen de las Guías Alimentarias para la Población
Argentina (2016) según se recuerdan; no se consultó la fuente para esta implementación.
Están en `GAPA_RULES` (`packages/shared/src/food-frequency.ts`). Si alguno no coincide, se
corrige ahí y se recalculan todos los cuestionarios.

| Referencia | Umbral en la app | ¿Coincide? |
|---|---|---|
| Verduras y frutas | 5 porciones por día o más | |
| Leche, yogur y queso | 3 porciones por día | |
| Pescado | 2 veces por semana o más | |
| Carne roja | hasta 3 veces por semana | |
| Huevo | hasta 1 por día | |
| Agua | 8 vasos por día (2 litros) | |
| Alcohol | hasta 1 trago por día en mujeres y 2 en varones | |
| Consumo opcional (azucarados, golosinas, panadería, fiambres) | avisa con más de 1 porción por día entre todos (**criterio de la app**: las GAPA dicen "limitar") | |
| Cereales | se muestra el % de integrales; no se evalúa un umbral | |

Las categorías de frecuencia equivalen a: 1–3 por mes = 0,5 por semana; 2–4 por semana
= 3; 5–6 por semana = 5,5; 2–3 por día = 17,5 por semana; 4–5 por día = 31,5; 6 o más
por día = 42.

Faltan, a propósito, umbrales para legumbres, aceite crudo y frutas secas: las GAPA los
recomiendan, pero no recuerdo un número confiable. Si los tenés, se agregan.
