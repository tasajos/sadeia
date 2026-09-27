import { q, one } from '../config/db.js';
import { SQL_REPORTE, fotoUrl, maskPhone } from '../routes/serializers.js';
import { distanceKm, etaMin } from '../utils/geo.js';
import { fmtTime } from '../utils/format.js';

export async function despachosDe(reporteId) {
  return q(
    `SELECT d.*, e.codigo AS equipo_codigo, e.nombre AS equipo_nombre, e.lat AS equipo_lat, e.lng AS equipo_lng, e.icono
       FROM despacho d JOIN equipo e ON e.id = d.equipo_id WHERE d.reporte_id = ? ORDER BY d.fecha_despacho`,
    [reporteId]
  );
}

/** Equipos cercanos con distancia y ETA; marca despachados, ocupados y el sugerido. */
export async function equiposCercanos(rep, despachos) {
  const eqs = await q(
    `SELECT e.*, i.sigla AS institucion, i.nombre AS institucion_nombre FROM equipo e JOIN institucion i ON i.id = e.institucion_id
      WHERE e.lat IS NOT NULL AND e.estado <> 'Fuera de servicio' AND i.activa = 1`
  );
  const activos = despachos.filter((d) => d.estado !== 'Rechazada');
  const lista = eqs
    .map((e) => {
      const km = distanceKm(Number(rep.lat), Number(rep.lng), Number(e.lat), Number(e.lng));
      const d = activos.find((x) => x.equipo_id === e.id);
      return {
        id: e.id, codigo: e.codigo, nombre: e.nombre, institucion: e.institucion_nombre, tripulacion: e.tripulacion, icono: e.icono,
        lat: e.lat, lng: e.lng, distancia_km: Math.round(km * 10) / 10, eta_min: etaMin(km),
        despachado: !!d, despacho_estado: d?.estado || null, despacho_hora: d ? fmtTime(d.fecha_despacho) : null,
        ocupado: !d && e.estado === 'En misión'
      };
    })
    .filter((e) => e.distancia_km <= 80 || e.despachado)
    .sort((a, b) => a.distancia_km - b.distancia_km)
    .slice(0, 6);
  const sugerido = lista.find((e) => !e.despachado && !e.ocupado);
  if (sugerido) sugerido.sugerido = true;
  return lista;
}

/** Pasos de seguimiento que ve el ciudadano (tiempo real). */
export function pasosSeguimiento(rep, despachos) {
  const activo = despachos.filter((d) => d.estado !== 'Rechazada').slice(-1)[0];
  const enSitio = activo && ['En sitio', 'Controlada'].includes(activo.estado);
  const atendido = rep.estado === 'Atendido' || activo?.estado === 'Controlada';
  const falso = rep.estado === 'Falso / descartado';
  return [
    { label: 'Recibido por el COEN', done: true, sub: `Hoy ${fmtTime(rep.created_at)}` },
    { label: 'Verificado por un operador', done: rep.estado !== 'Nuevo', sub: falso ? 'El reporte fue descartado tras la verificación' : rep.estado !== 'Nuevo' ? 'Un operador del COEN revisó su reporte' : 'En espera de revisión' },
    { label: 'Equipo despachado', done: !!activo, sub: activo ? `${activo.equipo_codigo} en camino · llega en ${activo.eta_min ?? '—'} min` : 'Pendiente' },
    { label: 'Equipo en el sitio', done: !!enSitio, sub: enSitio ? 'Los rescatistas llegaron a su ubicación' : 'Pendiente' },
    { label: 'Atendido', done: !!atendido, sub: atendido ? 'Situación controlada' : 'Pendiente' }
  ];
}

export async function detalleReporte(idOrCodigo, { publico = false } = {}) {
  const rep = await one(`${SQL_REPORTE} WHERE r.id = ? OR r.codigo = ?`, [idOrCodigo, idOrCodigo]);
  if (!rep) return null;
  const fotos = await q('SELECT ruta FROM reporte_foto WHERE reporte_id = ? ORDER BY id', [rep.id]);
  const despachos = await despachosDe(rep.id);
  const base = {
    id: rep.id, codigo: rep.codigo, tipo: rep.tipo, icono: rep.icono, titulo: rep.titulo, descripcion: rep.descripcion, lugar: rep.lugar,
    departamento: rep.departamento, lat: rep.lat, lng: rep.lng, precision_m: rep.precision_m, ubicacion_origen: rep.ubicacion_origen, prioridad: rep.prioridad, estado: rep.estado,
    created_at: rep.created_at, fotos: fotos.map((f) => fotoUrl(f.ruta)),
    pasos: pasosSeguimiento(rep, despachos)
  };
  if (publico) return base;
  return {
    ...base,
    personas_riesgo: !!rep.personas_riesgo, riesgo_detalle: rep.riesgo_detalle, reportante: rep.reportante || 'Anónimo',
    telefono: maskPhone(rep.telefono), telefono_completo: rep.telefono, canal: rep.canal,
    ia_tipo: rep.ia_tipo, ia_confianza: rep.ia_confianza, ia_nota: rep.ia_nota, duplicados: rep.duplicados,
    alerta_codigo: rep.alerta_codigo, evento_id: rep.evento_id, evento_codigo: rep.evento_codigo,
    despachos: despachos.map((d) => ({ id: d.id, equipo: d.equipo_codigo, estado: d.estado, fecha_despacho: d.fecha_despacho, eta_min: d.eta_min })),
    equipos: await equiposCercanos(rep, despachos)
  };
}
