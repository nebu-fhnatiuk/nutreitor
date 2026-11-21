# Validación — medicación en la ficha e interacciones fármaco-nutriente

**Estado: a validar** (KAN-98, épica KAN-91). Detalla la sección B de
[`alertas.md`](alertas.md): cómo se carga la medicación y qué reglas revisan el plan
contra ella. Cuando esté validado, se implementa igual que los alérgenos (KAN-105):
datos estructurados en la ficha, datos en los alimentos y reglas en el motor de
alertas (ADR 0051).

Decisiones ya tomadas (2026-11-21):

- **Medicación:** se elige por principio activo de la clasificación ATC de la OMS,
  con fecha de inicio y hora de toma opcionales. El texto libre queda para el
  detalle y para lo que no esté en la lista.
- **Sin horario:** si falta la hora de la toma o la de la comida, las reglas de
  horario (B1, B9) avisan igual, como informativas y con un texto general.
- **Alcance:** todo menos B6 (potasio) y B7 (vitamina A), que dependen de los
  suplementos del plan (KAN-59).
- **Reglas nuevas:** diuréticos, corticoides, anticonceptivos orales y
  antiepilépticos (B11–B14).

## 1. La lista ATC y su licencia

El índice ATC lo mantiene el Centro Colaborador de la OMS en Oslo (WHOCC). Se vende
en Excel o XML, pero su aviso de copyright **no permite el uso comercial sin
permiso** ni modificar el material. Para usar el índice completo en Nutreitor hay
que pedir la licencia a whocc@fhi.no.

Mientras tanto, la app carga solo los principios activos que usan las reglas (la
sección 3), identificados por su código ATC y con nombre en castellano. Citar los
códigos de las reglas no es redistribuir el índice. Cuando llegue la licencia, se
importa el índice completo con los mismos códigos y no cambia nada más.

El ATC no trae marcas argentinas: el buscador encuentra por genérico. Si buscás
"Eutirox" no aparece; lo escribís en el texto libre o buscás "levotiroxina".

| Pregunta | ¿Lo confirmás? |
|---|---|
| ¿Pedimos la licencia comercial del índice completo al WHOCC? ¿Quién escribe? | |
| ¿Te sirve buscar solo por genérico, sin marcas? | |

## 2. Qué se carga en la ficha

| Campo | Para qué | Obligatorio | ¿Lo confirmás? |
|---|---|---|---|
| Principio activo (código ATC) | Todas las reglas | Sí | |
| Desde cuándo (mes y año) | B5, B10, B12: uso prolongado | No | |
| Hora de la toma | B1, B9: separación con las comidas | No | |
| Texto libre | Dosis, indicación, lo que no esté en la lista | No (ya existe) | |

## 3. Reglas

El texto entre llaves lo completa el motor. "Sin hora" es el texto que sale si falta
la hora de la toma o de la comida.

