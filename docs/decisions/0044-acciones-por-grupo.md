# 0044 — Acciones por grupo: asignar profesional, aplicar plan y cobertura

- **Estado**: aceptada
- **Fecha**: 2026-10-25
- **Jira**: KAN-32, KAN-33, KAN-34 (Gap 5, KAN-8)

## Contexto

Con el import (ADR 0043) un club suma 50 deportistas de una vez, pero asignarles
nutricionista y armarles el plan seguía siendo de a uno. Los grupos (ADR 0031) ya
agrupan al plantel y la pizarra (KAN-70) muestra quién necesita atención, pero no
cuánto del plantel tiene plan, medición o registro.

## Decisión

- **Una acción de grupo = la operación de a uno, repetida** en una sola transacción.
  No hay reglas nuevas:
  - asignar usa `CareAssignmentsService.assignInTx`;
  - el plan usa `MealPlansService.saveInTx`, extraída del guardado individual;
  - numeración de versiones, supersede, unique, validaciones y auditoría son las de
    siempre.

  Si una falla, no queda ninguna (todo o nada), y se suma un resumen en el audit log
  (`group.professional_assigned`, `group.plan_applied`).
- **Asignar se suma, no reemplaza.** Las asignaciones son M:N; quien ya tenía otro
  profesional lo sigue teniendo. A quien ya tiene al elegido no se lo toca, así que
  repetir la acción no duplica.
- **El plan es una copia por deportista.** Cada uno recibe una versión nueva de su plan
  con el cuerpo de la plantilla copiado. Se descartó un plan "de grupo" compartido:
  el ajuste individual (alergias, posición, peso) es la regla, y con una copia editar
  a uno no toca a los demás ni a la plantilla. El vigente pasa al historial, como al
  guardar a mano; con `onlyWithoutPlan` sólo lo reciben quienes no tienen.
- **Mismo scoping que el resto**: `visibleMembers`. El profesional aplica el plan sólo
  a sus asignados del grupo; asignar profesional es del admin (`patient:assign`).
- **Cobertura en la pizarra** (KAN-34), en el mismo endpoint y sin vista nueva:
  - plan vigente;
  - medidos en 30 días;
  - última antropometría;
  - adherencia de 30 días.

  La adherencia de 30 días se calcula sobre todo lo registrado por el grupo, no como
  promedio de promedios, para que quien registra poco no pese igual; al lado va
  cuántos registran. Las métricas de eficiencia por profesional (tiempo de armado,
  respuesta) siguen en "Tus números": son de quien atiende, no del plantel.

## Consecuencias

- Aplicar a un plantel de 60 son ~60 versiones nuevas en una transacción: unos cientos
  de queries, del orden de un segundo.
- Reemplazar en lote deja el plan anterior en el historial de cada uno; volver atrás
  es de a uno.
- El encabezado de las pantallas (`PageHeader`) ahora deja que las acciones bajen a
  otra línea cuando no entran al lado del título.
