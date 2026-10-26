# Validación — preguntas de la anamnesis del portal

**Estado: a confirmar.** Son las preguntas que ve el deportista cuando su profesional le
pide la anamnesis (ADR 0045). Están en `ANAMNESIS_FIELDS`
(`packages/shared/src/dtos/intake-forms.dto.ts`); cambiar un texto es editar ahí. Hay que
revisar la redacción, si falta o sobra alguna pregunta y si los rangos tienen sentido.

| Sección | Pregunta | Ayuda / rango | ¿OK? |
|---|---|---|---|
| Tu salud | ¿Por qué venís a la consulta? | texto libre | |
| Tu salud | ¿Qué te gustaría lograr? | "Ej.: bajar grasa sin perder rendimiento, ganar masa muscular." | |
| Tu salud | ¿Tuviste enfermedades, cirugías o internaciones? | texto libre | |
| Tu salud | ¿Tenés alguna enfermedad diagnosticada hoy? | "Ej.: diabetes, celiaquía, hipotiroidismo, anemia." | |
| Tu salud | ¿Tenés alergias o intolerancias a algún alimento? | texto libre | |
| Tu salud | ¿Tomás alguna medicación? | "Nombre y para qué." | |
| Tu salud | ¿Hay enfermedades en tu familia directa? | "Ej.: diabetes, colesterol alto, enfermedad cardíaca." | |
| Tu deporte | ¿Qué deporte practicás? | texto libre | |
| Tu deporte | ¿En qué posición o especialidad? | "Ej.: delantero, arquera, 100 m llanos." | |
| Tu deporte | ¿Cuántos días por semana entrenás? | 0 a 7 | |
| Tu deporte | ¿Cuántas horas por semana, en total? | "Contando campo y gimnasio." 0 a 60 h | |
| Tu deporte | ¿En qué nivel competís? | recreativo, amateur o liga, semiprofesional, profesional o élite | |
| Tu deporte | Fuera del deporte, ¿qué tan activo sos en el día? | sedentario a muy activo | |
| Tu deporte | ¿Tenés o tuviste lesiones en el último año? | "Cuál y si te sigue molestando." | |
| Tus hábitos | ¿Tomás suplementos? | "Ej.: proteína, creatina, cafeína, multivitamínico. Cuál y cuánto." | |
| Tus hábitos | ¿Hay alimentos que no comés o preferís? | "Ej.: vegetariano, no me gusta el pescado." | |
| Tus hábitos | ¿Cuántas comidas hacés por día? | 1 a 10 | |
| Tus hábitos | ¿Cuántas horas dormís por noche? | 3 a 14 h | |

Preguntas que quedaron afuera a propósito y que podrían sumarse: horario de los
entrenamientos, consumo de alcohol, ciclo menstrual y síntomas gastrointestinales
durante el ejercicio. Cada una necesita decidir dónde se guarda en la ficha.

La frecuencia de consumo del portal usa los mismos ítems y categorías que la que carga
el profesional; ver [`frecuencia-de-consumo.md`](frecuencia-de-consumo.md).