| ID | Fármacos (ATC) | Salta cuando… | Nivel | Texto del aviso | ¿Lo confirmás? |
|---|---|---|---|---|---|
| B1 | Levotiroxina (H03AA01) | Café a menos de 60 min de la toma, o un alimento con mucho calcio o hierro a menos de 4 h | Informativa | "Toma levotiroxina a las {hora}. {Alimento} a menos de {x} puede reducir su absorción." Sin hora: "Toma levotiroxina: separar el café, los lácteos y el hierro de la toma." | |
| B2 | Antivitamina K: acenocumarol (B01AA07), warfarina (B01AA03) | La vitamina K diaria del plan cambia más de un 50 % frente al plan anterior | Importante | "Toma {fármaco}. El plan cambia el aporte de vitamina K de {antes} a {ahora} µg/día. Conviene mantenerlo estable, no eliminarlo." | |
| B3 | IMAO: fenelzina (N06AF03), tranilcipromina (N06AF04), moclobemida (N06AG02), selegilina (N04BD01), rasagilina (N04BD02) | Un alimento con marca de tiramina | Importante | "Toma un IMAO ({fármaco}). {Alimento} puede tener tiramina en cantidad suficiente para subir la presión." | |
| B4 | Simvastatina (C10AA01), lovastatina (C10AA02), atorvastatina (C10AA05) | Pomelo en el plan (alimento o texto libre) | Informativa | "Toma {fármaco}. El pomelo aumenta su concentración en sangre." | |
| B5 | Metformina (A10BA02) | La toma hace más de un año | Informativa | "Toma metformina hace más de un año: conviene controlar la vitamina B12." | |
| B8 | Litio (N05AN01) | Sodio del plan por debajo de {umbral} mg/día, o pérdida de sudor de más de 1 L/h en la última prueba | Importante | "Toma litio. Los cambios de sodio y la deshidratación modifican su nivel en sangre: coordinar con el médico." | |
| B9 | Quinolonas (J01MA), tetraciclinas (J01AA) | Un alimento con mucho calcio, hierro, magnesio o zinc menos de 2 h antes o 6 h después de la toma | Informativa | "Toma {antibiótico}. {Alimento} cerca de la toma reduce su absorción." Sin hora: "Toma {antibiótico}: separar lácteos y suplementos minerales 2 h antes y 6 h después." | |
| B10 | IBP: omeprazol (A02BC01), pantoprazol (A02BC02), lansoprazol (A02BC03), esomeprazol (A02BC05) | La toma hace más de un año | Informativa | "Toma {fármaco} hace más de un año: conviene controlar el magnesio." | |
| B11 | Tiazidas (C03AA, C03BA) y diuréticos de asa (C03CA) | Pérdida de sudor de más de 1 L/h en la última prueba, o sodio del plan por debajo de {umbral} | Importante | "Toma {fármaco}, que aumenta la pérdida de sodio, potasio y magnesio. Con {sudor o sodio bajo}, revisar la reposición." | |
| B12 | Corticoides sistémicos (H02AB) | La toma hace más de 3 meses y el plan aporta menos calcio que la recomendación | Informativa | "Toma {fármaco} hace más de 3 meses. El plan aporta {x} mg de calcio por día; con corticoides se recomiendan 1000–1200 mg y vitamina D." | |
| B13 | Anticonceptivos hormonales (G03A) | Deportista mujer con disponibilidad energética baja o subóptima (reglas C2 y C3) | Informativa | "Toma anticonceptivos hormonales: el sangrado por deprivación puede ocultar una amenorrea. No usar la regularidad del ciclo como señal de disponibilidad energética adecuada." | |
| B14 | Inductores enzimáticos: fenitoína (N03AB02), carbamazepina (N03AF01), fenobarbital (N03AA02), oxcarbazepina (N03AF02) | Siempre que esté cargado | Informativa | "Toma {fármaco}, que acelera el metabolismo de la vitamina D. Conviene controlar vitamina D y calcio." | |

B6 (potasio con IECA, ARA II o espironolactona) y B7 (vitamina A con isotretinoína)
quedan para cuando el plan tenga suplementos (KAN-59).

Una alerta por regla y por fármaco en todo el plan, salvo B1 y B9, que salen una
por día y comida en conflicto, igual que las de la sección C.

## 4. Datos que necesitan los alimentos

El catálogo hoy tiene energía, macros, fibra, azúcares, grasas saturadas y sodio. Las
reglas necesitan más:

| Dato | De dónde sale | Reglas | ¿Lo confirmás? |
|---|---|---|---|
| Calcio, hierro, magnesio y zinc por 100 g | USDA, de la misma fila que ya usa cada alimento del catálogo | B1, B9, B12 | |
| Vitamina K por 100 g | USDA, ídem | B2 | |
| "Mucho calcio" para la separación | Más de 100 mg por porción del plan (propuesta) | B1, B9 | |
| "Mucho hierro" | Más de 3 mg por porción (propuesta) | B1, B9 | |
| Marca de cafeína | Curación manual: café, mate, té, bebidas cola y energizantes | B1 | |
| Marca de tiramina | Curación manual: quesos estacionados, fiambres curados, embutidos fermentados, salsa de soja, chucrut | B3 | |
| Pomelo | No está en el catálogo. Se busca la palabra en el texto libre del plan, y se agrega al catálogo | B4 | |

