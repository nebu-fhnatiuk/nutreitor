# 0053 — Conexión con relojes: entrenamiento real del deportista

- **Estado**: propuesta, a decidir (KAN-104)
- **Fecha**: 2026-11-21
- **Épica**: KAN-57 · Relacionados: [ADR 0032](0032-requerimiento-energetico-periodizado.md),
  [ADR 0051](0051-alertas-del-plan.md)

## Contexto

Hoy el entrenamiento se **planifica**: el requerimiento energético (ADR 0032) define
tipos de día con sesiones (actividad, MET y duración), y el gasto sale de los MET del
Compendio. No hay registro de lo que el deportista **hizo**.

Traer el entrenamiento real sirve para tres cosas:

1. Comparar lo planificado con lo hecho (duración, intensidad, días).
2. Ajustar el gasto del día con la duración real de cada sesión.
3. Ver la carga de la semana al revisar el plan.

Respuestas del piloto (2026-11-21): el club **no tiene GPS de equipo**, y los
deportistas usan **Garmin y Apple Watch**.

Una aclaración que condiciona el diseño: las kcal que informan los relojes tienen
errores del 20 al 40 % en los estudios de validación. Lo que vale es la duración, la
frecuencia cardíaca y la carga. El gasto se sigue calculando con MET, pero con la
duración real.

## Lo que encontré de cada fuente

Fuentes secundarias de noviembre de 2026; antes de integrar hay que leer los términos
oficiales de cada marca.

### Garmin

Garmin rehízo su programa de desarrolladores en octubre de 2026, después de tenerlo
cerrado a altas nuevas desde marzo. Tiene tres niveles:

| Nivel | Para quién | Costo | Qué trae |
|---|---|---|---|
| Personal | Una persona, sus propios datos | Gratis | Actividades (resumen y archivo .FIT), salud |
| Startup | Organizaciones, **hasta 1000 usuarios** | Gratis | Lo anterior, más cursos y entrenamientos estructurados. **Sin datos históricos**: llega desde que el deportista conecta su cuenta |
| Enterprise | Más de 1000 usuarios | US$ 1000 de entrada, a cuenta de un precio por usuario activo por mes, negociado. Se cobra desde el 2027-04-01 | Lo anterior, más histórico y soporte |

El alta del nivel Startup se describe como casi inmediata. La integración es OAuth:
el deportista autoriza desde Nutreitor y Garmin avisa por webhook cada actividad
nueva. Funciona con una PWA, sin app nativa.

Hay que verificar en los términos dos restricciones que se citan en comentarios:

- **No usar los datos para modelos de IA.** NUTRI y los agentes de Bedrock no
  podrían recibir datos de Garmin, o habría que pedir permiso.
- **No pasar los datos a terceros** sin permiso escrito.

### Apple Watch

Apple **no tiene API web** para Apple Health. HealthKit solo se lee desde una app
nativa de iOS, con permiso del usuario en el teléfono. Los agregadores (Terra, Rook,
Junction) tampoco lo resuelven: para Apple Health piden su SDK dentro de una app
nativa propia. Caminos posibles:

| Camino | Cómo | Costo y esfuerzo |
|---|---|---|
| App de iOS propia | Envolver la PWA con Capacitor y un plugin de HealthKit; la app sube las actividades | Cuenta de desarrollador de Apple (US$ 99/año), revisión de la App Store, mantener una app más. Semanas, no días |
| Agregador | Terra, Rook o Junction, con su SDK en una app propia | Desde unos US$ 300–400/mes, y además la app de iOS. Un subencargado más con datos de salud |
| Importar archivos | El deportista exporta la actividad a .FIT o .GPX (con apps como HealthFit) y la sube | Sin costo, funciona con cualquier marca. Es manual: depende de que el deportista lo haga |

### Strava (descartado)

Muchos deportistas sincronizan su reloj con Strava, pero desde noviembre de 2024 sus
términos **no permiten mostrar los datos de un usuario a otra persona**, y un
entrenador o nutricionista lo es. En 2026 sumó otra restricción sobre plataformas
intermediarias. No sirve para Nutreitor.

## Opciones

| | A. Garmin directo + archivos | B. Agregador + app iOS | C. Solo archivos |
|---|---|---|---|
| Garmin | Automático | Automático | Manual |
| Apple Watch | Manual (archivo) | Automático | Manual |
| Otras marcas | Manual (archivo) | Automático (más de 20) | Manual |
| Costo fijo | US$ 0 hasta 1000 deportistas con Garmin | US$ 300–400/mes, más US$ 99/año | US$ 0 |
| Esfuerzo | 2–3 semanas | 4–6 semanas, más mantener la app | 1 semana |
| Datos de salud | Solo Garmin | Pasan por el agregador | Solo Nutreitor |

## Recomendación

**Opción A, en dos pasos**, y dejar la app de iOS para cuando el piloto muestre que
la carga manual no alcanza:

1. **Importar archivos .FIT, .GPX y .TCX.** Sirve para todas las marcas desde el día
   uno y define el modelo de datos.
2. **Garmin directo**, nivel Startup. Los deportistas con Garmin quedan automáticos.

Con eso se mide cuántos deportistas con Apple Watch suben sus archivos. Si son
muchos y no lo hacen, la app de iOS pasa a ser la siguiente decisión.

## Qué implica en el producto

- **Tabla nueva `training_activities`** (append-only, con RLS por tenant): deportista,
  origen (archivo o Garmin), fecha y hora, deporte, duración, distancia, frecuencia
  cardíaca media y máxima, carga si viene, y la referencia al archivo original en S3.
  Las kcal del reloj se guardan, pero no se usan para el cálculo.
- **Conexiones:** una tabla con los tokens OAuth de Garmin, cifrados con KMS.
  Desconectar borra los tokens y avisa a Garmin.
- **Consentimiento:** es un flujo nuevo de datos de salud (Ley 25.326, datos
  sensibles). El deportista lo autoriza desde el portal, y se suma al documento de
  flujo de datos de KAN-6.
- **Alertas (ADR 0051):** C2 y C3 (disponibilidad energética) pueden usar la duración
  real de la semana en vez de la planificada, mostrando cuál usaron.
- **IA:** hasta leer los términos de Garmin, los datos de actividad no se mandan a
  NUTRI.

## Preguntas para decidir

1. ¿Vamos con la opción A?
2. ¿Quién da de alta la cuenta de desarrollador de Garmin a nombre de Nutreitor?
3. ¿Qué porcentaje del plantel usa Apple Watch? Si es la mayoría, la app de iOS sube
   de prioridad.
