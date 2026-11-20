# Validación — alérgenos en la ficha y en los alimentos

**Estado: validado** por Florencia Hnatiuk, nutricionista, el 2026-11-20, sobre la versión del PR #126, con el sésamo sumado a la lista (KAN-105, épica KAN-91). Es la base de las alertas de
alergias e intolerancias (sección A de [`alertas.md`](alertas.md)) y de las
exclusiones de NUTRI, que hoy adivinan sobre el texto libre de la ficha.

Decisiones ya tomadas (2026-11-20):

- **Ficha:** lista para tildar, más el texto libre para el detalle.
- **Alimentos:** los alérgenos son un dato del alimento. En el catálogo los propongo
  yo y los validás vos; en los alimentos propios los marca el profesional; las
  recetas los heredan de sus ingredientes. Al vincular un alimento al plan se copian,
  igual que los macros.
- **Lactosa:** marca "contiene lactosa", sin gramos.

## 1. Lista de alérgenos

Los del Código Alimentario Argentino (art. 235 séptimo, alérgenos de declaración
obligatoria; verificar el texto vigente), más la lactosa, que no es un alérgeno pero
la usa la regla de intolerancia.

| Clave | Lo que ve el profesional | Incluye | ¿Lo confirmás? |
|---|---|---|---|
| `tacc` | Gluten (TACC) | Trigo, avena, cebada, centeno y derivados | ✓ |
| `leche` | Leche | Leche de vaca y de otros mamíferos, y derivados | ✓ |
| `huevo` | Huevo | Huevo y derivados | ✓ |
| `pescado` | Pescado | Pescados y derivados | ✓ |
| `crustaceos` | Crustáceos | Langostinos, camarones, cangrejo… | ✓ |
| `mani` | Maní | Maní y derivados | ✓ |
| `frutos_secos` | Frutos secos | Almendra, nuez, avellana, castaña de cajú, pistacho… | ✓ |
| `soja` | Soja | Soja y derivados (incluida la lecitina) | ✓ |
| `sulfitos` | Sulfitos | Desde 10 mg/kg | ✓ |
| `sesamo` | Sésamo | Semillas de sésamo y tahini. No está en la lista del CAA; se suma por decisión clínica | ✓ |
| `lactosa` | Lactosa | Solo para la intolerancia; no es alérgeno | ✓ |

## 2. Qué se tilda en la ficha

| Casilla | Usa la marca del alimento | Regla | ¿Lo confirmás? |
|---|---|---|---|
| Alergia a {cada alérgeno de la lista, salvo lactosa} | El mismo alérgeno | A1, importante | ✓ |
| Celiaquía | `tacc` | A2, importante | ✓ |
| Intolerancia a la lactosa | `lactosa` | A3, informativa | ✓ |

La anamnesis del portal puede **proponer** casillas a partir de lo que escribe el
deportista, pero las confirma el profesional, igual que el resto de la anamnesis
(ADR 0045).

## 3. Reglas

| ID | Salta cuando… | Nivel | Texto del aviso | ¿Lo confirmás? |
|---|---|---|---|---|
| A1 | Un alimento del plan tiene un alérgeno tildado en la ficha | Importante | "El plan incluye {alimento}, que contiene {alérgeno}. En la ficha figura alergia a {alérgeno}." | ✓ |
| A2 | Celiaquía tildada y un alimento del plan tiene `tacc` | Importante | "{alimento} contiene gluten (TACC). En la ficha figura celiaquía." | ✓ |
| A3 | Intolerancia a la lactosa tildada y una comida tiene alimentos con `lactosa` | Informativa | "La comida {comida} incluye {alimentos} con lactosa. Con intolerancia suele tolerarse hasta unos 12 g por toma." | ✓ |

Cambio respecto de [`alertas.md`](alertas.md): **A3 ya no cuenta gramos**, avisa que
hay lactosa. Una alerta por comida (no por alimento), para no llenar el panel.

## 4. Criterio de curación del catálogo

1. **Solo alérgenos propios del alimento genérico**, no de una marca. Lo que depende
   de la marca va como nota ("revisar el rótulo") y no dispara alertas.
2. **Las trazas y el "puede contener" no se marcan.** Si un deportista es muy
   sensible, lo resuelve el profesional con el texto libre.
3. **Lactosa:** se marca cuando el alimento la tiene en cantidad relevante; los
   quesos estacionados y la manteca quedan a tu criterio (ver la tabla).

¿Lo confirmás? ✓

## 5. Alérgenos propuestos para el catálogo (103 alimentos)

Las 14 recetas de la biblioteca no se validan aparte: heredan los alérgenos de sus
ingredientes.

### Alimentos con alérgenos o con una nota

