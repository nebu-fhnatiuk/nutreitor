# Validación — catálogo de alertas clínico-nutricionales

**Estado: sección C validada** por Florencia Hnatiuk, nutricionista, el 2026-11-19 (PR #123). Las secciones A, B y D y el criterio de nivel siguen a confirmar (KAN-98, épica KAN-91). Es la lista inicial de reglas que va a
implementar el motor de alertas (KAN-97). El motor revisa el plan contra la ficha y
avisa con la fuente visible. Las alertas **no bloquean**: el profesional acepta o
descarta cada una y la decisión queda registrada. El LLM no decide nada; como mucho
redacta la explicación.

Las reglas, los umbrales y los textos los propuse yo como punto de partida. **Las
fuentes las cité de memoria**: antes de confirmar una regla hay que verificar la cita
(año, edición, página) y que diga lo que la regla le atribuye.

Cuando estén confirmadas, se pasan a código en `packages/shared` (KAN-97), con un
test por regla con casos positivos y negativos.

## Criterio de nivel

| Nivel | Cuándo | Cómo se ve |
|---|---|---|
| **Importante** | Hay un riesgo concreto para la salud o de sanción por dopaje: alérgeno declarado, interacción con consecuencia clínica, disponibilidad energética baja, sustancia prohibida. | Arriba del plan, en rojo. Para descartarla hay que escribir un motivo. |
| **Informativa** | El plan se aparta de una referencia o conviene ajustar un horario, sin riesgo inmediato. | En la lista de avisos. Se descarta con un clic. |

¿Lo confirmás? ______

## A. Alergias e intolerancias

> **Validada en [`alergenos.md`](alergenos.md)** (KAN-105) e implementada. A3 cambió: avisa si la comida tiene lactosa, sin contar gramos. La tabla de abajo queda como referencia de la propuesta original.

| ID | Salta cuando… | Umbral | Nivel | Texto del aviso | Fuente | ¿Lo confirmás? |
|---|---|---|---|---|---|---|
| A1 | Un alimento del plan contiene un alérgeno que figura en la ficha | Cualquier cantidad | Importante | "El plan incluye {alimento}, que contiene {alérgeno}. En la ficha figura alergia a {alérgeno}." | Código Alimentario Argentino, art. 235 séptimo (alérgenos de declaración obligatoria) | |
| A2 | Celiaquía en la ficha y un alimento del plan tiene TACC (trigo, avena, cebada, centeno) | Cualquier cantidad | Importante | "{alimento} contiene gluten (TACC). En la ficha figura celiaquía." | Ley 26.588 y CAA, art. 1383 (alimentos libres de gluten) | |
| A3 | Intolerancia a la lactosa en la ficha y el plan suma lactosa en una misma comida | Más de 12 g de lactosa por comida | Informativa | "La comida {comida} suma unos {g} g de lactosa. Con intolerancia suele tolerarse hasta unos 12 g por toma." | EFSA NDA Panel, 2010, *Scientific Opinion on lactose thresholds in lactose intolerance and galactosaemia* | |

## B. Interacciones fármaco-nutriente

> **En validación en [`medicacion.md`](medicacion.md)** (2026-11-21): medicación por código ATC, B6 y B7 esperan a KAN-59, y se suman B11–B14 (diuréticos, corticoides, anticonceptivos y antiepilépticos). La tabla de abajo queda como referencia de la propuesta original.

Requieren la medicación cargada por principio activo. Las de horario requieren
también a qué hora la toma.

| ID | Salta cuando… | Umbral | Nivel | Texto del aviso | Fuente | ¿Lo confirmás? |
|---|---|---|---|---|---|---|
| B1 | Levotiroxina y el plan pone calcio, hierro, soja o café cerca de la toma | Café a menos de 30–60 min; calcio o hierro a menos de 4 h | Informativa | "Toma levotiroxina a las {hora}. {Alimento o suplemento} a menos de {x} puede reducir su absorción." | Jonklaas et al., 2014, guía de la American Thyroid Association, *Thyroid* | |
| B2 | Anticoagulante antivitamina K (acenocumarol, warfarina) y el plan cambia mucho la vitamina K diaria frente al plan anterior | Variación de más del 50 % en vitamina K | Importante | "Toma {fármaco}. El plan cambia el aporte de vitamina K (verduras de hoja). Conviene mantenerlo estable, no eliminarlo." | Holbrook et al., 2005, *Arch Intern Med*, revisión de interacciones de la warfarina | |
| B3 | IMAO y el plan incluye alimentos ricos en tiramina (quesos estacionados, fiambres curados, fermentados) | Cualquier cantidad | Importante | "Toma un IMAO ({fármaco}). {Alimento} tiene tiramina y puede provocar una crisis hipertensiva." | Gillman, 2018, *J Neural Transm*, revisión sobre tiramina e IMAO | |
| B4 | Simvastatina, lovastatina o atorvastatina y el plan incluye pomelo | Cualquier cantidad | Informativa | "Toma {fármaco}. El pomelo aumenta su concentración en sangre." | Bailey et al., 2013, *CMAJ*, interacciones del pomelo con medicamentos | |
| B5 | Metformina hace más de un año | — | Informativa | "Toma metformina hace más de un año: conviene controlar la vitamina B12." | American Diabetes Association, *Standards of Care* (edición vigente) | |
| B6 | IECA, ARA II o espironolactona y el plan suma sales o suplementos con potasio | Cualquier suplemento de potasio | Importante | "Toma {fármaco} y el plan suma potasio extra ({suplemento}). Riesgo de hiperpotasemia." | Ben Salem et al., 2014, *Drug Safety*, hiperpotasemia por fármacos | |
| B7 | Isotretinoína y el plan suma un suplemento con vitamina A | Cualquier suplemento con vitamina A | Importante | "Toma isotretinoína. No sumar suplementos con vitamina A." | Prospecto aprobado por ANMAT | |
| B8 | Litio y el plan baja el sodio o hay pérdida alta por sudor en la prueba de sudoración | Sodio del plan bajo, o pérdida de más de 1 L/h | Importante | "Toma litio. Los cambios de sodio y la deshidratación modifican su nivel en sangre: coordinar con el médico." | Prospecto aprobado por ANMAT | |
| B9 | Quinolonas o tetraciclinas y el plan pone calcio, hierro, magnesio o zinc cerca de la toma | Menos de 2 h antes o 6 h después | Informativa | "Toma {antibiótico}. {Alimento o suplemento} cerca de la toma reduce su absorción." | Prospecto aprobado por ANMAT | |
| B10 | Inhibidores de la bomba de protones hace más de un año | — | Informativa | "Toma {fármaco} hace más de un año: conviene controlar B12, hierro y magnesio." | FDA Drug Safety Communication, 2011 (hipomagnesemia por IBP) | |

## C. Energía y macros frente al requerimiento

Usan el requerimiento calculado (ADR 0032, se valida en KAN-62), los macros del plan
y la masa libre de grasa de la última antropometría. **Ya existen todos los datos**,
así que son las primeras que se pueden implementar.

| ID | Salta cuando… | Umbral | Nivel | Texto del aviso | Fuente | ¿Lo confirmás? |
|---|---|---|---|---|---|---|
| C1 | La energía del plan se aparta del objetivo del tipo de día | Más de ±10 % (±15 % en días de descanso) | Informativa | "El plan aporta {kcal} kcal; el objetivo del día {tipo} es {objetivo} kcal ({desvío} %)." | Criterio de la app || ✓ |
| C2 | Disponibilidad energética baja: (ingesta − gasto del ejercicio) / kg de masa libre de grasa | Menos de 30 kcal/kg MLG/día | Importante | "Disponibilidad energética estimada de {x} kcal/kg MLG en el día {tipo}. Por debajo de 30 hay riesgo de REDs." | Mountjoy et al., 2023, consenso del COI sobre REDs, *BJSM* || ✓ |
| C3 | Igual que C2 | Entre 30 y 45 kcal/kg MLG/día, si el objetivo no es bajar peso | Informativa | "Disponibilidad energética estimada de {x} kcal/kg MLG: por debajo del nivel óptimo (45)." | Mountjoy et al., 2023, *BJSM* || ✓ |
| C4 | Proteína fuera del rango de referencia | Menos de 1,2 o más de 2,0 g/kg/día | Informativa | "El plan aporta {x} g/kg de proteína; la referencia para deportistas es 1,2–2,0 g/kg." | Thomas, Erdman y Burke, 2016, posición ACSM, AND y Dietitians of Canada || ✓ |
| C5 | Hidratos fuera de la banda según la carga de entrenamiento del día | Fuera de la banda de `MACRO_REFERENCE` (3–5, 5–7, 6–10 u 8–12 g/kg) | Informativa | "El día {tipo} aporta {x} g/kg de hidratos; para esta carga la referencia es {min}–{max} g/kg." | Thomas, Erdman y Burke, 2016 || ✓ |
| C6 | Grasa fuera del rango | Menos de 20 % o más de 35 % de la energía | Informativa | "La grasa aporta el {x} % de la energía; la referencia es 20–35 %." | Thomas, Erdman y Burke, 2016 || ✓ |

### Criterios de cálculo de la sección C (a confirmar)

Los umbrales están validados; estos criterios los elegí yo para poder calcularlos:

| Criterio | Cómo lo calcula la app | ¿Lo confirmás? |
|---|---|---|
| Qué se evalúa | El plan prescripto, no la ingesta real. El gasto del ejercicio es el estimado por MET del requerimiento: (MET − 1) × kg × h. | |
| Días sin macros completos | Si algún alimento del día no tiene kcal, el día no se evalúa (el total sería parcial) y se avisa que falta completar. | |
| Banda de hidratos (C5) | Por minutos de entrenamiento del tipo de día: 0 → 3–5 g/kg; hasta 60 → 5–7; hasta 240 → 6–10; más de 240 → 8–12. | |
| "Objetivo de bajar peso" (C3) | El ajuste del requerimiento es negativo (déficit). | |
| Día de descanso (C1) | El nombre del tipo de día dice "descanso" o "libre", o no tiene sesiones. | |
| Plan de día-tipo (sin semana) | Solo se evalúan C1, C4 y C6: sin semana tipo no se sabe qué entrenamiento corresponde. | |

## D. Suplementación y dopaje

Dependen del catálogo de suplementos de KAN-59. Hoy los suplementos de la ficha son
texto libre.

| ID | Salta cuando… | Umbral | Nivel | Texto del aviso | Fuente | ¿Lo confirmás? |
|---|---|---|---|---|---|---|
| D1 | Deportista con controles antidopaje y un suplemento sin certificación de terceros | Sin Informed Sport, NSF Certified for Sport ni Kölner Liste | Importante | "{Suplemento} no tiene certificación de terceros. Riesgo de contaminación con sustancias prohibidas." | Maughan et al., 2018, consenso del COI sobre suplementos, *BJSM* | |
| D2 | Un suplemento contiene una sustancia de la Lista Prohibida | Cualquier cantidad | Importante | "{Suplemento} contiene {sustancia}, incluida en la Lista Prohibida de la AMA." | AMA (WADA), Lista Prohibida vigente | |
| D3 | Medicación de la ficha incluida en la Lista Prohibida (metilfenidato, glucocorticoides orales, diuréticos…) | Cualquier dosis | Importante | "{Fármaco} está en la Lista Prohibida. Verificar si tiene autorización de uso terapéutico (AUT)." | AMA (WADA), Lista Prohibida vigente y estándar de AUT | |
| D4 | Cafeína por encima de la dosis eficaz | Más de 6 mg/kg (importante si supera 9 mg/kg) | Informativa | "La dosis de cafeína es {x} mg/kg. La evidencia de rendimiento es con 3–6 mg/kg; desde 9 aumentan los efectos adversos." | Guest et al., 2021, posición de la ISSN sobre cafeína | |
| D5 | Bicarbonato por encima de la dosis habitual | Más de 0,3 g/kg por toma | Informativa | "La dosis de bicarbonato es {x} g/kg. Por encima de 0,3 aumentan las molestias gastrointestinales." | Grgic et al., 2021, posición de la ISSN sobre bicarbonato de sodio | |
| D6 | Creatina con enfermedad renal en la ficha | Cualquier dosis | Importante | "Indica creatina y en la ficha figura enfermedad renal. Revisar con el médico." | Kreider et al., 2017, posición de la ISSN sobre creatina | |
| D7 | Suplemento de los grupos C o D del marco ABCD del AIS | — | Informativa | "{Suplemento} está en el grupo {C o D} del AIS: evidencia insuficiente o desaconsejado." | Australian Institute of Sport, marco ABCD de suplementos | |
| D8 | Menor de 18 años con cafeína o creatina | Cualquier dosis | Informativa | "{Suplemento} en menores: la evidencia de seguridad es limitada." | American Academy of Pediatrics, 2011, informe clínico sobre bebidas deportivas y energizantes | |

## Datos que faltan para que las reglas funcionen

Este es el hallazgo principal para KAN-97: **hoy solo se pueden implementar las
reglas de la sección C**. Las demás necesitan datos que la app todavía guarda como
texto libre o directamente no tiene.

| Dato | Cómo está hoy | Qué hace falta | Reglas |
|---|---|---|---|
| Alérgenos de los alimentos | No existe. El catálogo tiene 103 alimentos con grupo y nutrientes. | Marcar los alérgenos del CAA y la lactosa en el catálogo, en los alimentos propios y, por herencia, en las recetas | A1–A3 |
| Alergias e intolerancias de la ficha | Texto libre (`allergies`) | Lista cerrada de alérgenos, además del texto | A1–A3 |
| Medicación | Texto libre (`currentMedication`) | Lista por principio activo, con horario de toma y fecha de inicio, además del texto | B1–B10, D3 |
| Suplementos | Texto libre (`supplements`) | Catálogo de KAN-59 y protocolo por deportista | D1–D8 |
| Si compite con control antidopaje | No existe | Campo en el perfil deportivo | D1 |
| Requerimiento, macros del plan y masa libre de grasa | Existen (ADR 0032, plan, Kerr) | — | C1–C6 |

Orden propuesto para KAN-97: primero las reglas de la sección C; después alergias
(cargar alérgenos en el catálogo es una tarea acotada); después medicación; y las de
suplementación cuando esté KAN-59.

## Preguntas abiertas

1. ¿Falta alguna interacción frecuente en tu práctica? Por ejemplo: anticonceptivos
   orales, antiepilépticos, corticoides inhalados o diuréticos tiazídicos.
2. ¿D1 debería saltar también para deportistas sin control antidopaje, con nivel
   informativo?
3. ¿Las alertas de horario (B1, B9) tienen sentido si el plan no tiene horarios
   cargados, o se omiten?
