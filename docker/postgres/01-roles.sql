-- Postgres de desarrollo armado como RDS (KAN-88, ADR 0048).
--
-- En RDS el usuario maestro (nutreitor_owner) no es superusuario: tiene CREATEDB y
-- CREATEROLE, es dueño de la base y no ignora RLS. Acá el superusuario es `postgres`
-- (sólo para administrar el contenedor) y nutreitor_owner queda igual que en RDS, así
-- que lo que dependa de un superusuario se rompe en local y en CI, no en producción.
--
-- Corre una sola vez, al crear el volumen.

CREATE ROLE nutreitor_owner LOGIN PASSWORD 'owner_dev_pwd'
  NOSUPERUSER NOBYPASSRLS CREATEDB CREATEROLE;

-- RDS le da al maestro pg_signal_backend (vía rds_superuser): lo usa un test de
-- resiliencia para cortar conexiones.
GRANT pg_signal_backend TO nutreitor_owner;

CREATE DATABASE nutreitor OWNER nutreitor_owner;
