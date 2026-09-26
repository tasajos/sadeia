import { parseJson } from '../utils/format.js';
import { env } from '../config/env.js';

export const SQL_ALERTA = `
  SELECT a.*, am.nombre AS amenaza, am.icono, am.codigo AS amenaza_codigo, u.nombre AS validado_por_nombre
    FROM alerta a JOIN amenaza am ON am.id = a.amenaza_id LEFT JOIN usuario u ON u.id = a.validado_por`;

export const alertaDTO = (a) => ({
  id: a.id,
  codigo: a.codigo,
  amenaza: a.amenaza,
  amenaza_codigo: a.amenaza_codigo,
  icono: a.icono,
  lugar: a.lugar,
  departamento: a.departamento,
  lat: a.lat,
  lng: a.lng,
  nivel: a.nivel,
  nivel_propuesto: a.nivel_propuesto,
  probabilidad: a.probabilidad,
  horizonte: a.horizonte,
  modelo: a.modelo,
  estado: a.estado,
  sustento: parseJson(a.sustento, []),
  justificacion: a.justificacion,
  validado_por: a.validado_por_nombre || null,
  fecha_validacion: a.fecha_validacion,
  reintentos: a.reintentos,
  created_at: a.created_at
});

export const SQL_EVENTO = `
  SELECT e.*, am.nombre AS amenaza, am.icono, a.codigo AS alerta_codigo
    FROM evento e JOIN amenaza am ON am.id = e.amenaza_id LEFT JOIN alerta a ON a.id = e.alerta_id`;

export const SQL_TAREA = `
  SELECT t.*, i.sigla AS institucion_sigla, i.nombre AS institucion, e.codigo AS evento_codigo, e.titulo AS evento_titulo
    FROM tarea t JOIN institucion i ON i.id = t.institucion_id JOIN evento e ON e.id = t.evento_id`;

export const fotoUrl = (ruta) => (ruta?.startsWith('http') ? ruta : `${env.publicUrl}${ruta}`);

export const SQL_REPORTE = `
  SELECT r.*, a.codigo AS alerta_codigo, e.codigo AS evento_codigo
    FROM reporte_ciudadano r LEFT JOIN alerta a ON a.id = r.alerta_id LEFT JOIN evento e ON e.id = r.evento_id`;

/** Oculta parcialmente el teléfono del reportante (protección de datos). */
export const maskPhone = (t) => (t ? t.replace(/^(\+?\d{3,4}\s?\d)\d+(\d{4})$/, '$1••• $2') : null);
