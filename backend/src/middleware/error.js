import { HttpError } from '../utils/http.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err?.name === 'MulterError') {
    return res.status(400).json({ error: `Archivo inválido: ${err.message}` });
  }
  if (err?.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'Registro duplicado' });
  }
  if (err?.sqlState === '45000') {
    return res.status(403).json({ error: err.sqlMessage || err.message });
  }
  console.error('[ERROR]', err);
  res.status(500).json({ error: 'Error interno del servidor' });
}
