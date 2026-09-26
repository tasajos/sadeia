import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import compression from 'compression';
import { env } from './config/env.js';
import { pool } from './config/db.js';
import { authenticate } from './middleware/auth.js';
import { notFoundHandler, errorHandler } from './middleware/error.js';

import authRoutes from './routes/auth.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import alertsRoutes from './routes/alerts.routes.js';
import eventsRoutes from './routes/events.routes.js';
import coordinationRoutes from './routes/coordination.routes.js';
import sourcesRoutes from './routes/sources.routes.js';
import modelsRoutes from './routes/models.routes.js';
import reportsRoutes from './routes/reports.routes.js';
import adminRoutes from './routes/admin.routes.js';
import citizenReportsRoutes from './routes/citizenReports.routes.js';
import missionsRoutes from './routes/missions.routes.js';
import publicRoutes from './routes/public.routes.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // detrás de Nginx / balanceador con HTTPS (RNF-03)

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({
    origin: (origin, cb) => cb(null, !origin || env.corsOrigins.includes('*') || env.corsOrigins.includes(origin)),
    credentials: true
  }));
  app.use(compression());
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));
  if (env.nodeEnv !== 'test') app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

  // Archivos subidos (fotos de reportes, informes, reportes exportados)
  app.use('/uploads', express.static(env.uploadDir, { maxAge: '7d' }));

  // Salud del servicio (monitoreo de disponibilidad RNF-02)
  app.get('/api/health', async (_req, res) => {
    const t = Date.now();
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', db: 'ok', ms: Date.now() - t, time: new Date() });
    } catch (e) {
      res.status(503).json({ status: 'degraded', db: e.message });
    }
  });

  // Públicas
  app.use('/api/auth', authRoutes);
  app.use('/api/publico', publicRoutes);
  app.use('/api/datos', sourcesRoutes); // /api/datos/ingesta admite x-api-key; el resto exige sesión y permisos

  // Protegidas por JWT
  app.use('/api', authenticate);
  app.use('/api/tablero', dashboardRoutes);
  app.use('/api/alertas', alertsRoutes);
  app.use('/api/eventos', eventsRoutes);
  app.use('/api/coordinacion', coordinationRoutes);
  app.use('/api/modelos', modelsRoutes);
  app.use('/api/reportes', reportsRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/reportes-ciudadanos', citizenReportsRoutes);
  app.use('/api/misiones', missionsRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
