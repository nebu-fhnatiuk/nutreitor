# Datos de demo

Planillas **ficticias** para mostrar y probar el import de deportistas (KAN-42,
ADR 0043). Los nombres son inventados, los emails usan el dominio reservado
`ejemplo.test` (no existe) y los DNI no corresponden a nadie.

- `plantel-demo.csv`: 54 deportistas de un club, en cuatro grupos (`Primera
  división`, `Reserva`, `Femenino`, `Sub-17`). Los de Sub-17 son menores y van sin
  email, así que no se invitan al portal (el acceso del tutor es KAN-7). Uno está en
  dos grupos (`Reserva|Primera división`).
- `plantel-demo-con-errores.csv`: 8 filas, 6 con un error distinto cada una (email,
  fecha imposible, grupo inexistente, profesional inexistente, sexo, DNI repetido),
  para mostrar la vista previa. No se puede importar.

En la organización `demo` los grupos tienen que existir antes de importar; el seed
sólo crea `Primera división`. Los otros se crean desde **Grupos**.

## Datos de salud de la demo

`seed-salud.mjs` carga datos **ficticios** a los deportistas del plantel ya
importado, con los servicios de la API (mismas reglas y auditoría que la pantalla):

- antropometría ISAK completa (con el bloque de Kerr): 3 sesiones en 5 meses, de
  pretemporada a hoy;
- peso y cintura cada 2 semanas;
- a los adultos, además: una prueba de sudoración, el requerimiento con semana tipo
  (entrenamiento, partido el sábado, descanso), un plan activo, la frecuencia de
  consumo y 55 días de adherencia con perfiles distintos (cumplidor, intermedio,
  flojo);
- el reporte de septiembre publicado para Primera división.

La adherencia la marca el deportista desde el portal; como estos no tienen cuenta,
el script la escribe directo en la base. Los Sub-17 se asignan al Profesional Demo.

```sh
docker compose exec -T api sh -c "cd /app && pnpm --filter @nutreitor/api build"
docker compose exec -T api sh -c "cd /app/apps/api && node --input-type=module < /app/tools/demo-data/seed-salud.mjs"
```

Es idempotente: saltea a quien ya tiene antropometría.
