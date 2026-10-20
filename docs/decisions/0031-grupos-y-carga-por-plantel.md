# 0031 — Grupos de deportistas y carga por plantel

- **Estado**: aceptada
- **Fecha**: 2026-10-19

## Contexto

En un club o un gimnasio no se atiende a deportistas sueltos: se trabaja con la
**Primera**, la **Sub-17** o el **turno mañana**. La antropometría ISAK
([ADR 0030](0030-antropometria-isak.md)) se cargaba de a un deportista por vez, desde la
ficha de cada uno. Medir un plantel de 25 eran 25 formularios, y no había forma de ver
al equipo junto.

## Decisión

- **Grupos del tenant**: tabla `patient_groups` (nombre único por organización, sin
  distinguir mayúsculas, y descripción opcional) más `patient_group_members` (M:N). Un
  deportista puede estar en varios grupos. Las dos tablas están bajo RLS
  `tenant_isolation`. Borrar un grupo solo borra las pertenencias; los pacientes y sus
  datos no se tocan.
- **Quién arma los grupos**: el admin, con la capacidad nueva `group:manage`. Es la
  misma regla que el alta y la asignación de pacientes. En una org de una persona
  ([ADR 0026](0026-profesional-independiente-org-de-una-persona.md)) el admin es quien
  atiende.
- **Un grupo no abre acceso**: el profesional ve los grupos (`patient:read`), pero dentro
  de cada uno solo a los deportistas que tiene **asignados**. Los conteos, el resumen y
  la carga usan el mismo scoping que `patient-access`. Los archivados no cuentan.
- **Carga por plantel**: `POST /groups/{id}/anthropometry` recibe una fecha y una
  entrada por deportista. Crea una sesión por deportista en **una transacción**, todo o
  nada. Cada entrada se valida con la misma regla que la carga individual (rangos y
  tercera toma obligatoria). Si algún deportista no está en el grupo o no es visible
  para la sesión, se rechaza todo. El tope es de 60 entradas por carga.
- **Planilla por pasadas**: la UI carga **la toma 1 de todos los sitios, después la
  toma 2**, como en el protocolo ISAK. La pasada 3 solo habilita los sitios donde las dos
  primeras difieren. Las filas son deportistas y las columnas, sitios. Enter baja al
  siguiente deportista en el mismo sitio. El **borrador se guarda en el navegador**
  (`localStorage`, por grupo): es una comodidad para no perder la medición si se cierra
  la pestaña, no un dato del sistema.
- **Resumen del plantel**: `GET /groups/{id}/anthropometry` devuelve la última sesión de
  cada deportista visible, con los resultados calculados al leer y la variación de Σ6
  contra la sesión anterior.
- **Listado y ficha**: los pacientes muestran sus grupos, y el listado filtra por grupo
  (`GET /patients?group=`).

## Alternativas descartadas

- **Grupos por profesional**: cada profesional armaría los suyos y la Primera quedaría
  repetida con nombres distintos. El plantel es de la organización.
- **Que el grupo dé acceso a sus miembros**: rompería el mínimo privilegio de las
  asignaciones ([ADR 0005](0005-care-assignments-versionadas.md)). Para que un
  profesional atienda a todo el plantel, se lo asigna a cada deportista.
- **Planilla por deportista (todas las tomas de corrido)**: obliga a ir y volver entre
  formularios. Por pasadas se replica lo que hace quien mide y anota.
- **Borrador en el servidor**: agrega un estado intermedio (sesiones a medio cargar)
  sin un caso que lo pida. El navegador alcanza para una tarde de medición.

## Consecuencias

- Hay una entidad para lo que viene en clubes: **asignar un plan a todo el grupo**,
  métricas de eficiencia por plantel y ecuaciones juveniles por división.
- La asignación masiva (un profesional a todo el grupo) todavía se hace de a uno.
- Más de 60 deportistas se guardan en tandas: los que quedan vacíos no se envían.
