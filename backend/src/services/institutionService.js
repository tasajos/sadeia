import { badRequest } from '../utils/http.js';

export const TIPOS_INSTITUCION = ['Nacional', 'Departamental', 'Municipal', 'Técnica', 'Primera respuesta', 'Otra'];

/** Columnas editables de institución (orden usado en INSERT/UPDATE). */
export const CAMPOS_INSTITUCION = ['sigla', 'nombre', 'tipo', 'departamento', 'municipio', 'sede', 'telefono', 'icono', 'lat', 'lng', 'radio_km', 'webhook_url', 'activa'];

const texto = (v, max) => (v === undefined ? undefined : v === null || String(v).trim() === '' ? null : String(v).trim().slice(0, max));

function numero(v, nombre, min, max) {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (v === null || v === '' || !Number.isFinite(n) || n < min || n > max) throw badRequest(`${nombre} inválido`);
  return n;
}

/** Valida y normaliza los datos de una institución (parcial = PATCH). */
export function validarInstitucion(b, parcial = false) {
  const d = {
    sigla: b.sigla === undefined ? undefined : String(b.sigla).trim().toUpperCase().slice(0, 30),
    nombre: texto(b.nombre, 150),
    tipo: b.tipo,
    departamento: texto(b.departamento, 40),
    municipio: texto(b.municipio, 80),
    sede: texto(b.sede, 150),
    telefono: texto(b.telefono, 30),
    icono: b.icono,
    lat: numero(b.lat, 'Latitud', -90, 90),
    lng: numero(b.lng, 'Longitud', -180, 180),
    radio_km: numero(b.radio_km, 'Radio de jurisdicción', 1, 3000),
    webhook_url: texto(b.webhook_url, 255),
    activa: b.activa === undefined ? undefined : b.activa ? 1 : 0
  };
  if (d.sigla !== undefined && !/^[A-Z0-9][A-Z0-9.\-_ ]{1,29}$/.test(d.sigla)) throw badRequest('Sigla inválida (letras, números, guiones)');
  if (d.nombre === null) throw badRequest('El nombre es obligatorio');
  if (d.tipo !== undefined && !TIPOS_INSTITUCION.includes(d.tipo)) throw badRequest('Tipo de institución inválido');
  if (d.icono !== undefined && !/^[a-z0-9_]{2,40}$/.test(String(d.icono))) throw badRequest('Ícono inválido');
  if (d.webhook_url && !/^https?:\/\//i.test(d.webhook_url)) throw badRequest('El webhook debe ser una URL http(s)');
  if ((d.lat === undefined) !== (d.lng === undefined)) throw badRequest('Indique latitud y longitud');
  if (!parcial && (d.lat === undefined || d.lng === undefined)) throw badRequest('Marque la ubicación de la institución en el mapa');
  return d;
}
