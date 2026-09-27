/**
 * Datos iniciales y de demostración de SADE-IA (basados en el prototipo de la tesis).
 * Uso: npm run db:seed   (después de npm run db:init)
 * Todas las fechas se generan relativas al momento de ejecución para que la demo luzca "en vivo".
 * Contraseña de todos los usuarios demo: Sadeia2026!
 */
import bcrypt from 'bcryptjs';
import { pool, q, one } from '../src/config/db.js';
import { explain } from '../src/services/inferenceService.js';
import { institucionesConcernidas } from '../src/services/notificationService.js';

const PASSWORD = 'Sadeia2026!';
const now = Date.now();
const ago = (min) => new Date(now - min * 60000);
const ahead = (min) => new Date(now + min * 60000);
const ins = async (sql, params) => (await pool.query(sql, params))[0].insertId;

console.log('[seed] Insertando catálogos…');

/* ------------------------------ Instituciones ------------------------------ */
// sigla, nombre, tipo, departamento, icono, sede, municipio, lat, lng, radio de jurisdicción (km)
const INST = [
  ['COEN', 'Centro de Operaciones de Emergencia Nacional', 'Nacional', 'La Paz', 'hub', 'Edificio COEN, Av. Arce', 'La Paz', -16.5092, -68.1261, 1500],
  ['VIDECI', 'Viceministerio de Defensa Civil', 'Nacional', 'La Paz', 'shield', 'Ministerio de Defensa, Plaza Avaroa', 'La Paz', -16.5105, -68.1250, 1500],
  ['FFAA', 'FF.AA. · Octava División', 'Nacional', 'Santa Cruz', 'military_tech', 'Comando de la Octava División', 'Santa Cruz de la Sierra', -17.7650, -63.1820, 1500],
  ['POL', 'Policía Boliviana', 'Nacional', 'La Paz', 'local_police', 'Comando General de la Policía', 'La Paz', -16.4970, -68.1340, 1500],
  ['SENAMHI', 'SENAMHI', 'Técnica', 'La Paz', 'thermostat', 'Oficina central SENAMHI', 'La Paz', -16.5060, -68.1190, 1500],
  ['SNHN', 'Servicio Nacional de Hidrografía Naval', 'Técnica', 'La Paz', 'sailing', 'Oficina central SNHN', 'La Paz', -16.5200, -68.1100, 1500],
  ['ABT', 'ABT', 'Técnica', 'Santa Cruz', 'forest', 'Oficina central ABT', 'Santa Cruz de la Sierra', -17.7830, -63.1700, 1500],
  ['NASA', 'NASA FIRMS', 'Técnica', null, 'satellite_alt', null, null, null, null, 1500],
  ['OSC', 'Observatorio San Calixto', 'Técnica', 'La Paz', 'earthquake', 'Observatorio San Calixto', 'La Paz', -16.4950, -68.1370, 1500],
  ['UTI', 'UTI', 'Otra', 'La Paz', 'dns', 'Centro de datos UTI', 'La Paz', -16.5090, -68.1270, 1500],
  ['GOB-BENI', 'Gobernación del Beni', 'Departamental', 'Beni', 'account_balance', 'Palacio de Gobierno, Plaza Mcal. Ballivián', 'Trinidad', -14.8340, -64.9040, 400],
  ['GAM-TDD', 'GAM Trinidad', 'Municipal', 'Beni', 'location_city', 'Alcaldía de Trinidad', 'Trinidad', -14.8330, -64.9010, 40],
  ['SEDES-BENI', 'SEDES Beni', 'Primera respuesta', 'Beni', 'local_hospital', 'Hospital Presidente Germán Busch', 'Trinidad', -14.8300, -64.9050, 60],
  ['SAR-BENI', 'Voluntarios SAR Beni', 'Primera respuesta', 'Beni', 'health_and_safety', 'Base SAR Beni', 'Trinidad', -14.8000, -64.9300, 80],
  ['GOB-SCZ', 'Gobernación de Santa Cruz', 'Departamental', 'Santa Cruz', 'account_balance', 'Gobernación, Plaza 24 de Septiembre', 'Santa Cruz de la Sierra', -17.7840, -63.1810, 500],
  ['GAM-LPZ', 'GAM La Paz', 'Municipal', 'La Paz', 'location_city', 'Palacio Consistorial', 'La Paz', -16.4960, -68.1330, 40],
  ['GOB-ORU', 'Gobernación de Oruro', 'Departamental', 'Oruro', 'account_balance', 'Gobernación de Oruro', 'Oruro', -17.9670, -67.1140, 300],
  ['GAM-SAC', 'GAM Sacaba', 'Municipal', 'Cochabamba', 'location_city', 'Alcaldía de Sacaba', 'Sacaba', -17.4000, -66.0400, 30],
  ['GOB-PTS', 'Gobernación de Potosí', 'Departamental', 'Potosí', 'account_balance', 'Gobernación de Potosí', 'Potosí', -19.5890, -65.7530, 400]
];
const I = {};
for (const [sigla, nombre, tipo, dep, icono, sede, mun, lat, lng, radio] of INST) {
  // GAM La Paz con un canal externo caído: demuestra el reintento automático de notificación (flujo 7.a).
  const webhook = sigla === 'GAM-LPZ' ? 'http://127.0.0.1:9/webhook-no-disponible' : null;
  I[sigla] = await ins('INSERT INTO institucion (sigla, nombre, tipo, departamento, icono, sede, municipio, lat, lng, radio_km, webhook_url) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    [sigla, nombre, tipo, dep, icono, sede, mun, lat, lng, radio, webhook]);
}

/* ------------------------------ Roles y permisos ------------------------------ */
const ROLES = [
  ['OPERADOR', 'Operador', 'Operador del COEN: propone y emite alertas, recibe reportes ciudadanos y despacha equipos.'],
  ['ANALISTA', 'Analista técnico', 'Analista de institución técnica: fuentes de datos, modelos y umbrales.'],
  ['DECISOR', 'Decisor', 'Autoridad competente: valida alertas y aprueba cursos de acción.'],
  ['ENLACE', 'Enlace', 'Enlace interinstitucional: recibe alertas y reporta avance de tareas.'],
  ['ADMIN', 'Administrador', 'Administración de usuarios, roles, permisos y auditoría.'],
  ['PRIMERA_RESPUESTA', 'Equipo de primera respuesta', 'Equipo de primera respuesta de su institución: atiende despachos y gestiona su personal, vehículos, equipamiento y especialidades.']
];
const R = {};
for (const [codigo, nombre, desc] of ROLES) R[codigo] = await ins('INSERT INTO rol (codigo, nombre, descripcion) VALUES (?,?,?)', [codigo, nombre, desc]);

const PERMISOS = [
  ['tablero.ver', 'Operación', 'Ver tablero de situación', ['OPERADOR', 'ANALISTA', 'DECISOR', 'ENLACE', 'ADMIN', 'PRIMERA_RESPUESTA']],
  ['alertas.ver', 'Operación', 'Ver alertas tempranas', ['OPERADOR', 'ANALISTA', 'DECISOR', 'ADMIN']],
  ['alertas.gestionar', 'Operación', 'Emitir, modificar o descartar alertas', ['OPERADOR', 'DECISOR', 'ADMIN']],
  ['alertas.validar', 'Operación', 'Validar alertas como autoridad competente', ['DECISOR', 'ADMIN']],
  ['alertas.confirmar', 'Operación', 'Confirmar recepción de alertas (institución)', ['ENLACE', 'OPERADOR', 'DECISOR', 'ADMIN']],
  ['eventos.ver', 'Operación', 'Ver eventos y recomendaciones', ['OPERADOR', 'DECISOR', 'ADMIN']],
  ['eventos.gestionar', 'Operación', 'Registrar y cerrar eventos', ['OPERADOR', 'DECISOR', 'ADMIN']],
  ['recomendaciones.decidir', 'Operación', 'Aprobar, modificar o descartar recomendaciones', ['DECISOR', 'ADMIN']],
  ['ciudadanos.ver', 'Operación', 'Ver reportes ciudadanos', ['OPERADOR', 'DECISOR', 'ADMIN']],
  ['ciudadanos.gestionar', 'Operación', 'Despachar equipos y gestionar reportes ciudadanos', ['OPERADOR', 'DECISOR', 'ADMIN']],
  ['coordinacion.ver', 'Operación', 'Ver coordinación interinstitucional', ['OPERADOR', 'DECISOR', 'ENLACE', 'ADMIN']],
  ['coordinacion.gestionar', 'Operación', 'Crear tareas y asignar recursos', ['OPERADOR', 'DECISOR', 'ADMIN']],
  ['tareas.reportar', 'Operación', 'Reportar avance de tareas de su institución', ['ENLACE', 'OPERADOR', 'DECISOR', 'ADMIN']],
  ['fuentes.ver', 'Análisis', 'Ver fuentes de datos y lecturas', ['ANALISTA', 'ADMIN']],
  ['fuentes.gestionar', 'Análisis', 'Registrar fuentes, variables y cargar lecturas', ['ANALISTA', 'ADMIN']],
  ['modelos.ver', 'Análisis', 'Ver modelos de IA', ['ANALISTA', 'ADMIN']],
  ['modelos.reentrenar', 'Análisis', 'Reentrenar modelos y ajustar umbrales', ['ANALISTA', 'ADMIN']],
  ['reportes.ver', 'Análisis', 'Ver reportes e indicadores', ['OPERADOR', 'ANALISTA', 'DECISOR', 'ADMIN']],
  ['reportes.exportar', 'Análisis', 'Exportar reportes (PDF, XLSX, CSV)', ['OPERADOR', 'ANALISTA', 'DECISOR', 'ADMIN']],
  ['admin.usuarios', 'Sistema', 'Administrar usuarios', ['ADMIN']],
  ['admin.roles', 'Sistema', 'Administrar roles y permisos', ['ADMIN']],
  ['admin.instituciones', 'Sistema', 'Administrar instituciones y su ubicación', ['ADMIN']],
  ['bitacora.ver', 'Sistema', 'Consultar bitácora de auditoría', ['ADMIN']],
  ['respuesta.ver', 'Primera respuesta', 'Ver emergencias despachadas en su jurisdicción', ['PRIMERA_RESPUESTA']],
  ['respuesta.atender', 'Primera respuesta', 'Aceptar y actualizar despachos de su institución', ['PRIMERA_RESPUESTA']],
  ['respuesta.usuarios', 'Primera respuesta', 'Crear y administrar usuarios de su institución', ['PRIMERA_RESPUESTA']],
  ['respuesta.recursos', 'Primera respuesta', 'Registrar unidades, vehículos, equipamiento y especialidades', ['PRIMERA_RESPUESTA']],
  ['rescate.misiones', 'Primera respuesta', 'Recibir misiones en la app móvil de primera respuesta', ['PRIMERA_RESPUESTA']]
];
let orden = 0;
for (const [codigo, modulo, nombre, roles] of PERMISOS) {
  const pid = await ins('INSERT INTO permiso (codigo, modulo, nombre, orden) VALUES (?,?,?,?)', [codigo, modulo, nombre, ++orden]);
  for (const r of roles) await pool.query('INSERT INTO rol_permiso (rol_id, permiso_id) VALUES (?,?)', [R[r], pid]);
}

/* ------------------------------ Equipos de primera respuesta ------------------------------ */
const EQUIPOS = [
  ['BR-03', 'Bomberos Trinidad', 'POL', '6 efectivos · bote', 'fire_truck', -14.826, -64.897, 'Disponible'],
  ['AMB-07', 'Ambulancia', 'SEDES-BENI', '2 paramédicos', 'ambulance', -14.822, -64.915, 'Disponible'],
  ['FFAA-R2', 'Pelotón de rescate acuático', 'FFAA', '12 efectivos · 2 botes', 'military_tech', -14.812, -64.889, 'Disponible'],
  ['SAR-B1', 'SAR Beni', 'SAR-BENI', '8 rescatistas', 'health_and_safety', -14.80, -64.93, 'Disponible'],
  ['BF-12', 'Bomberos forestales', 'GOB-SCZ', '20 brigadistas', 'local_fire_department', -16.05, -61.50, 'En misión'],
  ['FFAA-F1', 'Compañía forestal', 'FFAA', '40 efectivos', 'military_tech', -16.12, -61.60, 'Disponible'],
  ['GAM-LP', 'Brigada de riesgos', 'GAM-LPZ', '10 técnicos', 'engineering', -16.64, -68.03, 'Disponible'],
  ['BR-11', 'Bomberos Antofagasta', 'POL', '8 efectivos', 'fire_truck', -16.60, -68.07, 'Disponible'],
  ['GAM-SAC', 'Cuadrilla municipal', 'GAM-SAC', '6 operarios', 'engineering', -17.395, -66.03, 'Disponible'],
  ['BR-21', 'Bomberos Cochabamba', 'POL', '6 efectivos', 'fire_truck', -17.39, -66.10, 'Disponible']
];
const EQ = {};
for (const [codigo, nombre, inst, trip, icono, lat, lng, estado] of EQUIPOS) {
  EQ[codigo] = await ins('INSERT INTO equipo (codigo, nombre, institucion_id, tripulacion, icono, lat, lng, ubicacion_at, estado) VALUES (?,?,?,?,?,?,?,?,?)', [codigo, nombre, I[inst], trip, icono, lat, lng, ago(3), estado]);
}

/* ------------------------------ Usuarios ------------------------------ */
const hash = await bcrypt.hash(PASSWORD, 10);
const USERS = [
  ['jmamani', 'Jorge Mamani Quispe', 'OPERADOR', 'COEN', 'Activo', 30],
  ['arojas', 'Ana Lucía Rojas', 'ANALISTA', 'SENAMHI', 'Activo', 210],
  ['marce', 'Cnl. Marcelo Arce', 'DECISOR', 'VIDECI', 'Activo', 54],
  ['rsuarez', 'My. Rodrigo Suárez', 'ENLACE', 'FFAA', 'Activo', 37],
  ['fcruz', 'Tte. Cnl. Fabiola Cruz', 'ENLACE', 'POL', 'Activo', 1150],
  ['lvaca', 'Lic. María Vaca', 'ENLACE', 'GAM-TDD', 'Activo', 112],
  ['dchoque', 'Ing. Daniel Choque', 'ADMIN', 'UTI', 'Activo', 121],
  ['pticona', 'Ing. Pablo Ticona', 'ANALISTA', 'SENAMHI', 'Bloqueado', 34000],
  ['lmendez', 'Sgto. Luis Méndez', 'PRIMERA_RESPUESTA', 'POL', 'Activo', 60],
  ['mnoe', 'Lic. Mariela Noe', 'PRIMERA_RESPUESTA', 'SAR-BENI', 'Activo', 95]
];
// Cada equipo de primera respuesta pertenece a su propia institución
const EQUIPO_DE = { lmendez: 'BR-03', mnoe: 'SAR-B1' };
const U = {};
for (const [user, nombre, rol, inst, estado, min] of USERS) {
  U[user] = await ins(
    'INSERT INTO usuario (username, email, nombre, password_hash, rol_id, institucion_id, equipo_id, estado, ultimo_acceso) VALUES (?,?,?,?,?,?,?,?,?)',
    [user, `${user}@${inst.toLowerCase().replace(/[^a-z]/g, '')}.gob.bo`, nombre, hash, R[rol], I[inst], EQUIPO_DE[user] ? EQ[EQUIPO_DE[user]] : null, estado, ago(min)]
  );
}

/* ------------------------------ Recursos propios de primera respuesta ------------------------------ */
// institución, código, placa, tipo, marca/modelo, año, capacidad, estado, unidad
const VEHICULOS = [
  ['POL', 'AB-03', '2345-KTR', 'Autobomba', 'Mercedes-Benz Atego 1726', 2019, '4.000 L · 6 plazas', 'Operativo', 'BR-03'],
  ['POL', 'BT-03', null, 'Bote de rescate', 'Zodiac MK5 · 40 HP', 2021, '8 personas', 'Operativo', 'BR-03'],
  ['POL', 'CR-11', '4410-LPA', 'Camioneta de rescate', 'Toyota Hilux 4x4', 2020, '5 plazas', 'En mantenimiento', 'BR-11'],
  ['SAR-BENI', 'SAR-V1', '3127-BNI', 'Camioneta de rescate', 'Nissan Frontier 4x4', 2018, '5 plazas', 'Operativo', 'SAR-B1'],
  ['SAR-BENI', 'SAR-L1', null, 'Bote de rescate', 'Lancha de aluminio · 60 HP', 2016, '10 personas', 'Operativo', 'SAR-B1']
];
const VH = {};
for (const [inst, cod, placa, tipo, mm, anio, cap, est, eq] of VEHICULOS) {
  VH[cod] = await ins('INSERT INTO vehiculo (institucion_id, codigo, placa, tipo, marca_modelo, anio, capacidad, estado, equipo_id) VALUES (?,?,?,?,?,?,?,?,?)',
    [I[inst], cod, placa, tipo, mm, anio, cap, est, EQ[eq]]);
}
const EQUIPAMIENTO = [
  ['POL', 'Equipo de respiración autónoma (ERA)', 'Protección personal', 8, 'equipos', 'AB-03'],
  ['POL', 'Herramienta hidráulica de rescate', 'Rescate vehicular', 1, 'juego', 'AB-03'],
  ['POL', 'Chalecos salvavidas', 'Rescate acuático', 12, 'unidades', 'BT-03'],
  ['POL', 'Desfibrilador externo automático', 'Atención prehospitalaria', 1, 'equipo', 'AB-03'],
  ['SAR-BENI', 'Cuerdas estáticas 11 mm', 'Rescate en altura', 6, 'rollos', 'SAR-V1'],
  ['SAR-BENI', 'Radios VHF portátiles', 'Comunicaciones', 10, 'unidades', null],
  ['SAR-BENI', 'Trajes de neopreno', 'Rescate acuático', 8, 'unidades', 'SAR-L1']
];
for (const [inst, nombre, cat, cant, un, vh] of EQUIPAMIENTO) {
  await pool.query('INSERT INTO equipamiento (institucion_id, nombre, categoria, cantidad, unidad, vehiculo_id) VALUES (?,?,?,?,?,?)', [I[inst], nombre, cat, cant, un, vh ? VH[vh] : null]);
}
const ESPECIALIDADES = [
  ['POL', 'Incendios estructurales', 'local_fire_department', ['lmendez']],
  ['POL', 'Rescate acuático', 'pool', ['lmendez']],
  ['POL', 'Materiales peligrosos', 'science', []],
  ['SAR-BENI', 'Búsqueda y rescate en inundaciones', 'flood', ['mnoe']],
  ['SAR-BENI', 'Atención prehospitalaria', 'medical_services', ['mnoe']]
];
for (const [inst, nombre, icono, users] of ESPECIALIDADES) {
  const eid = await ins('INSERT INTO especialidad (institucion_id, nombre, icono) VALUES (?,?,?)', [I[inst], nombre, icono]);
  for (const u of users) await pool.query('INSERT INTO usuario_especialidad (usuario_id, especialidad_id) VALUES (?,?)', [U[u], eid]);
}

/* ------------------------------ Amenazas, variables y umbrales ------------------------------ */
const AMENAZAS = [
  ['INU', 'Inundación', 'flood', '48 h'], ['INC', 'Incendio forestal', 'local_fire_department', '72 h'],
  ['DES', 'Deslizamiento', 'landslide', '24 h'], ['HEL', 'Helada', 'ac_unit', '36 h'],
  ['GRA', 'Granizada', 'weather_hail', '12 h'], ['SEQ', 'Sequía', 'water_drop', '30 días']
];
const A = {};
for (const [c, n, i, h] of AMENAZAS) A[c] = await ins('INSERT INTO amenaza (codigo, nombre, icono, horizonte) VALUES (?,?,?,?)', [c, n, i, h]);

const VARS = [
  ['nivel_rio', 'Nivel del río', 'm', 0, 15, 1],
  ['tendencia_nivel', 'Tendencia del nivel', 'cm/h', -50, 50, 30],
  ['precip_72h', 'Precipitación acumulada 72 h', 'mm', 0, 600, 150],
  ['precip_24h', 'Lluvia acumulada 24 h', 'mm', 0, 300, 100],
  ['humedad_suelo', 'Humedad del suelo', '%', 0, 100, 20],
  ['focos_calor_24h', 'Focos de calor (24 h)', 'focos', 0, 5000, 1000],
  ['dias_sin_lluvia', 'Días consecutivos sin lluvia', 'días', 0, 365, 2],
  ['viento', 'Velocidad del viento', 'km/h', 0, 200, 60],
  ['saturacion_suelo', 'Saturación del suelo', '%', 0, 100, 20],
  ['pendiente_talud', 'Pendiente del talud', '°', 0, 90, null],
  ['temp_min', 'Temperatura mínima pronosticada', '°C', -35, 35, 15],
  ['temperatura', 'Temperatura del aire', '°C', -35, 45, 12],
  ['nubosidad', 'Nubosidad nocturna', '%', 0, 100, null],
  ['cape', 'Energía convectiva (CAPE)', 'J/kg', 0, 6000, 2000],
  ['reflectividad', 'Reflectividad radar', 'dBZ', 0, 80, null],
  ['spi3', 'Índice SPI-3', '', -4, 4, 1.5],
  ['deficit_precip', 'Déficit de precipitación', '%', 0, 100, null]
];
const V = {};
for (const [c, n, u, mi, ma, s] of VARS) V[c] = await ins('INSERT INTO variable (codigo, nombre, unidad, min_fisico, max_fisico, max_salto) VALUES (?,?,?,?,?,?)', [c, n, u, mi, ma, s]);

// amenaza, variable, operador, umbral, base, escala, peso
const UMB = [
  ['INU', 'nivel_rio', '>=', 8.5, 4, 9.4, 1.2], ['INU', 'precip_72h', '>=', 120, 0, 162, 1], ['INU', 'humedad_suelo', '>=', 85, 0, 100, 0.8], ['INU', 'tendencia_nivel', '>=', 3, 0, 6.25, 1],
  ['INC', 'focos_calor_24h', '>=', 200, 0, 353, 1.2], ['INC', 'dias_sin_lluvia', '>=', 21, 0, 40, 0.8], ['INC', 'viento', '>=', 25, 0, 45.7, 1],
  ['DES', 'precip_24h', '>=', 40, 0, 61.5, 1], ['DES', 'saturacion_suelo', '>=', 80, 0, 100, 1.2], ['DES', 'pendiente_talud', '>=', 30, 0, 50, 0.8],
  ['HEL', 'temp_min', '<=', -7, 5, -12, 1.2], ['HEL', 'nubosidad', '<=', 20, 100, 0, 0.8],
  ['GRA', 'cape', '>=', 1500, 0, 2640, 1], ['GRA', 'reflectividad', '>=', 50, 20, 68, 1],
  ['SEQ', 'spi3', '<=', -1.5, 0, -2.5, 1], ['SEQ', 'deficit_precip', '>=', 50, 0, 80, 1]
];
for (const [a, v, op, val, base, esc, w] of UMB) {
  await pool.query('INSERT INTO umbral (amenaza_id, variable_id, operador, valor, base, escala_max, peso) VALUES (?,?,?,?,?,?,?)', [A[a], V[v], op, val, base, esc, w]);
}

const AM_INST = { INU: ['FFAA', 'POL', 'SENAMHI'], INC: ['FFAA', 'ABT'], DES: ['POL'], HEL: ['SENAMHI'], GRA: ['SENAMHI'], SEQ: ['SENAMHI'] };
for (const [a, list] of Object.entries(AM_INST)) for (const s of list) await pool.query('INSERT INTO amenaza_institucion VALUES (?,?)', [A[a], I[s]]);

/* ------------------------------ Fuentes de datos ------------------------------ */
console.log('[seed] Fuentes y lecturas…');
const FUENTES = [
  ['Red hidrométrica (48 estaciones)', 'SENAMHI', 'API REST', 15, 4, 98.6, 'Operativa', 'dev-senamhi-hidro'],
  ['Red meteorológica automática (212)', 'SENAMHI', 'API REST', 10, 2, 97.9, 'Operativa', 'dev-senamhi-meteo'],
  ['Limnímetros de ríos navegables', 'SNHN', 'SFTP / CSV', 60, 38, 95.2, 'Operativa', 'dev-snhn'],
  ['Focos de calor satelitales', 'ABT', 'API REST', 180, 72, 99.1, 'Operativa', 'dev-abt'],
  ['VIIRS focos activos', 'NASA', 'API REST', 180, 65, 99.4, 'Operativa', 'dev-firms'],
  ['Reportes municipales EDAN', 'VIDECI', 'Formulario', 1440, 1560, 88.4, 'Retrasada', 'dev-edan'],
  ['Red sismológica', 'OSC', 'API REST', 5, 180, null, 'Con errores', 'dev-osc']
];
const F = [];
for (const [n, inst, ad, per, min, cal, est, key] of FUENTES) {
  F.push(await ins('INSERT INTO fuente_datos (nombre, institucion_id, adaptador, periodicidad_min, ultima_sinc, calidad, estado, api_key, ultimo_error) VALUES (?,?,?,?,?,?,?,?,?)',
    [n, I[inst], ad, per, ago(min), cal, est, key, est === 'Con errores' ? 'ECONNREFUSED al consultar el servicio' : null]));
}

// Series horarias de las últimas 48 h que terminan en el valor observado de cada alerta.
const LUGARES = [
  { municipio: 'Trinidad', departamento: 'Beni', lat: -14.833, lng: -64.9, estacion: 'Est. Puerto Varador (río Mamoré)', fuente: 0, fin: { nivel_rio: 8.92, precip_72h: 142, humedad_suelo: 94, tendencia_nivel: 6 }, ini: { nivel_rio: 6.1, precip_72h: 40, humedad_suelo: 70, tendencia_nivel: 1 } },
  { municipio: 'San Ignacio de Velasco', departamento: 'Santa Cruz', lat: -16.378, lng: -60.96, estacion: 'Est. San Ignacio', fuente: 3, fin: { focos_calor_24h: 318, dias_sin_lluvia: 34, viento: 32 }, ini: { focos_calor_24h: 120, dias_sin_lluvia: 32, viento: 18 } },
  { municipio: 'Mecapaca', departamento: 'La Paz', lat: -16.6, lng: -68.05, estacion: 'Est. Mecapaca', fuente: 1, fin: { precip_24h: 48, saturacion_suelo: 88, pendiente_talud: 38 }, ini: { precip_24h: 10, saturacion_suelo: 60, pendiente_talud: 38 } },
  { municipio: 'Altiplano', departamento: 'Oruro', lat: -17.97, lng: -67.11, estacion: 'Est. Oruro Aeropuerto', fuente: 1, fin: { temp_min: -9, nubosidad: 8 }, ini: { temp_min: -3, nubosidad: 40 } },
  { municipio: 'Sacaba', departamento: 'Cochabamba', lat: -17.4, lng: -66.04, estacion: 'Est. Sacaba', fuente: 1, fin: { cape: 1850, reflectividad: 52 }, ini: { cape: 600, reflectividad: 25 } },
  { municipio: 'Tupiza', departamento: 'Potosí', lat: -21.44, lng: -65.72, estacion: 'Est. Tupiza', fuente: 1, fin: { spi3: -1.6, deficit_precip: 58 }, ini: { spi3: -1.2, deficit_precip: 50 } },
  { municipio: 'Cobija', departamento: 'Pando', lat: -11.03, lng: -68.77, estacion: 'Est. Cobija (río Acre)', fuente: 0, fin: { nivel_rio: 5.1, precip_72h: 35 }, ini: { nivel_rio: 4.9, precip_72h: 20 } },
  { municipio: 'Tarija', departamento: 'Tarija', lat: -21.53, lng: -64.73, estacion: 'Est. Tarija', fuente: 1, fin: { temperatura: 21, precip_24h: 2 }, ini: { temperatura: 14, precip_24h: 0 } },
  { municipio: 'Sucre', departamento: 'Chuquisaca', lat: -19.05, lng: -65.26, estacion: 'Est. Sucre', fuente: 1, fin: { temperatura: 17, precip_24h: 4 }, ini: { temperatura: 11, precip_24h: 0 } }
];
const rows = [];
for (const L of LUGARES) {
  for (let h = 48; h >= 0; h--) {
    const t = (48 - h) / 48;
    for (const [v, fin] of Object.entries(L.fin)) {
      const ini = L.ini[v];
      const noise = v === 'pendiente_talud' ? 0 : (Math.random() - 0.5) * Math.abs(fin - ini) * 0.04;
      const val = h === 0 ? fin : ini + (fin - ini) * Math.pow(t, 1.6) + noise;
      rows.push([ago(h * 60 + 5), F[L.fuente], L.estacion, L.departamento, L.municipio, L.lat, L.lng, V[v], Math.round(val * 100) / 100]);
    }
  }
}
await pool.query('INSERT INTO lectura (fecha_hora, fuente_id, estacion, departamento, municipio, lat, lng, variable_id, valor) VALUES ?', [rows]);

for (const [min, st, v, val, motivo, fu] of [
  [17, 'Est. Puerto Varador (río Mamoré)', 'nivel_rio', '18.40', 'Fuera de rango físico', 0],
  [42, 'Est. El Alto Aeropuerto', 'temperatura', '-41.0', 'Fuera de rango físico', 1],
  [132, 'Est. Riberalta', 'precip_24h', 'null', 'Lectura vacía', 1]
]) {
  await pool.query('INSERT INTO lectura_descartada (fecha_hora, fuente_id, estacion, variable, valor_texto, motivo) VALUES (?,?,?,?,?,?)', [ago(min), F[fu], st, v, val, motivo]);
}

/* ------------------------------ Modelos de IA ------------------------------ */
console.log('[seed] Modelos, alertas, eventos…');
const MODELOS = [
  ['M-INU', 'INU', 'Inundación', 'flood', 'Random Forest', 2.3, 0.89, 0.94, 0.91],
  ['M-INC', 'INC', 'Incendio forestal', 'local_fire_department', 'Gradient Boosting', 1.7, 0.84, 0.91, 0.86],
  ['M-DES', 'DES', 'Deslizamiento', 'landslide', 'Regresión logística', 1.2, 0.77, 0.85, 0.80],
  ['M-HEL', 'HEL', 'Helada', 'ac_unit', 'Random Forest', 1.4, 0.86, 0.92, 0.88],
  ['M-GRA', 'GRA', 'Granizada', 'weather_hail', 'Gradient Boosting', 1.0, 0.74, 0.83, 0.78],
  ['M-SEQ', 'SEQ', 'Sequía', 'water_drop', 'SPI + Gradient Boosting', 1.1, 0.79, 0.87, 0.82],
  ['M-ANO', null, 'Anomalías de lectura', 'troubleshoot', 'Isolation Forest', 3.0, 0.93, 0.96, 0.90]
];
const MV = {};
const fechasV = [25, 106, 207, 312]; // días atrás
for (const [cod, am, nom, icono, algo, ver, f1, auc, rec] of MODELOS) {
  const mid = await ins('INSERT INTO modelo_ia (codigo, amenaza_id, nombre, icono, algoritmo) VALUES (?,?,?,?,?)', [cod, am ? A[am] : null, nom, icono, algo]);
  for (let i = 3; i >= 0; i--) {
    const v = `v${(ver - i / 10).toFixed(1)}`;
    const id = await ins('INSERT INTO modelo_version (modelo_id, version, fecha, datos_entrenamiento, f1, auc, recall_m, estado) VALUES (?,?,?,?,?,?,?,?)',
      [mid, v, ago(fechasV[i] * 1440), `${412 - i * 64} mil lecturas · 2008–${2026 - (i > 1 ? 1 : 0)}`, (f1 - i * 0.02).toFixed(3), (auc - i * 0.015).toFixed(3), (rec - i * 0.02).toFixed(3), i === 0 ? 'En producción' : 'Archivada']);
    if (i === 0) MV[cod] = { id, etiqueta: `${cod} ${v}` };
  }
}

/* ------------------------------ Alertas ------------------------------ */
async function sustento(am, valores) {
  const ums = await q(
    'SELECT u.*, v.codigo, v.nombre, v.unidad FROM umbral u JOIN variable v ON v.id = u.variable_id WHERE u.amenaza_id = ? ORDER BY u.id',
    [A[am]]
  );
  return explain(ums.filter((u) => valores[u.codigo] !== undefined).map((u) => ({
    codigo: u.codigo, nombre: u.codigo === 'nivel_rio' ? 'Nivel río Mamoré (Puerto Varador)' : u.nombre, unidad: u.unidad, valor: valores[u.codigo],
    umbral: Number(u.valor), operador: u.operador, base: Number(u.base), escala_max: Number(u.escala_max), peso: Number(u.peso)
  })));
}
const ALERTAS = [
  ['ALT-2026-0407', 'SEQ', 'Potosí', 'Tupiza, Potosí', -21.44, -65.72, 'amarilla', 0.58, '30 días', 'Validada y notificada', 'marce', 3900, { spi3: -1.6, deficit_precip: 58 }],
  ['ALT-2026-0408', 'GRA', 'Cochabamba', 'Sacaba, Cochabamba', -17.40, -66.04, 'amarilla', 0.55, '12 h', 'Notificada', 'jmamani', 300, { cape: 1850, reflectividad: 52 }],
  ['ALT-2026-0409', 'HEL', 'Oruro', 'Altiplano, Oruro', -17.97, -67.11, 'amarilla', 0.61, '36 h', 'Notificada', 'jmamani', 840, { temp_min: -9, nubosidad: 8 }],
  ['ALT-2026-0410', 'DES', 'La Paz', 'Mecapaca, La Paz', -16.6, -68.05, 'naranja', 0.68, '24 h', 'Emitida no notificada', 'jmamani', 180, { precip_24h: 48, saturacion_suelo: 88, pendiente_talud: 38 }],
  ['ALT-2026-0411', 'INC', 'Santa Cruz', 'San Ignacio de Velasco, Santa Cruz', -16.378, -60.96, 'naranja', 0.74, '72 h', 'Validada y notificada', 'marce', 7300, { focos_calor_24h: 318, dias_sin_lluvia: 34, viento: 32 }],
  ['ALT-2026-0412', 'INU', 'Beni', 'Trinidad, Beni', -14.833, -64.9, 'roja', 0.87, '48 h', 'Pendiente de validación', null, 4, { nivel_rio: 8.92, precip_72h: 142, humedad_suelo: 94, tendencia_nivel: 6 }]
];
const AL = {};
for (const [cod, am, dep, lugar, lat, lng, nivel, p, hor, estado, val, min, valores] of ALERTAS) {
  const s = await sustento(am, valores);
  const pred = await ins('INSERT INTO prediccion (modelo_version_id, amenaza_id, departamento, lugar, lat, lng, probabilidad, horizonte, nivel, variables, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    [MV[`M-${am}`].id, A[am], dep, lugar, lat, lng, p, hor, nivel, JSON.stringify(s), ago(min + 1)]);
  AL[cod] = await ins(
    `INSERT INTO alerta (codigo, prediccion_id, amenaza_id, departamento, lugar, lat, lng, nivel, nivel_propuesto, probabilidad, horizonte, modelo, sustento, estado, validado_por, fecha_validacion, reintentos, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [cod, pred, A[am], dep, lugar, lat, lng, nivel, nivel, p, hor, MV[`M-${am}`].etiqueta, JSON.stringify(s), estado, val ? U[val] : null,
      val ? ago(min - 16) : null, estado === 'Emitida no notificada' ? 1 : 0, ago(min)]
  );
  if (estado !== 'Pendiente de validación') {
    const a = await one('SELECT * FROM alerta WHERE id = ?', [AL[cod]]);
    for (const inst of await institucionesConcernidas(a)) {
      const fallida = estado === 'Emitida no notificada' && inst.webhook_url;
      await pool.query('INSERT INTO alerta_notificacion (alerta_id, institucion_id, estado, fecha_envio, fecha_confirmacion) VALUES (?,?,?,?,?)',
        [a.id, inst.id, fallida ? 'Fallida' : inst.sigla === 'COEN' ? 'Confirmada' : 'Enviada', ago(min - 18), inst.sigla === 'COEN' ? ago(min - 20) : null]);
    }
  }
}
// Histórico de alertas de meses anteriores (para el gráfico mensual de reportes)
const HIST = [[5, 4, 1, 0], [4, 6, 2, 0], [3, 9, 3, 1], [2, 11, 4, 1], [1, 14, 6, 2]];
let hcount = 300;
for (const [m, y, o, r] of HIST) {
  const d = new Date(); d.setDate(12); d.setMonth(d.getMonth() - m);
  for (const [nivel, n] of [['amarilla', y], ['naranja', o], ['roja', r]]) {
    for (let k = 0; k < n; k++) {
      const created = new Date(d.getTime() + k * 3600e3 * 7);
      await pool.query(
        `INSERT INTO alerta (codigo, amenaza_id, departamento, lugar, nivel, nivel_propuesto, probabilidad, horizonte, sustento, estado, validado_por, fecha_validacion, created_at)
         VALUES (?,?,?,?,?,?,?,?, '[]', 'Cerrada', ?, ?, ?)`,
        [`ALT-${d.getFullYear()}-${String(++hcount).padStart(4, '0')}`, A[['INU', 'INC', 'HEL', 'GRA'][k % 4]], 'Beni', 'Histórico', nivel, nivel,
          nivel === 'roja' ? 0.84 : nivel === 'naranja' ? 0.7 : 0.55, '48 h', U.marce, new Date(created.getTime() + 18 * 60000), created]
      );
    }
  }
}

/* ------------------------------ Eventos y recomendaciones ------------------------------ */
const EVENTOS = [
  ['EVT-2026-116', 'Deslizamiento · Mecapaca, La Paz', 'DES', 'ALT-2026-0410', 'La Paz', 'Mecapaca, La Paz', -16.6, -68.05, 'naranja', 2 * 1440 + 500, '42 viviendas en riesgo', 1],
  ['EVT-2026-117', 'Incendio forestal · Chiquitania', 'INC', 'ALT-2026-0411', 'Santa Cruz', 'San Ignacio de Velasco, Santa Cruz', -16.378, -60.96, 'naranja', 5 * 1440 - 130, '12.800 ha afectadas', 0],
  ['EVT-2026-118', 'Inundación · Trinidad, Beni', 'INU', null, 'Beni', 'Trinidad, Beni', -14.833, -64.9, 'roja', 16 * 60 + 22, '≈ 3.400 familias expuestas', 0]
];
const E = {};
for (const [cod, tit, am, al, dep, lugar, lat, lng, nivel, min, imp, prot] of EVENTOS) {
  E[cod] = await ins('INSERT INTO evento (codigo, titulo, amenaza_id, alerta_id, departamento, lugar, lat, lng, nivel, fecha_inicio, impacto, usa_protocolo, registrado_por) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [cod, tit, A[am], al ? AL[al] : null, dep, lugar, lat, lng, nivel, ago(min), imp, prot, U.marce]);
}
const RECS = [
  ['EVT-2026-118', 'Evacuación preventiva de barrios ribereños del río Ibare', 'Nivel en Puerto Varador 8,92 m sobre umbral de 8,50 m; proyección de 9,40 m en 36 h. 1.150 viviendas bajo la cota de inundación de 2014.', 'FF.AA. + GAM Trinidad', 'FFAA', '6 botes · 4 camiones', 0.91],
  ['EVT-2026-118', 'Habilitar 4 albergues temporales en unidades educativas de zona alta', 'Capacidad requerida estimada en 2.800 personas. En el evento de 2014, el 60 % de las familias evacuadas requirió albergue.', 'Gobernación del Beni', 'GOB-BENI', '300 carpas · 2.800 raciones/día', 0.84],
  ['EVT-2026-118', 'Pre-posicionar helicóptero de la FAB en Trinidad', 'El modelo estima corte de acceso terrestre a 3 comunidades de la provincia Marbán dentro de 48 h.', 'FF.AA. · FAB', 'FFAA', '1 helicóptero', 0.72],
  ['EVT-2026-118', 'Instalar motobombas en canales de drenaje urbano', 'Saturación del suelo al 94 %; los canales norte y este registran rebalse en eventos con precipitación superior a 120 mm.', 'GAM Trinidad', 'GAM-TDD', '2 motobombas', 0.66],
  ['EVT-2026-117', 'Reforzar brigadas en el frente norte de San Ignacio de Velasco', 'Viento sostenido de 32 km/h en dirección norte; 318 focos de calor en 24 h, concentrados en el frente norte.', 'Gobernación de Santa Cruz', 'GOB-SCZ', '120 brigadistas', 0.81],
  ['EVT-2026-117', 'Solicitar avión cisterna para descargas en zona de difícil acceso', 'El 40 % del perímetro activo está a más de 8 km de caminos transitables.', 'VIDECI · FF.AA.', 'VIDECI', '1 avión cisterna', 0.69],
  ['EVT-2026-116', 'Evacuación de viviendas en franja de 50 m del talud', 'Protocolo normado de deslizamientos del GAM La Paz. Sin histórico suficiente para inferencia del modelo en esta zona.', 'GAM La Paz + Policía', 'GAM-LPZ', '2 camiones', null],
  ['EVT-2026-116', 'Cierre del tramo vial Mecapaca – Huaricana', 'Protocolo normado: cierre preventivo ante saturación de suelo superior al 80 %.', 'Policía Boliviana', 'POL', 'Tránsito', null]
];
const RC = {};
const ordenEv = {};
for (const [ev, tit, sus, insts, inst, rec, conf] of RECS) {
  ordenEv[ev] = (ordenEv[ev] || 0) + 1;
  const aprobada = ev === 'EVT-2026-118' && ordenEv[ev] === 3;
  RC[`${ev}#${ordenEv[ev]}`] = await ins(
    'INSERT INTO recomendacion (evento_id, orden, titulo, sustento, instituciones, institucion_id, recursos, confianza, estado, decidido_por, fecha_decision) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    [E[ev], ordenEv[ev], tit, sus, insts, I[inst], rec, conf, aprobada ? 'Aprobada' : 'Pendiente', aprobada ? U.marce : null, aprobada ? ago(52) : null]
  );
}

/* ------------------------------ Tareas y recursos ------------------------------ */
const TAREAS = [
  ['T-301', 'EVT-2026-118', 'Evacuación de barrios ribereños del Ibare', 'FFAA', 'My. R. Suárez', 330, 'En curso', 45],
  ['T-302', 'EVT-2026-118', 'Habilitar albergues en U.E. de zona alta', 'GAM-TDD', 'Lic. M. Vaca', 210, 'En curso', 70],
  ['T-303', 'EVT-2026-118', 'Distribución de raciones a albergues', 'GOB-BENI', 'Ing. L. Justiniano', 1050, 'Pendiente', 0],
  ['T-304', 'EVT-2026-118', 'Control de tránsito en zona evacuada', 'POL', 'Tte. Cnl. F. Cruz', -150, 'Vencida', 30],
  ['T-305', 'EVT-2026-118', 'Pre-posicionamiento de helicóptero FAB', 'FFAA', 'My. R. Suárez', 30, 'Completada', 100, 'EVT-2026-118#3'],
  ['T-306', 'EVT-2026-117', 'Brigadas forestales frente norte', 'GOB-SCZ', 'Ing. C. Añez', 1650, 'En curso', 55],
  ['T-307', 'EVT-2026-116', 'Evaluación de viviendas en talud', 'GAM-LPZ', 'Arq. P. Mendoza', -270, 'Vencida', 60],
  ['T-308', 'EVT-2026-118', 'Boletín hidrológico cada 6 h', 'SENAMHI', 'Ing. A. Rojas', 210, 'En curso', 50],
  ['T-309', 'EVT-2026-118', 'Traslado de carpas a albergue U.E. Cristo Rey', 'FFAA', 'My. R. Suárez', 150, 'Pendiente', 0]
];
for (const [cod, ev, tit, inst, resp, min, est, av, rc] of TAREAS) {
  const tid = await ins('INSERT INTO tarea (codigo, evento_id, recomendacion_id, titulo, institucion_id, responsable, plazo, estado, avance, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [cod, E[ev], rc ? RC[rc] : null, tit, I[inst], resp, ahead(min), est, av, ago(600)]);
  if (est === 'Completada') await pool.query('UPDATE tarea SET updated_at = ? WHERE id = ?', [ago(40), tid]);
  if (av > 0) {
    const uid = inst === 'FFAA' ? U.rsuarez : inst === 'GAM-TDD' ? U.lvaca : inst === 'POL' ? U.fcruz : U.jmamani;
    await pool.query('INSERT INTO tarea_avance (tarea_id, usuario_id, avance, observacion, fecha) VALUES (?,?,?,?,?)', [tid, uid, av, 'Avance reportado desde campo.', ago(38)]);
  }
}
const RECURSOS = [
  ['Botes de rescate', 'FFAA', 'botes', 24, 14, 'EVT-2026-118'], ['Helicópteros', 'FFAA', 'aeronaves', 6, 2, 'EVT-2026-118'],
  ['Carpas familiares', 'VIDECI', 'carpas', 1200, 300, 'EVT-2026-118'], ['Raciones', 'VIDECI', 'raciones', 18000, 8400, 'EVT-2026-118'],
  ['Motobombas', 'GAM-TDD', 'equipos', 8, 2, 'EVT-2026-118'], ['Brigadistas forestales', 'GOB-SCZ', 'personas', 450, 310, 'EVT-2026-117']
];
for (const [n, inst, un, tot, usado, ev] of RECURSOS) {
  const rid = await ins('INSERT INTO recurso (nombre, institucion_id, unidad, total) VALUES (?,?,?,?)', [n, I[inst], un, tot]);
  await pool.query('INSERT INTO asignacion_recurso (recurso_id, evento_id, cantidad, fecha, asignado_por) VALUES (?,?,?,?,?)', [rid, E[ev], usado, ago(500), U.jmamani]);
}

/* ------------------------------ Reportes ciudadanos ------------------------------ */
const REPORTES = [
  ['REP-2026-0928', 'tormenta', 'weather_hail', 'Techo dañado por granizo', 'Sacaba, Cochabamba', 'Cochabamba', -17.40, -66.04, 15, 0, 'No', 'BAJA', 'En revisión', 'Marcela Rocha', '+591 71238864', 'Granizada', 0.76, 'Daño material. Se sugiere derivar a GAM Sacaba.', 'ninguno', 'ALT-2026-0408', null, 52, 'El granizo rompió parte del techo de calamina de la escuela.'],
  ['REP-2026-0929', 'deslizamiento', 'landslide', 'Deslizamiento sobre la vía', 'Carretera a Mecapaca, La Paz', 'La Paz', -16.667, -68.02, 9, 0, 'No', 'MEDIA', 'En revisión', 'Juan Carlos Poma', '+591 72103307', 'Deslizamiento', 0.81, 'Zona de ALT-2026-0410. Sin personas en riesgo reportadas.', 'ninguno', 'ALT-2026-0410', 'EVT-2026-116', 34, 'Cayó tierra y piedras en la carretera, los autos no pueden pasar.'],
  ['REP-2026-0930', 'incendio', 'local_fire_department', 'Fuego cerca de viviendas', 'Santa Rosa de la Roca, Santa Cruz', 'Santa Cruz', -16.07, -61.53, 12, 0, 'No reportado', 'ALTA', 'Equipo despachado', null, '+591 67401190', 'Incendio forestal', 0.88, 'Dentro del perímetro de EVT-2026-117. 14 focos de calor en 2 km.', '2 reportes similares (fusionados)', 'ALT-2026-0411', 'EVT-2026-117', 11, 'Se ve la columna de humo a unos 500 metros de las casas; el viento la trae hacia la comunidad.'],
  ['REP-2026-0931', 'inundacion', 'flood', 'Personas atrapadas por inundación', 'Barrio Pompeya, Trinidad, Beni', 'Beni', -14.842, -64.912, 6, 1, 'Sí · 2 adultos mayores en el techo', 'CRÍTICA', 'Nuevo', 'Rosa Méndez Cuéllar', '+591 73324821', 'Inundación · rescate', 0.93, 'Coincide con ALT-2026-0412 (roja). Personas en riesgo vital: se recomienda despacho inmediato.', 'ninguno en 300 m', 'ALT-2026-0412', 'EVT-2026-118', 1, 'El agua llega a la cintura. Mis vecinos, dos abuelitos, subieron al techo y no pueden salir.']
];
const REP = {};
for (const [cod, tipo, ic, tit, lugar, dep, lat, lng, prec, pr, rd, prio, est, rep, tel, iat, iac, ian, dup, al, ev, min, desc] of REPORTES) {
  REP[cod] = await ins(
    `INSERT INTO reporte_ciudadano (codigo, token_seguimiento, tipo, icono, titulo, descripcion, lugar, departamento, lat, lng, precision_m, personas_riesgo, riesgo_detalle,
       prioridad, estado, reportante, telefono, ia_tipo, ia_confianza, ia_nota, duplicados, alerta_id, evento_id, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [cod, `demo${cod.slice(-4)}`.padEnd(32, '0'), tipo, ic, tit, desc, lugar, dep, lat, lng, prec, pr, rd, prio, est, rep, tel, iat, iac, ian, dup, AL[al] ?? null, ev ? E[ev] : null, ago(min)]
  );
}
await pool.query("INSERT INTO despacho (reporte_id, equipo_id, estado, distancia_km, eta_min, despachado_por, fecha_despacho, fecha_aceptacion) VALUES (?,?,'Aceptada',4.1,14,?,?,?)",
  [REP['REP-2026-0930'], EQ['BF-12'], U.jmamani, ago(8), ago(7)]);

/* ------------------------------ Reportes generados y bitácora ------------------------------ */
for (const [n, f, u, min] of [
  ['Consolidado mensual de alertas y eventos · septiembre 2026', 'PDF', 'sistema', 392],
  ['Indicadores de oportunidad de la respuesta · 3.er trimestre', 'XLSX', 'marce', 1440],
  ['Recursos comprometidos por evento · EVT-2026-118', 'PDF', 'jmamani', 82],
  ['Lecturas descartadas por fuente · agosto 2026', 'CSV', 'arojas', 36000]
]) await pool.query('INSERT INTO reporte_generado (nombre, formato, generado_por, created_at) VALUES (?,?,?,?)', [n, f, u, ago(min)]);

const LOG = [
  [243, 'arojas', 'VALIDAR_PRONOSTICO', 'M-HEL v1.4 · Oruro', '10.20.3.14'],
  [121, 'dchoque', 'MODIFICAR_ROL', 'lvaca → Enlace', '10.12.1.3'],
  [52, 'marce', 'APROBAR_RECOMENDACION', 'EVT-2026-118 #3', '10.12.2.9'],
  [37, 'rsuarez', 'ACTUALIZAR_TAREA', 'T-301 → 45 %', '181.115.7.42'],
  [30, 'jmamani', 'INICIAR_SESION', 'token 8 h', '10.12.4.18'],
  [17, 'sistema', 'DESCARTAR_LECTURA', 'Est. Puerto Varador', '10.12.8.2'],
  [8, 'jmamani', 'DESPACHAR_EQUIPO', 'BF-12 → REP-2026-0930', '10.12.4.18'],
  [5, 'motor-ia', 'PREDICCION', 'M-INU v2.3 · Beni', '10.12.8.5'],
  [4, 'motor-ia', 'PROPONER_ALERTA', 'ALT-2026-0412', '10.12.8.5'],
  [1, 'app-ciudadana', 'RECIBIR_REPORTE', 'REP-2026-0931 · app ciudadana', '181.188.160.21']
];
for (const [min, u, op, obj, ip] of LOG) await pool.query('INSERT INTO bitacora (fecha_hora, usuario, operacion, objeto, ip) VALUES (?,?,?,?,?)', [ago(min), u, op, obj, ip]);

/* ------------------------------ Correlativos ------------------------------ */
const y = new Date().getFullYear();
for (const [p, g, n] of [['ALT', y, 412], ['EVT', y, 118], ['REP', y, 931], ['T', 0, 309]]) {
  await pool.query('INSERT INTO secuencia (prefijo, gestion, ultimo) VALUES (?,?,?) ON DUPLICATE KEY UPDATE ultimo = VALUES(ultimo)', [p, g, n]);
}

await pool.end();
console.log(`[seed] Listo. Usuarios demo (contraseña "${PASSWORD}"): ${USERS.map((u) => u[0]).join(', ')}`);
