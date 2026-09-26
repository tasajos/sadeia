-- =====================================================================
--  SADE-IA · Sistema de Apoyo a la Decisión para Emergencias
--  Base de datos: sadeia_db (MySQL 8.x · utf8mb4)
--  Modelo derivado de la Tabla N° 23 de la tesis (3FN).
-- =====================================================================

CREATE DATABASE IF NOT EXISTS sadeia_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE sadeia_db;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS informe_foto, informe_sitio, despacho, reporte_foto, reporte_ciudadano, equipo,
  asignacion_recurso, recurso, tarea_avance, tarea, recomendacion, evento,
  alerta_notificacion, alerta, prediccion, modelo_version, modelo_ia,
  lectura_descartada, lectura, fuente_datos, variable, umbral, amenaza_institucion, amenaza,
  reporte_generado, bitacora, usuario, rol_permiso, permiso, rol, institucion, secuencia;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- Correlativos legibles (ALT-2026-0412, EVT-2026-118, REP-2026-0931 …)
-- ---------------------------------------------------------------------
CREATE TABLE secuencia (
  prefijo  VARCHAR(10) NOT NULL,
  gestion  SMALLINT    NOT NULL,
  ultimo   INT         NOT NULL DEFAULT 0,
  PRIMARY KEY (prefijo, gestion)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Seguridad: institución, rol, permiso, usuario (RF-14, RF-16, RNF-04)
-- ---------------------------------------------------------------------
CREATE TABLE institucion (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  sigla        VARCHAR(30)  NOT NULL UNIQUE,
  nombre       VARCHAR(150) NOT NULL,
  tipo         ENUM('Nacional','Departamental','Municipal','Técnica','Primera respuesta','Otra') NOT NULL DEFAULT 'Otra',
  departamento VARCHAR(40)  NULL,
  icono        VARCHAR(40)  NOT NULL DEFAULT 'apartment',
  webhook_url  VARCHAR(255) NULL COMMENT 'Canal externo opcional de notificación',
  activa       TINYINT(1)   NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE rol (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  codigo      VARCHAR(30)  NOT NULL UNIQUE,
  nombre      VARCHAR(60)  NOT NULL,
  descripcion VARCHAR(255) NULL
) ENGINE=InnoDB;

CREATE TABLE permiso (
  id      INT AUTO_INCREMENT PRIMARY KEY,
  codigo  VARCHAR(60)  NOT NULL UNIQUE,
  modulo  VARCHAR(40)  NOT NULL,
  nombre  VARCHAR(120) NOT NULL,
  orden   INT NOT NULL DEFAULT 0
) ENGINE=InnoDB;

CREATE TABLE rol_permiso (
  rol_id     INT NOT NULL,
  permiso_id INT NOT NULL,
  PRIMARY KEY (rol_id, permiso_id),
  FOREIGN KEY (rol_id) REFERENCES rol(id) ON DELETE CASCADE,
  FOREIGN KEY (permiso_id) REFERENCES permiso(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE usuario (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  username         VARCHAR(40)  NOT NULL UNIQUE,
  email            VARCHAR(120) NOT NULL UNIQUE,
  nombre           VARCHAR(120) NOT NULL,
  password_hash    VARCHAR(100) NOT NULL COMMENT 'bcrypt: nunca texto plano',
  rol_id           INT NOT NULL,
  institucion_id   INT NOT NULL,
  equipo_id        INT NULL COMMENT 'Solo para rol RESCATE',
  telefono         VARCHAR(30) NULL,
  estado           ENUM('Activo','Bloqueado') NOT NULL DEFAULT 'Activo',
  intentos_fallidos INT NOT NULL DEFAULT 0,
  ultimo_acceso    DATETIME NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (rol_id) REFERENCES rol(id),
  FOREIGN KEY (institucion_id) REFERENCES institucion(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Amenazas y umbrales normados (RF-04, RNF-05, RNF-09)
-- ---------------------------------------------------------------------
CREATE TABLE amenaza (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  codigo      VARCHAR(10)  NOT NULL UNIQUE,
  nombre      VARCHAR(60)  NOT NULL,
  icono       VARCHAR(40)  NOT NULL,
  horizonte   VARCHAR(20)  NOT NULL DEFAULT '48 h',
  descripcion VARCHAR(255) NULL,
  activa      TINYINT(1)   NOT NULL DEFAULT 1
) ENGINE=InnoDB;

-- Instituciones que se notifican por tipo de amenaza (notificación simultánea RF-06)
CREATE TABLE amenaza_institucion (
  amenaza_id     INT NOT NULL,
  institucion_id INT NOT NULL,
  PRIMARY KEY (amenaza_id, institucion_id),
  FOREIGN KEY (amenaza_id) REFERENCES amenaza(id) ON DELETE CASCADE,
  FOREIGN KEY (institucion_id) REFERENCES institucion(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Variables observables con rango físico para control de calidad (RF-02)
CREATE TABLE variable (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  codigo      VARCHAR(40)  NOT NULL UNIQUE,
  nombre      VARCHAR(120) NOT NULL,
  unidad      VARCHAR(20)  NOT NULL,
  min_fisico  DECIMAL(12,3) NULL,
  max_fisico  DECIMAL(12,3) NULL,
  max_salto   DECIMAL(12,3) NULL COMMENT 'Variación máxima plausible entre lecturas consecutivas'
) ENGINE=InnoDB;

-- Umbrales configurables por amenaza y (opcionalmente) por región
CREATE TABLE umbral (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  amenaza_id   INT NOT NULL,
  variable_id  INT NOT NULL,
  region       VARCHAR(60) NULL COMMENT 'NULL = umbral nacional',
  operador     ENUM('>=','<=') NOT NULL DEFAULT '>=',
  valor        DECIMAL(12,3) NOT NULL,
  base         DECIMAL(12,3) NOT NULL DEFAULT 0 COMMENT 'Valor neutro (0 % de la barra)',
  escala_max   DECIMAL(12,3) NOT NULL COMMENT 'Valor para representar 100 % en la barra de sustento',
  peso         DECIMAL(5,2)  NOT NULL DEFAULT 1.00,
  FOREIGN KEY (amenaza_id) REFERENCES amenaza(id) ON DELETE CASCADE,
  FOREIGN KEY (variable_id) REFERENCES variable(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Ingesta (RF-01, RF-02)
-- ---------------------------------------------------------------------
CREATE TABLE fuente_datos (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  nombre           VARCHAR(150) NOT NULL,
  institucion_id   INT NOT NULL,
  adaptador        ENUM('API REST','SFTP / CSV','Formulario','MQTT') NOT NULL DEFAULT 'API REST',
  url              VARCHAR(255) NULL,
  api_key          VARCHAR(80)  NULL COMMENT 'Clave para ingesta push (cabecera x-api-key)',
  periodicidad_min INT NOT NULL DEFAULT 15,
  ultima_sinc      DATETIME NULL,
  calidad          DECIMAL(5,2) NULL,
  estado           ENUM('Operativa','Retrasada','Con errores','Inactiva') NOT NULL DEFAULT 'Operativa',
  ultimo_error     VARCHAR(255) NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (institucion_id) REFERENCES institucion(id)
) ENGINE=InnoDB;

-- Serie histórica de lecturas: particionada por año (sin FK por restricción de MySQL en tablas particionadas)
CREATE TABLE lectura (
  id           BIGINT NOT NULL AUTO_INCREMENT,
  fecha_hora   DATETIME NOT NULL,
  fuente_id    INT NOT NULL,
  estacion     VARCHAR(120) NOT NULL,
  departamento VARCHAR(40)  NULL,
  municipio    VARCHAR(80)  NULL,
  lat          DECIMAL(9,6) NULL,
  lng          DECIMAL(9,6) NULL,
  variable_id  INT NOT NULL,
  valor        DECIMAL(12,3) NOT NULL,
  PRIMARY KEY (id, fecha_hora),
  KEY idx_lectura_est_var (estacion, variable_id, fecha_hora),
  KEY idx_lectura_fuente (fuente_id, fecha_hora)
) ENGINE=InnoDB
PARTITION BY RANGE (YEAR(fecha_hora)) (
  PARTITION p2024 VALUES LESS THAN (2025),
  PARTITION p2025 VALUES LESS THAN (2026),
  PARTITION p2026 VALUES LESS THAN (2027),
  PARTITION p2027 VALUES LESS THAN (2028),
  PARTITION pmax  VALUES LESS THAN MAXVALUE
);

CREATE TABLE lectura_descartada (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  fecha_hora  DATETIME NOT NULL,
  fuente_id   INT NOT NULL,
  estacion    VARCHAR(120) NOT NULL,
  variable    VARCHAR(40)  NOT NULL,
  valor_texto VARCHAR(60)  NULL,
  motivo      ENUM('Fuera de rango físico','Salto no plausible','Lectura vacía','Variable desconocida','Anomalía detectada') NOT NULL,
  KEY idx_desc_fecha (fecha_hora),
  FOREIGN KEY (fuente_id) REFERENCES fuente_datos(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- IA (RF-03, RF-17)
-- ---------------------------------------------------------------------
CREATE TABLE modelo_ia (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  codigo      VARCHAR(10)  NOT NULL UNIQUE,
  amenaza_id  INT NULL,
  nombre      VARCHAR(80)  NOT NULL,
  icono       VARCHAR(40)  NOT NULL,
  algoritmo   VARCHAR(80)  NOT NULL,
  FOREIGN KEY (amenaza_id) REFERENCES amenaza(id)
) ENGINE=InnoDB;

CREATE TABLE modelo_version (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  modelo_id     INT NOT NULL,
  version       VARCHAR(10)  NOT NULL,
  fecha         DATETIME     NOT NULL,
  datos_entrenamiento VARCHAR(120) NULL,
  f1            DECIMAL(4,3) NULL,
  auc           DECIMAL(4,3) NULL,
  recall_m      DECIMAL(4,3) NULL,
  estado        ENUM('En producción','Archivada','Entrenando','Fallida') NOT NULL DEFAULT 'Archivada',
  entrenado_por INT NULL,
  UNIQUE KEY uq_modelo_version (modelo_id, version),
  FOREIGN KEY (modelo_id) REFERENCES modelo_ia(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE prediccion (
  id                BIGINT AUTO_INCREMENT PRIMARY KEY,
  modelo_version_id INT NOT NULL,
  amenaza_id        INT NOT NULL,
  departamento      VARCHAR(40) NULL,
  lugar             VARCHAR(120) NOT NULL,
  lat               DECIMAL(9,6) NULL,
  lng               DECIMAL(9,6) NULL,
  probabilidad      DECIMAL(4,3) NOT NULL,
  horizonte         VARCHAR(20)  NOT NULL,
  nivel             ENUM('verde','amarilla','naranja','roja') NOT NULL,
  variables         JSON NOT NULL COMMENT 'Explicabilidad RNF-05: variable, valor, umbral',
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (modelo_version_id) REFERENCES modelo_version(id),
  FOREIGN KEY (amenaza_id) REFERENCES amenaza(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Alerta temprana (RF-05, RF-06, RF-07)
-- ---------------------------------------------------------------------
CREATE TABLE alerta (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  codigo           VARCHAR(20) NOT NULL UNIQUE,
  prediccion_id    BIGINT NULL,
  amenaza_id       INT NOT NULL,
  departamento     VARCHAR(40)  NULL,
  lugar            VARCHAR(120) NOT NULL,
  lat              DECIMAL(9,6) NULL,
  lng              DECIMAL(9,6) NULL,
  nivel            ENUM('verde','amarilla','naranja','roja') NOT NULL,
  nivel_propuesto  ENUM('verde','amarilla','naranja','roja') NOT NULL COMMENT 'Se conserva la propuesta original',
  probabilidad     DECIMAL(4,3) NOT NULL,
  horizonte        VARCHAR(20)  NOT NULL,
  modelo           VARCHAR(20)  NULL,
  sustento         JSON NOT NULL,
  estado           ENUM('Pendiente de validación','Modificada · pendiente','Emitida no notificada','Validada y notificada','Notificada','Descartada','Cerrada') NOT NULL DEFAULT 'Pendiente de validación',
  justificacion    TEXT NULL,
  creado_por       VARCHAR(40) NOT NULL DEFAULT 'motor-ia',
  validado_por     INT NULL COMMENT 'RF-07: usuario que validó/descartó',
  fecha_validacion DATETIME NULL,
  reintentos       INT NOT NULL DEFAULT 0,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_alerta_estado (estado),
  FOREIGN KEY (amenaza_id) REFERENCES amenaza(id),
  FOREIGN KEY (prediccion_id) REFERENCES prediccion(id),
  FOREIGN KEY (validado_por) REFERENCES usuario(id)
) ENGINE=InnoDB;

CREATE TABLE alerta_notificacion (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  alerta_id          INT NOT NULL,
  institucion_id     INT NOT NULL,
  estado             ENUM('Pendiente','Enviada','Fallida','Confirmada') NOT NULL DEFAULT 'Pendiente',
  fecha_envio        DATETIME NULL,
  fecha_confirmacion DATETIME NULL,
  confirmado_por     INT NULL,
  UNIQUE KEY uq_alerta_inst (alerta_id, institucion_id),
  FOREIGN KEY (alerta_id) REFERENCES alerta(id) ON DELETE CASCADE,
  FOREIGN KEY (institucion_id) REFERENCES institucion(id),
  FOREIGN KEY (confirmado_por) REFERENCES usuario(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Eventos y apoyo a la decisión (RF-08, RF-09)
-- ---------------------------------------------------------------------
CREATE TABLE evento (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  codigo        VARCHAR(20)  NOT NULL UNIQUE,
  titulo        VARCHAR(150) NOT NULL,
  amenaza_id    INT NOT NULL,
  alerta_id     INT NULL,
  departamento  VARCHAR(40)  NULL,
  lugar         VARCHAR(120) NOT NULL,
  lat           DECIMAL(9,6) NULL,
  lng           DECIMAL(9,6) NULL,
  nivel         ENUM('verde','amarilla','naranja','roja') NOT NULL,
  fecha_inicio  DATETIME NOT NULL,
  fecha_cierre  DATETIME NULL,
  impacto       VARCHAR(150) NULL,
  usa_protocolo TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Flujo 3.a: histórico insuficiente',
  estado        ENUM('En curso','Cerrado') NOT NULL DEFAULT 'En curso',
  registrado_por INT NULL,
  FOREIGN KEY (amenaza_id) REFERENCES amenaza(id),
  FOREIGN KEY (alerta_id) REFERENCES alerta(id),
  FOREIGN KEY (registrado_por) REFERENCES usuario(id)
) ENGINE=InnoDB;

CREATE TABLE recomendacion (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  evento_id         INT NOT NULL,
  orden             INT NOT NULL,
  titulo            VARCHAR(200) NOT NULL,
  sustento          TEXT NOT NULL,
  instituciones     VARCHAR(150) NOT NULL,
  institucion_id    INT NULL COMMENT 'Institución que recibe la tarea generada',
  recursos          VARCHAR(150) NULL,
  confianza         DECIMAL(4,3) NULL COMMENT 'NULL = protocolo normado',
  estado            ENUM('Pendiente','Aprobada','Modificada','Descartada') NOT NULL DEFAULT 'Pendiente',
  titulo_modificado VARCHAR(200) NULL,
  decidido_por      INT NULL,
  fecha_decision    DATETIME NULL,
  FOREIGN KEY (evento_id) REFERENCES evento(id) ON DELETE CASCADE,
  FOREIGN KEY (institucion_id) REFERENCES institucion(id),
  FOREIGN KEY (decidido_por) REFERENCES usuario(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Coordinación y recursos (RF-10, RF-11)
-- ---------------------------------------------------------------------
CREATE TABLE tarea (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  codigo           VARCHAR(20)  NOT NULL UNIQUE,
  evento_id        INT NOT NULL,
  recomendacion_id INT NULL,
  titulo           VARCHAR(200) NOT NULL,
  institucion_id   INT NOT NULL COMMENT 'Se asigna a la institución, no a la persona',
  responsable      VARCHAR(120) NULL,
  plazo            DATETIME NOT NULL,
  estado           ENUM('Pendiente','En curso','Completada','Vencida') NOT NULL DEFAULT 'Pendiente',
  avance           TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (evento_id) REFERENCES evento(id),
  FOREIGN KEY (recomendacion_id) REFERENCES recomendacion(id),
  FOREIGN KEY (institucion_id) REFERENCES institucion(id)
) ENGINE=InnoDB;

CREATE TABLE tarea_avance (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  tarea_id    INT NOT NULL,
  usuario_id  INT NOT NULL,
  avance      TINYINT UNSIGNED NOT NULL,
  observacion TEXT NULL,
  foto        VARCHAR(255) NULL,
  lat         DECIMAL(9,6) NULL,
  lng         DECIMAL(9,6) NULL,
  fecha       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tarea_id) REFERENCES tarea(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuario(id)
) ENGINE=InnoDB;

CREATE TABLE recurso (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  nombre         VARCHAR(100) NOT NULL,
  institucion_id INT NOT NULL,
  unidad         VARCHAR(30)  NOT NULL DEFAULT 'unidades',
  total          INT NOT NULL,
  FOREIGN KEY (institucion_id) REFERENCES institucion(id)
) ENGINE=InnoDB;

-- Entidad asociativa M:N recurso ↔ evento con cantidad y fecha
CREATE TABLE asignacion_recurso (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  recurso_id  INT NOT NULL,
  evento_id   INT NOT NULL,
  cantidad    INT NOT NULL,
  fecha       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  estado      ENUM('Asignado','Liberado') NOT NULL DEFAULT 'Asignado',
  fecha_liberacion DATETIME NULL,
  asignado_por INT NULL,
  FOREIGN KEY (recurso_id) REFERENCES recurso(id),
  FOREIGN KEY (evento_id) REFERENCES evento(id),
  FOREIGN KEY (asignado_por) REFERENCES usuario(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Primera respuesta: equipos, reportes ciudadanos y despachos
-- ---------------------------------------------------------------------
CREATE TABLE equipo (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  codigo         VARCHAR(20)  NOT NULL UNIQUE,
  nombre         VARCHAR(100) NOT NULL,
  institucion_id INT NOT NULL,
  tripulacion    VARCHAR(100) NULL,
  icono          VARCHAR(40)  NOT NULL DEFAULT 'fire_truck',
  lat            DECIMAL(9,6) NULL,
  lng            DECIMAL(9,6) NULL,
  ubicacion_at   DATETIME NULL,
  estado         ENUM('Disponible','En misión','Fuera de servicio') NOT NULL DEFAULT 'Disponible',
  FOREIGN KEY (institucion_id) REFERENCES institucion(id)
) ENGINE=InnoDB;

ALTER TABLE usuario ADD CONSTRAINT fk_usuario_equipo FOREIGN KEY (equipo_id) REFERENCES equipo(id);

CREATE TABLE reporte_ciudadano (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  codigo          VARCHAR(20)  NOT NULL UNIQUE,
  token_seguimiento CHAR(32)   NOT NULL,
  tipo            VARCHAR(30)  NOT NULL,
  icono           VARCHAR(40)  NOT NULL,
  titulo          VARCHAR(150) NOT NULL,
  descripcion     TEXT NULL,
  lugar           VARCHAR(150) NULL,
  departamento    VARCHAR(40)  NULL,
  lat             DECIMAL(9,6) NOT NULL,
  lng             DECIMAL(9,6) NOT NULL,
  precision_m     INT NULL,
  personas_riesgo TINYINT(1) NOT NULL DEFAULT 0,
  riesgo_detalle  VARCHAR(150) NULL,
  prioridad       ENUM('CRÍTICA','ALTA','MEDIA','BAJA') NOT NULL,
  estado          ENUM('Nuevo','En revisión','Equipo despachado','Vinculado a evento','Falso / descartado','Atendido') NOT NULL DEFAULT 'Nuevo',
  reportante      VARCHAR(120) NULL,
  telefono        VARCHAR(30)  NULL,
  canal           VARCHAR(60)  NOT NULL DEFAULT 'App ciudadana · GPS automático',
  ia_tipo         VARCHAR(60)  NULL,
  ia_confianza    DECIMAL(4,3) NULL,
  ia_nota         VARCHAR(255) NULL,
  duplicados      VARCHAR(120) NULL,
  alerta_id       INT NULL,
  evento_id       INT NULL,
  revisado_por    INT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_rep_estado (estado),
  FOREIGN KEY (alerta_id) REFERENCES alerta(id),
  FOREIGN KEY (evento_id) REFERENCES evento(id),
  FOREIGN KEY (revisado_por) REFERENCES usuario(id)
) ENGINE=InnoDB;

CREATE TABLE reporte_foto (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  reporte_id INT NOT NULL,
  ruta       VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reporte_id) REFERENCES reporte_ciudadano(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE despacho (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  reporte_id      INT NOT NULL,
  equipo_id       INT NOT NULL,
  estado          ENUM('Despachado','Aceptada','Rechazada','En sitio','Controlada') NOT NULL DEFAULT 'Despachado',
  distancia_km    DECIMAL(6,2) NULL,
  eta_min         INT NULL,
  despachado_por  INT NULL,
  fecha_despacho  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_aceptacion DATETIME NULL,
  fecha_llegada   DATETIME NULL,
  fecha_control   DATETIME NULL,
  FOREIGN KEY (reporte_id) REFERENCES reporte_ciudadano(id),
  FOREIGN KEY (equipo_id) REFERENCES equipo(id),
  FOREIGN KEY (despachado_por) REFERENCES usuario(id)
) ENGINE=InnoDB;

CREATE TABLE informe_sitio (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  despacho_id INT NOT NULL,
  rescatados  INT NOT NULL DEFAULT 0,
  heridos     INT NOT NULL DEFAULT 0,
  viviendas   INT NOT NULL DEFAULT 0,
  apoyos      JSON NULL,
  observacion TEXT NULL,
  usuario_id  INT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (despacho_id) REFERENCES despacho(id),
  FOREIGN KEY (usuario_id) REFERENCES usuario(id)
) ENGINE=InnoDB;

CREATE TABLE informe_foto (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  informe_id INT NOT NULL,
  ruta       VARCHAR(255) NOT NULL,
  FOREIGN KEY (informe_id) REFERENCES informe_sitio(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Reportes y auditoría (RF-13, RF-15, RNF-10)
-- ---------------------------------------------------------------------
CREATE TABLE reporte_generado (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(200) NOT NULL,
  formato     ENUM('PDF','XLSX','CSV') NOT NULL,
  archivo     VARCHAR(255) NULL,
  generado_por VARCHAR(40) NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE bitacora (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  fecha_hora DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  usuario    VARCHAR(40)  NOT NULL,
  operacion  VARCHAR(40)  NOT NULL,
  objeto     VARCHAR(200) NULL,
  ip         VARCHAR(45)  NULL,
  detalle    JSON NULL,
  KEY idx_bitacora_fecha (fecha_hora),
  KEY idx_bitacora_usuario (usuario)
) ENGINE=InnoDB;

-- RNF-10: la bitácora es inalterable. Se bloquea UPDATE y DELETE a nivel de motor.
DROP TRIGGER IF EXISTS trg_bitacora_no_update;
DROP TRIGGER IF EXISTS trg_bitacora_no_delete;
DELIMITER $$
CREATE TRIGGER trg_bitacora_no_update BEFORE UPDATE ON bitacora FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Bitácora inalterable (RNF-10): UPDATE no permitido';
END$$
CREATE TRIGGER trg_bitacora_no_delete BEFORE DELETE ON bitacora FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Bitácora inalterable (RNF-10): DELETE no permitido';
END$$
DELIMITER ;

-- Recomendación de producción: además de los triggers, el usuario de la aplicación
-- debe tener sobre `bitacora` únicamente privilegios SELECT e INSERT (ver README).
