-- =====================================================================
--  SADE-IA · Migración 2026-09-27
--  Recursos que cada institución moviliza para cumplir una tarea del evento
--  (unidades, vehículos, equipamiento, personal y material), visibles para el COEN.
--
--  Solo para bases creadas antes de este cambio (db:reset ya incluye todo):
--    mysql -u <usuario> -p sadeia_db < database/migrations/2026-09-27_tareas_primera_respuesta.sql
-- =====================================================================

CREATE TABLE IF NOT EXISTS tarea_recurso (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  tarea_id      INT NOT NULL,
  tipo          ENUM('unidad','vehiculo','equipamiento','personal','material') NOT NULL,
  ref_id        INT NULL COMMENT 'equipo / vehiculo / equipamiento / usuario según el tipo (NULL para material)',
  descripcion   VARCHAR(150) NOT NULL COMMENT 'Etiqueta legible al momento de movilizar',
  cantidad      INT NOT NULL DEFAULT 1,
  unidad        VARCHAR(30) NULL,
  estado        ENUM('Movilizado','Retornado') NOT NULL DEFAULT 'Movilizado',
  usuario_id    INT NOT NULL,
  fecha         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_retorno DATETIME NULL,
  INDEX ix_tarea_recurso_ref (tipo, ref_id, estado),
  FOREIGN KEY (tarea_id) REFERENCES tarea(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuario(id)
) ENGINE=InnoDB;
