-- =====================================================================
--  SADE-IA · Migración 2026-09-27
--  Cambio obligatorio de contraseña: los usuarios creados por un administrador
--  o con contraseña restablecida deben cambiarla en su primer inicio de sesión.
--
--  Solo para bases creadas antes de este cambio (db:reset ya incluye todo):
--    mysql -u <usuario> -p sadeia_db < database/migrations/2026-09-27_cambio_password.sql
-- =====================================================================

ALTER TABLE usuario
  ADD COLUMN debe_cambiar_password TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Contraseña asignada por otra persona: se exige cambiarla al iniciar sesión' AFTER intentos_fallidos;
