import fs from 'node:fs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

/**
 * Almacenamiento de fotos en Google Drive con una cuenta de servicio (sin dependencias extra:
 * el token OAuth se firma con jsonwebtoken y se usa la API REST de Drive v3).
 *
 * Importante: las cuentas de servicio NO tienen cuota propia. La carpeta GOOGLE_DRIVE_FOLDER_ID debe estar
 * en una unidad compartida (Shared Drive) donde la cuenta de servicio sea "Administrador de contenido",
 * o bien configurarse GOOGLE_DRIVE_IMPERSONATE (delegación de dominio) para escribir en el Drive de un usuario.
 */
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const SCOPE = 'https://www.googleapis.com/auth/drive';

let cred;
let token = null;
const carpetas = new Map();

function credenciales() {
  if (cred !== undefined) return cred;
  try {
    const raw = env.drive.credentialsJson || (env.drive.keyFile ? fs.readFileSync(env.drive.keyFile, 'utf8') : '');
    cred = raw ? JSON.parse(raw) : null;
    if (cred && (!cred.client_email || !cred.private_key)) throw new Error('faltan client_email / private_key');
  } catch (e) {
    console.error('[drive] Credenciales de la cuenta de servicio inválidas:', e.message);
    cred = null;
  }
  return cred;
}

export const driveActivo = () => !!(env.drive.folderId && credenciales());

async function accessToken() {
  if (token && token.exp > Date.now() + 60_000) return token.value;
  const c = credenciales();
  const aud = c.token_uri || 'https://oauth2.googleapis.com/token';
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: c.client_email, scope: SCOPE, aud, iat: now, exp: now + 3600 };
  if (env.drive.impersonate) claims.sub = env.drive.impersonate;
  const assertion = jwt.sign(claims, c.private_key, { algorithm: 'RS256' });
  const r = await fetch(aud, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Google OAuth ${r.status}: ${d.error_description || d.error || 'sin detalle'}`);
  token = { value: d.access_token, exp: Date.now() + d.expires_in * 1000 };
  return token.value;
}

async function gapi(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${await accessToken()}`, ...opts.headers } });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    const err = new Error(`Google Drive ${r.status}: ${txt.slice(0, 300)}`);
    err.status = r.status;
    throw err;
  }
  return r;
}

/** Subcarpeta por módulo (reportes, informes, tareas) dentro de la carpeta raíz; se crea una sola vez. */
function carpeta(nombre) {
  if (!carpetas.has(nombre)) {
    const p = (async () => {
      const q = `name='${nombre}' and '${env.drive.folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const params = new URLSearchParams({ q, fields: 'files(id)', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', corpora: 'allDrives' });
      const found = await (await gapi(`${API}/files?${params}`)).json();
      if (found.files?.[0]) return found.files[0].id;
      const created = await (await gapi(`${API}/files?supportsAllDrives=true&fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nombre, mimeType: 'application/vnd.google-apps.folder', parents: [env.drive.folderId] })
      })).json();
      return created.id;
    })();
    carpetas.set(nombre, p);
    p.catch(() => carpetas.delete(nombre)); // reintenta en la próxima subida
  }
  return carpetas.get(nombre);
}

/** Sube un archivo local y devuelve su id de Drive. */
export async function subirArchivo({ ruta, nombre, mime, modulo = 'reportes' }) {
  const parent = await carpeta(modulo);
  const boundary = `sadeia-${crypto.randomBytes(8).toString('hex')}`;
  const meta = JSON.stringify({ name: nombre, parents: [parent] });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`),
    await fs.promises.readFile(ruta),
    Buffer.from(`\r\n--${boundary}--`)
  ]);
  const r = await gapi(`${UPLOAD}/files?uploadType=multipart&supportsAllDrives=true&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body
  });
  return (await r.json()).id;
}

/** Descarga el contenido de un archivo (Response de fetch, para reenviarlo al cliente). */
export const descargarArchivo = (id) => gapi(`${API}/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`);
