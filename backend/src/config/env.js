import 'dotenv/config';
import path from 'node:path';

const req = (k, def) => {
  const v = process.env[k] ?? def;
  if (v === undefined) throw new Error(`Falta la variable de entorno ${k}`);
  return v;
};

export const env = {
  port: Number(req('PORT', 4000)),
  nodeEnv: req('NODE_ENV', 'development'),
  corsOrigins: req('CORS_ORIGINS', 'http://localhost:5173').split(',').map((s) => s.trim()),
  publicUrl: req('PUBLIC_URL', 'http://localhost:4000'),
  db: {
    host: req('DB_HOST', '127.0.0.1'),
    port: Number(req('DB_PORT', 3306)),
    user: req('DB_USER', 'root'),
    password: req('DB_PASSWORD', ''),
    database: req('DB_NAME', 'sadeia_db')
  },
  jwtSecret: req('JWT_SECRET', 'dev-secret-cambiar'),
  jwtExpires: req('JWT_EXPIRES', '8h'),
  maxLoginAttempts: Number(req('MAX_LOGIN_ATTEMPTS', 5)),
  aiServiceUrl: process.env.AI_SERVICE_URL || '',
  schedulerInterval: Number(req('SCHEDULER_INTERVAL', 45)),
  uploadDir: path.resolve(req('UPLOAD_DIR', 'uploads')),
  maxUploadMb: Number(req('MAX_UPLOAD_MB', 8)),
  // Fotos en Google Drive (si no se configura, se guardan en UPLOAD_DIR)
  drive: {
    folderId: process.env.GOOGLE_DRIVE_FOLDER_ID || '',
    keyFile: process.env.GOOGLE_DRIVE_KEY_FILE ? path.resolve(process.env.GOOGLE_DRIVE_KEY_FILE) : '',
    credentialsJson: process.env.GOOGLE_DRIVE_CREDENTIALS_JSON || '',
    impersonate: process.env.GOOGLE_DRIVE_IMPERSONATE || ''
  }
};

if (env.nodeEnv === 'production' && env.jwtSecret.startsWith('dev-')) {
  throw new Error('Configure JWT_SECRET en producción');
}
