import { one, pool, tx } from '../config/db.js';
import { auditReq } from './auditService.js';
import { conflict } from '../utils/http.js';
import { emit } from '../socket.js';

/**
 * Ciclo de vida de un despacho (misión). Lo usan la app móvil del equipo (/api/misiones)
 * y la web de la institución de primera respuesta (/api/respuesta), que atienden los mismos despachos.
 */
const notificar = (d, eq, reporte, estado) => {
  emit('despacho:actualizado', { despacho_id: d.id, reporte, estado }, ['perm:ciudadanos.ver', `inst:${eq.institucion_id}`, `equipo:${eq.id}`]);
  emit('reporte:actualizado', { codigo: reporte, estado }, `reporte:${reporte}`);
};

export async function aceptarMision(req, eq, d) {
  if (d.estado !== 'Despachado') throw conflict('La misión ya fue respondida');
  await pool.query("UPDATE despacho SET estado = 'Aceptada', fecha_aceptacion = NOW() WHERE id = ?", [d.id]);
  const rep = await one('SELECT codigo FROM reporte_ciudadano WHERE id = ?', [d.reporte_id]);
  await auditReq(req, 'ACEPTAR_MISION', `${eq.codigo} · ${rep.codigo}`);
  notificar(d, eq, rep.codigo, 'Aceptada');
  return { estado: 'Aceptada' };
}

export async function rechazarMision(req, eq, d) {
  if (d.estado !== 'Despachado') throw conflict('La misión ya fue respondida');
  const rep = await one('SELECT * FROM reporte_ciudadano WHERE id = ?', [d.reporte_id]);
  await tx(async (c) => {
    await c.query("UPDATE despacho SET estado = 'Rechazada' WHERE id = ?", [d.id]);
    await c.query("UPDATE equipo SET estado = 'Disponible' WHERE id = ?", [eq.id]);
    const [[o]] = await c.query("SELECT COUNT(*) AS n FROM despacho WHERE reporte_id = ? AND estado <> 'Rechazada'", [rep.id]);
    if (!Number(o.n)) await c.query("UPDATE reporte_ciudadano SET estado = 'En revisión' WHERE id = ?", [rep.id]);
  });
  await auditReq(req, 'RECHAZAR_MISION', `${eq.codigo} · ${rep.codigo}`, { motivo: req.body?.motivo || 'No disponible' });
  notificar(d, eq, rep.codigo, 'Rechazada');
  return { estado: 'Rechazada' };
}

/** Avance de la misión: llegada al sitio → situación controlada. */
export async function avanzarMision(req, eq, d) {
  const rep = await one('SELECT codigo FROM reporte_ciudadano WHERE id = ?', [d.reporte_id]);
  if (d.estado === 'Aceptada') {
    await pool.query("UPDATE despacho SET estado = 'En sitio', fecha_llegada = NOW() WHERE id = ?", [d.id]);
    await auditReq(req, 'LLEGADA_SITIO', `${eq.codigo} · ${rep.codigo}`);
    notificar(d, eq, rep.codigo, 'En sitio');
    return { estado: 'En sitio' };
  }
  if (d.estado === 'En sitio') {
    await tx(async (c) => {
      await c.query("UPDATE despacho SET estado = 'Controlada', fecha_control = NOW() WHERE id = ?", [d.id]);
      await c.query("UPDATE equipo SET estado = 'Disponible' WHERE id = ?", [eq.id]);
      await c.query("UPDATE reporte_ciudadano SET estado = 'Atendido' WHERE id = ?", [d.reporte_id]);
    });
    await auditReq(req, 'SITUACION_CONTROLADA', `${eq.codigo} · ${rep.codigo}`);
    notificar(d, eq, rep.codigo, 'Atendido');
    return { estado: 'Controlada' };
  }
  throw conflict(d.estado === 'Despachado' ? 'Acepte primero la misión' : 'La misión ya está cerrada');
}
