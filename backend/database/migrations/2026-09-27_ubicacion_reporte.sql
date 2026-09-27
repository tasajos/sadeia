-- =====================================================================
--  SADE-IA · Migración 2026-09-27
--  Origen de la ubicación del reporte ciudadano: GPS del teléfono o
--  punto marcado a mano en el mapa (el ciudadano reporta otro lugar).
--
--  Solo para bases creadas antes de este cambio (db:reset ya incluye todo):
--    mysql -u <usuario> -p sadeia_db < database/migrations/2026-09-27_ubicacion_reporte.sql
-- =====================================================================

ALTER TABLE reporte_ciudadano
  ADD COLUMN ubicacion_origen ENUM('GPS','Manual') NOT NULL DEFAULT 'GPS' COMMENT 'GPS del teléfono o punto marcado en el mapa' AFTER precision_m;
