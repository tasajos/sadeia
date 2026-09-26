export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (m, d) => new HttpError(400, m, d);
export const unauthorized = (m = 'No autenticado') => new HttpError(401, m);
export const forbidden = (m = 'Operación no permitida para su rol (RNF-04)') => new HttpError(403, m);
export const notFound = (m = 'Recurso no encontrado') => new HttpError(404, m);
export const conflict = (m) => new HttpError(409, m);

/** Valida campos obligatorios del body. */
export function required(body, fields) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === '');
  if (missing.length) throw badRequest(`Campos obligatorios: ${missing.join(', ')}`);
}

export const clientIp = (req) =>
  (req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || '').replace('::ffff:', '');
