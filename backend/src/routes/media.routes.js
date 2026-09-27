import { Router } from 'express';
import { Readable } from 'node:stream';
import { one } from '../config/db.js';
import { descargarArchivo, driveActivo } from '../services/driveService.js';

const r = Router();

/**
 * Fotos guardadas en Google Drive: el backend las lee con la cuenta de servicio y las reenvía,
 * así la carpeta de Drive se mantiene privada (no se comparte "cualquiera con el enlace").
 * Solo se sirven archivos registrados en SADE-IA, no cualquier archivo al que acceda la cuenta.
 */
r.get('/drive/:id', async (req, res) => {
  const { id } = req.params;
  if (!/^[\w-]{10,128}$/.test(id) || !driveActivo()) return res.status(404).end();
  const ruta = `/uploads/drive/${id}`;
  const registrada = await one(
    `SELECT 1 AS ok FROM reporte_foto WHERE ruta = ?
     UNION ALL SELECT 1 FROM informe_foto WHERE ruta = ?
     UNION ALL SELECT 1 FROM tarea_avance WHERE foto = ? LIMIT 1`, [ruta, ruta, ruta]
  );
  if (!registrada) return res.status(404).end();
  try {
    const d = await descargarArchivo(id);
    res.set('Content-Type', d.headers.get('content-type') || 'image/jpeg');
    if (d.headers.get('content-length')) res.set('Content-Length', d.headers.get('content-length'));
    res.set('Cache-Control', 'private, max-age=604800, immutable');
    Readable.fromWeb(d.body).pipe(res);
  } catch (e) {
    console.error('[drive] No se pudo leer', id, e.message);
    res.status(e.status === 404 ? 404 : 502).end();
  }
});

export default r;
