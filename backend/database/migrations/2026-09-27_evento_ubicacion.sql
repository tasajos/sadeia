-- =====================================================================
--  SADE-IA · Migración 2026-09-27
--  Ubicación de eventos en el mapa: radio de afectación y marca de ubicación
--  aproximada (centro del departamento cuando no se marcó el punto).
--
--  Solo para bases creadas antes de este cambio (db:reset ya incluye todo):
--    mysql -u <usuario> -p sadeia_db < database/migrations/2026-09-27_evento_ubicacion.sql
-- =====================================================================

ALTER TABLE evento
  ADD COLUMN radio_km        DECIMAL(5,1) NULL COMMENT 'Radio del área afectada' AFTER lng,
  ADD COLUMN ubicacion_aprox TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Centro del departamento: el COEN debe marcar el punto' AFTER radio_km;

-- Eventos registrados sin coordenadas: se ubican en el centro de su departamento (aproximado)
UPDATE evento SET ubicacion_aprox = 1,
  lat = CASE departamento WHEN 'La Paz' THEN -16.5 WHEN 'Cochabamba' THEN -17.39 WHEN 'Santa Cruz' THEN -17.78 WHEN 'Oruro' THEN -17.97
        WHEN 'Potosí' THEN -19.58 WHEN 'Chuquisaca' THEN -19.05 WHEN 'Tarija' THEN -21.53 WHEN 'Beni' THEN -14.83 WHEN 'Pando' THEN -11.03 END,
  lng = CASE departamento WHEN 'La Paz' THEN -68.15 WHEN 'Cochabamba' THEN -66.16 WHEN 'Santa Cruz' THEN -63.18 WHEN 'Oruro' THEN -67.11
        WHEN 'Potosí' THEN -65.75 WHEN 'Chuquisaca' THEN -65.26 WHEN 'Tarija' THEN -64.73 WHEN 'Beni' THEN -64.9 WHEN 'Pando' THEN -68.77 END
 WHERE lat IS NULL OR lng IS NULL;
