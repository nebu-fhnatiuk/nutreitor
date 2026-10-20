# 0030 — Antropometría deportiva ISAK

- **Estado**: aceptada (habilitada el 2026-10-20)
- **Fecha**: 2026-10-19

## Contexto

El producto apunta al sector deportivo: nutricionistas deportólogos, clubes y
gimnasios. La evolución solo guardaba peso, % graso y masa muscular **cargados a mano**,
más algunas medidas libres, sin protocolo y sin cálculos. La antropometría con
protocolo ISAK es la herramienta de trabajo diaria del sector.

## Decisión

- **Protocolo**: **ISAK perfil restringido**, más un **bloque opcional para Kerr**:
  - **Restringido:** masa, talla, 8 pliegues, 5 perímetros y 3 diámetros.
  - **Bloque Kerr:** perímetros de antebrazo, tórax, muslo medio y cabeza; diámetros
    biacromial, biiliocrestídeo, tórax transverso y anteroposterior; y talla sentado.
- **Tomas**: dos por sitio. Si difieren más de 5% (pliegues) o 1% (el resto), la tercera
  es **obligatoria**, validada por la API y avisada en la UI. El valor final es la media
  de dos o la mediana de tres.
- **Se guardan las tomas crudas, no los resultados**: los cálculos se hacen **al leer**,
  con funciones puras en `packages/shared` (`anthropometryResults`), con el sexo de la
  ficha y la edad a la fecha de la medición. Una corrección de fórmula alcanza a todas
  las sesiones.
- **Cálculos**:
  - Σ6 y Σ8 pliegues.
  - % graso por **Durnin-Womersley + Siri**, **Yuhasz** (Carter) y **Faulkner**.
  - **Somatotipo Heath-Carter**, con coordenadas de la somatocarta.
  - **Fraccionamiento en 5 componentes de Kerr (1988)**, con la diferencia contra la
    masa medida (±5% aceptable) y el índice músculo/óseo.

  Lo que no se puede calcular dice por qué: sitios faltantes, sexo no binario en la
  ficha, o edad menor a 17 para Durnin-Womersley.
- **Beta hasta validar**: con `ANTHROPOMETRY_VALIDATED = false` la UI profesional lo avisa
  y el **portal no devuelve nada**, aunque el profesional lo marque visible. La
  validación está en [`docs/validation/antropometria.md`](../validation/antropometria.md).
  **Habilitada el 2026-10-20** por decisión de la nutricionista: la marca pasó a `true`
  y el portal muestra lo que el profesional marque visible. Volver a `false` la
  apaga sin migración.
- **Portal**: lo que el profesional marque, con las mismas claves del mapa de
  visibilidad clínica (`anthroSkinfolds`, `anthroFat`, `anthroKerr`,
  `anthroSomatotype`). Por defecto, nada.
- **Permisos y scoping**: los de las mediciones (`metric:read`, `metric:record`;
  profesional → asignados). Tabla `anthropometry_sessions` bajo RLS; editable y
  borrable para corregir errores de carga, con auditoría.

## Alternativas descartadas

- **Pliegues libres**: sin un protocolo fijo no se pueden comparar deportistas ni
  temporadas.
- **ISAK completo de entrada**: 39 medidas; el bloque Kerr cubre lo que se usa en clubes.
- **Jackson-Pollock**: en varones usa el pliegue de pecho, que ISAK no mide.
- **Guardar los resultados**: congelaría un error de fórmula en cada sesión vieja. El
  reporte mensual ya congela lo que ve el deportista.

## Consecuencias

- Juveniles: Durnin-Womersley no aplica a menores de 17. Para divisiones inferiores
  harían falta ecuaciones pediátricas (por ejemplo, Slaughter), que quedan pendientes.
- Carga por plantel: resuelta en [ADR 0031](0031-grupos-y-carga-por-plantel.md), con
  grupos de deportistas.
