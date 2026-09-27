import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { badRequest } from '../utils/http.js';
import { driveActivo, subirArchivo } from '../services/driveService.js';

fs.mkdirSync(env.uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const sub = path.join(env.uploadDir, req.uploadFolder || 'reportes');
    fs.mkdirSync(sub, { recursive: true });
    cb(null, sub);
  },
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  }
});

const ALLOWED = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
// Algunos teléfonos Android envían las fotos como application/octet-stream: se valida por extensión.
const EXT = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'];
const esImagen = (file) => ALLOWED.includes(file.mimetype)
  || (file.mimetype === 'application/octet-stream' && EXT.includes(path.extname(file.originalname || '').toLowerCase()));

export const folder = (name) => (req, _res, next) => {
  req.uploadFolder = name;
  next();
};

const recibirFotos = multer({
  storage,
  limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, cb) =>
    esImagen(file) ? cb(null, true) : cb(badRequest('Solo se aceptan imágenes JPG, PNG, WEBP o HEIC'))
}).array('fotos', 6);

const MIME_EXT = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.heic': 'image/heic', '.heif': 'image/heif' };

/**
 * Con Google Drive configurado, cada foto recibida se sube a Drive y se borra la copia local.
 * Si Drive falla, la foto queda en disco: el reporte de emergencia nunca se pierde por el almacenamiento.
 */
async function fotosADrive(req, _res, next) {
  if (!req.files?.length || !driveActivo()) return next();
  await Promise.all(req.files.map(async (f) => {
    try {
      const mime = ALLOWED.includes(f.mimetype) && f.mimetype !== 'image/jpg' ? f.mimetype : MIME_EXT[path.extname(f.filename).toLowerCase()] || 'image/jpeg';
      f.driveId = await subirArchivo({ ruta: f.path, nombre: f.filename, mime, modulo: req.uploadFolder || 'reportes' });
      fs.promises.unlink(f.path).catch(() => {});
    } catch (e) {
      console.error(`[drive] No se pudo subir ${f.filename}; se conserva en disco:`, e.message);
    }
  }));
  next();
}

export const uploadPhotos = [recibirFotos, fotosADrive];

/** Ruta pública relativa guardada en BD (las fotos en Drive se sirven por /uploads/drive/<id>). */
export const publicPath = (file) => (file.driveId
  ? `/uploads/drive/${file.driveId}`
  : '/uploads/' + path.relative(env.uploadDir, file.path).split(path.sep).join('/'));
