import { q, one, pool } from '../config/db.js';
import { audit } from './auditService.js';
import { emit, broadcast } from '../socket.js';

/** Instituciones concernidas: por amenaza + las del departamento afectado + COEN y VIDECI. */
export async function institucionesConcernidas(alerta) {
  return q(
    `SELECT DISTINCT i.* FROM institucion i
      WHERE i.activa = 1 AND (
            i.id IN (SELECT institucion_id FROM amenaza_institucion WHERE amenaza_id = ?)
         OR (i.departamento = ? AND i.tipo IN ('Departamental','Municipal'))
         OR i.sigla IN ('COEN','VIDECI'))
      ORDER BY FIELD(i.sigla,'COEN','VIDECI') DESC, i.nombre`,
    [alerta.amenaza_id, alerta.departamento]
  );
}

async function enviarWebhook(inst, payload) {
  if (!inst.webhook_url) return true; // canal interno (socket) siempre disponible
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(inst.webhook_url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: ctrl.signal
    });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Notificación SIMULTÁNEA a todas las instituciones (RF-06) — reemplaza la cadena jerárquica.
 * @param {number} alertaId
 * @param {'Validada y notificada'|'Notificada'} estadoExito
 */
export async function notificarAlerta(alertaId, estadoExito = 'Validada y notificada') {
  const a = await one(
    `SELECT a.*, am.nombre AS amenaza, am.icono FROM alerta a JOIN amenaza am ON am.id = a.amenaza_id WHERE a.id = ?`,
    [alertaId]
  );
  if (!a) return null;
  const insts = await institucionesConcernidas(a);
  const payload = {
    id: a.id, codigo: a.codigo, nivel: a.nivel, amenaza: a.amenaza, icono: a.icono, lugar: a.lugar,
    probabilidad: a.probabilidad, horizonte: a.horizonte, lat: a.lat, lng: a.lng
  };

  const resultados = await Promise.all(
    insts.map(async (inst) => {
      await pool.query('INSERT IGNORE INTO alerta_notificacion (alerta_id, institucion_id) VALUES (?, ?)', [a.id, inst.id]);
      const prev = await one('SELECT estado FROM alerta_notificacion WHERE alerta_id = ? AND institucion_id = ?', [a.id, inst.id]);
      if (prev?.estado === 'Confirmada' || prev?.estado === 'Enviada') return true;
      emit('alerta:recibida', payload, `inst:${inst.id}`);
      const ok = await enviarWebhook(inst, payload);
      await pool.query(
        'UPDATE alerta_notificacion SET estado = ?, fecha_envio = NOW() WHERE alerta_id = ? AND institucion_id = ?',
        [ok ? 'Enviada' : 'Fallida', a.id, inst.id]
      );
      return ok;
    })
  );

  const fallidas = resultados.filter((r) => !r).length;
  const estado = fallidas ? 'Emitida no notificada' : estadoExito;
  await pool.query('UPDATE alerta SET estado = ?, reintentos = reintentos + ? WHERE id = ?', [estado, fallidas ? 1 : 0, a.id]);
  await audit({ usuario: 'sistema', operacion: fallidas ? 'FALLA_NOTIFICACION' : 'NOTIFICAR_ALERTA', objeto: a.codigo, detalle: { instituciones: insts.length, fallidas } });
  emit('alerta:actualizada', { id: a.id, codigo: a.codigo, estado });
  if (!fallidas && ['naranja', 'roja'].includes(a.nivel)) broadcast('alerta:publica', payload);
  return { instituciones: insts.length, fallidas, estado };
}

/** Reintento automático de notificaciones fallidas (flujo 7.a). */
export async function reintentarFallidas() {
  const rows = await q("SELECT id, validado_por FROM alerta WHERE estado = 'Emitida no notificada' AND reintentos < 20");
  for (const r of rows) await notificarAlerta(r.id, r.validado_por ? 'Validada y notificada' : 'Notificada');
  return rows.length;
}
