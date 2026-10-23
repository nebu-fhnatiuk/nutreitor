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