Los alimentos propios y los sin datos no se dan por limpios: el panel avisa cuántos
no se pudieron revisar, como con los alérgenos.

## 5. Fuentes

Las verifiqué en el resumen o en una fuente secundaria. Antes de dar la regla por
validada, conviene mirar el texto original de las marcadas "a revisar".

| Regla | Fuente | Qué dice | Estado |
|---|---|---|---|
| B1 | Jonklaas et al., *Thyroid* 2014;24:1670–1751, guía de la American Thyroid Association | Separar 4 h de calcio y hierro. Es una recomendación débil: "tradicional, pero no probada". Menciona el café como interferencia, **sin un intervalo**. Los 60 min del café no salen de esta guía | A revisar: buscar la fuente de los 60 min o dejar el café sin minutos |
| B2 | Holbrook et al., *Arch Intern Med* 2005;165:1095–1106 | Revisión sistemática de interacciones de la warfarina; los alimentos con mucha vitamina K figuran en la tabla de alimentos. **El 50 % es una propuesta mía**, no sale de la fuente | A revisar: el umbral |
| B3 | Gillman, *J Neural Transm* 2018;125:1707–1717 | Confirma la interacción, pero sostiene que el riesgo está sobreestimado: hoy pocos alimentos tienen mucha tiramina | Verificada. ¿Importante o informativa? |
| B4 | Bailey, Dresser y Arnold, *CMAJ* 2013;185(4):309–316 | Un vaso de jugo o un pomelo alcanza; separar las tomas no lo evita | Verificada. Los fármacos puntuales están en su tabla 1 |
| B5 | American Diabetes Association, *Standards of Care in Diabetes—2025*, sección 9, *Diabetes Care* 2025;48(Supl. 1) | Controlar la B12 periódicamente con metformina prolongada, sobre todo con anemia o neuropatía | Verificada en fuente secundaria |
| B8 | Prospecto aprobado por ANMAT | — | A revisar: leer el prospecto vigente y definir el umbral de sodio |
| B9 | Prospectos aprobados por ANMAT (ciprofloxacina, doxiciclina) | — | A revisar: los intervalos cambian según el antibiótico |
| B10 | FDA Drug Safety Communication, 2011-03-02 | Hipomagnesemia con IBP, en general después de un año | Verificada. **Cambié el texto**: la FDA habla solo de magnesio; B12 y hierro necesitan otra fuente o se sacan |
| B11 | Prospectos aprobados por ANMAT | — | A revisar |
| B12 | Humphrey et al., guía del American College of Rheumatology sobre osteoporosis por glucocorticoides, *Arthritis Care Res* 2023 | Calcio y vitamina D en tratamientos de 3 meses o más | A revisar: la cité de memoria |
| B13 | Mountjoy et al., consenso del COI sobre REDs, *Br J Sports Med* 2023 (la misma fuente de C2 y C3) | Los anticonceptivos hormonales enmascaran la amenorrea | A revisar: buscar el pasaje |
| B14 | — | Interacción conocida de los inductores con la vitamina D | Falta una fuente |

## 6. Preguntas para vos

1. B3: Gillman dice que el riesgo de la tiramina está sobreestimado. ¿La dejamos
   importante igual, por ser crisis hipertensiva?
2. B8 y B11: ¿qué sodio diario del plan considerás bajo? Propongo menos de 1500 mg.
3. B13: ¿la regla tiene sentido así, atada a la sospecha de baja disponibilidad
   energética, o preferís que salga siempre en deportistas mujeres?
4. ¿Hay algún fármaco de uso frecuente en deportistas que falte? Por ejemplo,
   antiinflamatorios (AINE) de uso crónico o isotretinoína (que hoy espera a KAN-59).

## Decisiones de la validación

(Se completa al validar.)
