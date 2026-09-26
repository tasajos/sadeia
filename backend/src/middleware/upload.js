import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { badRequest } from '../utils/http.js';

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

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export const folder = (name) => (req, _res, next) => {
  req.uploadFolder = name;
  next();
};

export const uploadPhotos = multer({
  storage,
  limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, cb) =>
    ALLOWED.includes(file.mimetype) ? cb(null, true) : cb(badRequest('Solo se aceptan imágenes JPG, PNG, WEBP o HEIC'))
}).array('fotos', 6);

/** Ruta pública relativa guardada en BD. */
export const publicPath = (file) => '/uploads/' + path.relative(env.uploadDir, file.path).split(path.sep).join('/');
