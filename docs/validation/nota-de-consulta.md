# Validación — plantilla de la nota de consulta asistida

**Estado: validado** por Florencia Hnatiuk, nutricionista, el 2026-11-19, sobre la versión del PR #122.

Es la estructura del borrador que arma el asistente a partir
de la transcripción de la consulta (KAN-94, épica KAN-91, [ADR 0050](../decisions/0050-nota-de-consulta-asistida.md)).
El profesional lo revisa, lo corrige y lo aprueba; nada entra en la ficha sin eso.

Las secciones están en `CONSULTATION_NOTE_SECTIONS`
(`packages/shared/src/dtos/consultation-note.dto.ts`). Cambiar un título, una ayuda o
una sección es editar ahí: de ese mismo objeto salen la interfaz, el prompt del
asistente y el JSON Schema que se le pasa al modelo.

Hay que revisar si falta o sobra alguna sección, si va en la nota correcta (primera
consulta o control), el orden y la redacción de la ayuda. La ayuda la lee el
profesional y también el modelo: le dice qué buscar en la transcripción.

## Secciones

| # | Sección | Primera | Control | Qué va (ayuda) | ¿Lo confirmás? |
|---|---|:-:|:-:|---|---|
| 1 | Motivo de consulta | ✓ | | Por qué consulta, con sus palabras, y qué espera lograr. || ✓ |
| 2 | Antecedentes, medicación y alergias | ✓ | | Patologías, cirugías, medicación con dosis y horario, alergias e intolerancias, síntomas gastrointestinales, lesiones y, si corresponde, ciclo menstrual. || ✓ |
| 3 | Evolución desde el último control | | ✓ | Adherencia al plan, qué funcionó y qué no, síntomas nuevos, cambios de medicación o de salud desde la consulta anterior. || ✓ |
| 4 | Anamnesis alimentaria | ✓ | ✓ | Comidas habituales, horarios, recordatorio de 24 horas si se hizo, preferencias, aversiones, alcohol e hidratación habitual. || ✓ |
| 5 | Hábitos, sueño y entrenamiento | ✓ | ✓ | Horas de sueño, actividad fuera del deporte, días y turnos de entrenamiento, momento de la temporada y competencias próximas. || ✓ |
| 6 | Antropometría | ✓ | ✓ | Resumen de lo medido o dictado en la consulta y de los cambios respecto de la evaluación anterior. Los valores se cargan en la ficha por separado. || ✓ |
| 7 | Evaluación | ✓ | ✓ | Lectura profesional de la situación, tal como la expresó el profesional en la consulta. || ✓ |
| 8 | Objetivos y plan | ✓ | ✓ | Objetivos acordados y cambios del plan alimentario: energía, macros, distribución y timing. || ✓ |
| 9 | Suplementación | ✓ | ✓ | Suplementos indicados, mantenidos o suspendidos, con dosis, momento y motivo. || ✓ |
| 10 | Próximos pasos | ✓ | ✓ | Qué tiene que hacer el deportista y qué queda pendiente para el profesional antes del próximo control. || ✓ |

Además de las secciones, la nota tiene dos campos fijos:

| Campo | Qué es | ¿Lo confirmás? |
|---|---|---|
| Próximo control | Lo que se dijo ("en tres semanas", "después del torneo") y la fecha solo si se dijo una concreta. Si no se habló, queda vacío. || ✓ |
| Dudas | Lista de lo que el asistente no entendió o le quedó ambiguo, por ejemplo "no queda claro si la cafeína es 3 o 6 mg/kg". Se muestran arriba y hay que resolverlas antes de aprobar. || ✓ |

## Cambios respecto de la propuesta del ticket

- **Antecedentes, medicación y alergias (2)**: no estaba. Lo sumé en la primera
  consulta porque es lo que después usa el motor de alertas (KAN-97) para cruzar
  fármacos y alergias con el plan.
- **Suplementación (9)**: estaba dentro de "objetivos y plan". La separé porque en
  deportivo es un tema propio (dosis, momento, riesgo de dopaje) y porque también la
  revisan las alertas.
- **Evolución desde el último control (3)**: reemplaza al motivo de consulta en la
  nota de control.
- **Próximos pasos y fecha de control**: quedaron separados. Los pasos son una
  sección y la fecha es un campo fijo, para poder ofrecer el turno más adelante.

## Reglas del asistente (las hace cumplir el schema)

- **Si no se habló, la sección queda vacía.** El asistente no completa con supuestos
  ni con datos de la ficha.
- **La evaluación es del profesional.** El asistente solo registra lo que el
  profesional dijo en la consulta; no diagnostica ni agrega su propia lectura.
- **Los números de la antropometría no se cargan desde la nota.** Pasan a la ficha
  por otro flujo, con revisión campo por campo (KAN-96).
- Ninguna sección puede superar su largo máximo y la nota no puede tener campos
  fuera de la plantilla.

## Decisiones de la validación

1. **Interconsulta o derivación: va en una nota propia.** Es un tercer formato,
   pensado para que lo lea otro profesional. Queda fuera de esta plantilla y se
   define en su propio ticket (KAN-103).
2. **El control no repite "Antecedentes, medicación y alergias".** Los cambios de
   medicación o de salud se registran en "Evolución desde el último control".
3. **La consulta grupal no tiene plantilla propia por ahora.** La nota es siempre de
   un deportista.
