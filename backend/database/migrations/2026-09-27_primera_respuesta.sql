-- =====================================================================
--  SADE-IA · Migración 2026-09-27
--  Instituciones con ubicación y jurisdicción, rol "Equipo de primera respuesta"
--  y recursos propios de cada institución (vehículos, equipamiento, especialidades).
--
--  Solo para bases creadas antes de este cambio (db:reset ya incluye todo):
--    mysql -u <usuario> -p sadeia_db < database/migrations/2026-09-27_primera_respuesta.sql
-- =====================================================================

ALTER TABLE institucion
  ADD COLUMN sede      VARCHAR(150) NULL COMMENT 'Lugar, sede o compañía donde se encuentra' AFTER icono,
  ADD COLUMN municipio VARCHAR(80)  NULL AFTER sede,
  ADD COLUMN telefono  VARCHAR(30)  NULL AFTER municipio,
  ADD COLUMN lat       DECIMAL(9,6) NULL AFTER telefono,
  ADD COLUMN lng       DECIMAL(9,6) NULL AFTER lat,
  ADD COLUMN radio_km  INT NOT NULL DEFAULT 50 COMMENT 'Radio de jurisdicción: emergencias cercanas que ve la institución' AFTER lng;

CREATE TABLE IF NOT EXISTS vehiculo (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  institucion_id INT NOT NULL,
  codigo         VARCHAR(20)  NOT NULL COMMENT 'Código interno o número de unidad',
  placa          VARCHAR(20)  NULL,
  tipo           VARCHAR(40)  NOT NULL,
  marca_modelo   VARCHAR(80)  NULL,
  anio           SMALLINT     NULL,
  capacidad      VARCHAR(80)  NULL,
  estado         ENUM('Operativo','En mantenimiento','Fuera de servicio') NOT NULL DEFAULT 'Operativo',
  equipo_id      INT NULL COMMENT 'Unidad de respuesta a la que está asignado',
  observacion    VARCHAR(255) NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_vehiculo_codigo (institucion_id, codigo),
  FOREIGN KEY (institucion_id) REFERENCES institucion(id),
  FOREIGN KEY (equipo_id) REFERENCES equipo(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS equipamiento (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  institucion_id INT NOT NULL,
  nombre         VARCHAR(100) NOT NULL,
  categoria      VARCHAR(40)  NOT NULL,
  cantidad       INT NOT NULL DEFAULT 1,
  unidad         VARCHAR(30)  NOT NULL DEFAULT 'unidades',
  estado         ENUM('Operativo','En mantenimiento','De baja') NOT NULL DEFAULT 'Operativo',
  vehiculo_id    INT NULL COMMENT 'Vehículo donde se transporta',
  observacion    VARCHAR(255) NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (institucion_id) REFERENCES institucion(id),
  FOREIGN KEY (vehiculo_id) REFERENCES vehiculo(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS especialidad (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  institucion_id INT NOT NULL,
  nombre         VARCHAR(80)  NOT NULL,
  descripcion    VARCHAR(255) NULL,
  icono          VARCHAR(40)  NOT NULL DEFAULT 'workspace_premium',
  UNIQUE KEY uq_especialidad (institucion_id, nombre),
  FOREIGN KEY (institucion_id) REFERENCES institucion(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS usuario_especialidad (
  usuario_id      INT NOT NULL,
  especialidad_id INT NOT NULL,
  PRIMARY KEY (usuario_id, especialidad_id),
  FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE,
  FOREIGN KEY (especialidad_id) REFERENCES especialidad(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- El rol "Equipo de rescate" pasa a ser "Equipo de primera respuesta" (uno por institución, vía usuario.institucion_id)
UPDATE rol SET codigo = 'PRIMERA_RESPUESTA', nombre = 'Equipo de primera respuesta',
       descripcion = 'Equipo de primera respuesta de su institución: atiende despachos, gestiona su personal, vehículos, equipamiento y especialidades.'
 WHERE codigo = 'RESCATE';
UPDATE permiso SET modulo = 'Primera respuesta', nombre = 'Recibir misiones en la app móvil de primera respuesta' WHERE codigo = 'rescate.misiones';

INSERT IGNORE INTO permiso (codigo, modulo, nombre, orden) VALUES
  ('admin.instituciones', 'Sistema', 'Administrar instituciones y su ubicación', 81),
  ('respuesta.ver', 'Primera respuesta', 'Ver emergencias despachadas en su jurisdicción', 90),
  ('respuesta.atender', 'Primera respuesta', 'Aceptar y actualizar despachos de su institución', 91),
  ('respuesta.usuarios', 'Primera respuesta', 'Crear y administrar usuarios de su institución', 92),
  ('respuesta.recursos', 'Primera respuesta', 'Registrar unidades, vehículos, equipamiento y especialidades', 93);

INSERT IGNORE INTO rol_permiso (rol_id, permiso_id)
  SELECT r.id, p.id FROM rol r JOIN permiso p ON p.codigo = 'admin.instituciones' WHERE r.codigo = 'ADMIN';
INSERT IGNORE INTO rol_permiso (rol_id, permiso_id)
  SELECT r.id, p.id FROM rol r JOIN permiso p ON p.codigo IN ('respuesta.ver','respuesta.atender','respuesta.usuarios','respuesta.recursos')
   WHERE r.codigo = 'PRIMERA_RESPUESTA';