| Alimento | Alérgenos propuestos | Nota | ¿Lo confirmás? |
|---|---|---|---|
| Leche entera | leche, lactosa |  | ✓ |
| Leche descremada | leche, lactosa |  | ✓ |
| Yogur natural entero | leche, lactosa |  | ✓ |
| Yogur natural descremado | leche, lactosa |  | ✓ |
| Yogur griego natural descremado | leche, lactosa |  | ✓ |
| Queso cremoso (tipo mozzarella) | leche, lactosa |  | ✓ |
| Queso untable descremado | leche, lactosa |  | ✓ |
| Queso crema | leche, lactosa |  | ✓ |
| Queso rallado (tipo reggianito) | leche | Estacionado: lactosa casi nula. ¿La marcamos igual? | ✓ |
| Ricota | leche, lactosa |  | ✓ |
| Manteca | leche | Lactosa en trazas (~0,1 g/100 g). ¿La marcamos igual? | ✓ |
| Crema de leche | leche, lactosa |  | ✓ |
| Huevo entero | huevo |  | ✓ |
| Clara de huevo | huevo |  | ✓ |
| Huevo duro | huevo |  | ✓ |
| Jamón cocido | — | Según la marca puede tener proteína de soja o leche: revisar el rótulo. | ✓ |
| Merluza, cocida | pescado |  | ✓ |
| Salmón rosado, cocido | pescado |  | ✓ |
| Atún al natural, escurrido | pescado |  | ✓ |
| Atún en aceite, escurrido | pescado |  | ✓ |
| Sardinas en aceite, escurridas | pescado |  | ✓ |
| Fideos secos, cocidos | TACC | Los fideos al huevo suman huevo. | ✓ |
| Fideos integrales, cocidos | TACC |  | ✓ |
| Avena arrollada | TACC | La avena común se contamina con trigo; la apta para celíacos es otro producto. | ✓ |
| Pan blanco (francés) | TACC |  | ✓ |
| Pan integral | TACC | Puede tener semillas o soja según la receta. | ✓ |
| Galletas de arroz | — | Sin TACC propio; riesgo de contaminación si no dice "sin TACC". | ✓ |
| Galletitas de agua | TACC | Algunas marcas suman leche. | ✓ |
| Harina de trigo 000 | TACC |  | ✓ |
| Polenta, cocida | — | Sin TACC propio; riesgo de contaminación si no dice "sin TACC". | ✓ |
| Copos de maíz | TACC | Los comunes llevan extracto de malta de cebada. | ✓ |
| Soja texturizada, seca | soja |  | ✓ |
| Tofu firme | soja |  | ✓ |
| Pasas de uva | — | Las rubias suelen tener sulfitos; las oscuras, no. | ✓ |
| Almendras | frutos secos |  | ✓ |
| Nueces | frutos secos |  | ✓ |
| Maní tostado sin sal | maní |  | ✓ |
| Pasta de maní | maní |  | ✓ |
| Mayonesa | huevo |  | ✓ |
| Dulce de leche | leche, lactosa |  | ✓ |
| Chocolate amargo 70% | soja | Lecitina de soja; suele decir "puede contener leche". | ✓ |
| Bebida de almendras sin azúcar | frutos secos |  | ✓ |
| Hummus | sésamo | Lleva tahini. | ✓ |
| Proteína de suero (whey) | leche, lactosa | El aislado tiene muy poca lactosa; el concentrado, más. | ✓ |

### Alimentos sin alérgenos de la lista (59)

Una confirmación por grupo. Si alguno lleva un alérgeno, anotalo en la última columna.

| Grupo | Alimentos | ¿Lo confirmás? |
|---|---|---|
| Carnes | Pechuga de pollo sin piel, cocida, Muslo de pollo sin piel, cocido, Carne picada especial (90/10), cruda, Carne picada común (80/20), cruda, Lomo vacuno, cocido, Nalga / peceto vacuno, cocido, Lomo de cerdo, cocido | ✓ |
| Cereales y derivados | Arroz blanco, cocido, Arroz integral, cocido, Quinoa, cocida | ✓ |
| Legumbres | Lentejas, cocidas, Garbanzos, cocidos, Porotos negros, cocidos, Porotos alubia, cocidos | ✓ |
| Verduras | Papa, hervida, Batata, hervida, Zapallo / calabaza, cocido, Zapallito / zucchini, cocido, Zanahoria, cruda, Tomate, crudo, Lechuga, Espinaca, cocida, Acelga, cocida, Brócoli, cocido, Cebolla, cruda, Morrón rojo, crudo, Pepino, crudo, Berenjena, cocida, Choclo, cocido, Remolacha, cocida, Champiñones, crudos, Palta | ✓ |
| Frutas | Banana, Manzana, Naranja, Mandarina, Pera, Frutillas, Durazno, Uvas, Kiwi, Ananá, Sandía, Melón, Limón (jugo), Arándanos | ✓ |
| Frutos secos y semillas | Semillas de chía, Semillas de lino, Semillas de girasol | ✓ |
| Aceites y grasas | Aceite de oliva, Aceite de girasol | ✓ |
| Azúcares y dulces | Azúcar, Miel, Mermelada, Cacao amargo en polvo | ✓ |
| Bebidas | Jugo de naranja exprimido, Gaseosa cola, Café | ✓ |
| Varios | Puré de tomate | ✓ |


## Decisiones de la validación

1. **Sésamo: se suma** a la lista, aunque no esté en el CAA. El hummus lo lleva.
2. **Sin marca de trazas.** Se mantiene el criterio 2: el "puede contener" no se
   marca; las alergias severas se detallan en el texto libre.
3. **Avena apta para celíacos:** se carga como alimento propio del consultorio, sin
   `tacc`. El catálogo mantiene la avena común con `tacc`.
