import { q, pool } from '../config/db.js';
import { env } from '../config/env.js';
import { sincronizar } from './ingestService.js';
import { reintentarFallidas } from './notificationService.js';
import { emit } from '../socket.js';

/**
 * Planificador interno:
 *  - Sincroniza las fuentes cuyo periodo venció (RF-01).
 *  - Marca como "Retrasada" una fuente sin datos por más de 2 periodos.
 *  - Reintenta notificaciones fallidas (flujo 7.a de CU-03).
 *  - Marca tareas vencidas (RF-11).
 */
async function tick() {
  try {
    const fuentes = await q(
      `SELECT * FROM fuente_datos WHERE estado <> 'Inactiva' AND url IS NOT NULL
        AND (ultima_sinc IS NULL OR ultima_sinc <= NOW() - INTERVAL periodicidad_min MINUTE)`
    );
    for (const f of fuentes) await sincronizar(f);

    await pool.query(
      `UPDATE fuente_datos SET estado = 'Retrasada'
        WHERE estado = 'Operativa' AND ultima_sinc IS NOT NULL AND ultima_sinc < NOW() - INTERVAL (periodicidad_min * 2) MINUTE`
    );

    await reintentarFallidas();

    const [r] = await pool.query(
      "UPDATE tarea SET estado = 'Vencida' WHERE estado IN ('Pendiente','En curso') AND plazo < NOW()"
    );
    if (r.affectedRows) emit('tarea:actualizada', { vencidas: r.affectedRows });
  } catch (e) {
    console.error('[scheduler]', e.message);
  }
}

export function startScheduler() {
  const ms = env.schedulerInterval * 1000;
  setTimeout(tick, 3000);
  return setInterval(tick, ms);
}
