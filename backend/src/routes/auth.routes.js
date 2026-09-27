import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { one, pool } from '../config/db.js';
import { env } from '../config/env.js';
import { authenticate, loadProfile, signToken } from '../middleware/auth.js';
import { audit, auditReq } from '../services/auditService.js';
import { badRequest, unauthorized, clientIp, required } from '../utils/http.js';

const r = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

/** CU-13 · RF-16: autenticación con credenciales y token de vigencia limitada. */
r.post('/login', loginLimiter, async (req, res) => {
  const login = String(req.body.username || req.body.usuario || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!login || !password) throw badRequest('Ingrese usuario y contraseña');
  const u = await one(
    'SELECT u.*, i.activa AS institucion_activa FROM usuario u JOIN institucion i ON i.id = u.institucion_id WHERE LOWER(u.username) = ? OR LOWER(u.email) = ?',
    [login, login]
  );
  const ip = clientIp(req);
  if (!u) {
    await audit({ usuario: login.slice(0, 40), operacion: 'LOGIN_FALLIDO', objeto: 'usuario inexistente', ip });
    throw unauthorized('Credenciales incorrectas');
  }
  if (u.estado !== 'Activo') {
    await audit({ usuario: u.username, operacion: 'LOGIN_BLOQUEADO', ip });
    throw unauthorized('Usuario bloqueado. Contacte al administrador.');
  }
  const ok = await bcrypt.compare(password, u.password_hash);
  if (ok && !u.institucion_activa) {
    await audit({ usuario: u.username, operacion: 'LOGIN_BLOQUEADO', objeto: 'institución desactivada', ip });
    throw unauthorized('Su institución está desactivada. Contacte al administrador.');
  }
  if (!ok) {
    const intentos = u.intentos_fallidos + 1;
    const bloquear = intentos >= env.maxLoginAttempts;
    await pool.query('UPDATE usuario SET intentos_fallidos = ?, estado = ? WHERE id = ?', [intentos, bloquear ? 'Bloqueado' : 'Activo', u.id]);
    await audit({ usuario: u.username, operacion: bloquear ? 'BLOQUEO_USUARIO' : 'LOGIN_FALLIDO', objeto: `intento ${intentos}`, ip });
    throw unauthorized(bloquear ? 'Usuario bloqueado por intentos fallidos' : 'Credenciales incorrectas');
  }
  await pool.query('UPDATE usuario SET intentos_fallidos = 0, ultimo_acceso = NOW() WHERE id = ?', [u.id]);
  const profile = await loadProfile(u.id);
  const token = signToken(profile);
  await audit({ usuario: u.username, operacion: 'INICIAR_SESION', objeto: `token ${env.jwtExpires}`, ip });
  res.json({ token, expiresIn: env.jwtExpires, user: profile });
});

r.get('/me', authenticate, (req, res) => res.json(req.user));

r.post('/logout', authenticate, async (req, res) => {
  await auditReq(req, 'CERRAR_SESION', null);
  res.json({ ok: true });
});

r.put('/password', authenticate, async (req, res) => {
  required(req.body, ['actual', 'nueva']);
  if (String(req.body.nueva).length < 8) throw badRequest('La nueva contraseña debe tener al menos 8 caracteres');
  const u = await one('SELECT password_hash FROM usuario WHERE id = ?', [req.user.id]);
  if (!(await bcrypt.compare(req.body.actual, u.password_hash))) throw badRequest('La contraseña actual no es correcta');
  await pool.query('UPDATE usuario SET password_hash = ? WHERE id = ?', [await bcrypt.hash(req.body.nueva, 10), req.user.id]);
  await auditReq(req, 'CAMBIAR_CONTRASENA', req.user.username);
  res.json({ ok: true });
});

export default r;
