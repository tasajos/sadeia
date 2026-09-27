import { File } from 'expo-file-system';

/**
 * Cuerpo multipart/form-data armado a mano (campos + fotos locales por uri).
 * Desde Expo SDK 57 el `fetch` global es `expo/fetch`, que no admite las partes `{ uri, name, type }`
 * de React Native en un FormData: la petición fallaba y el reporte quedaba en la cola "sin señal".
 * Enviar los bytes directamente no depende de ninguna conversión de FormData.
 */
export async function toMultipart(fields = {}, photos = []) {
  const boundary = `----sadeia${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  const enc = new TextEncoder();
  const parts = [];
  Object.entries(fields).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    const val = typeof v === 'object' ? JSON.stringify(v) : String(v);
    parts.push(enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${val}\r\n`));
  });
  for (const [i, p] of photos.entries()) {
    let bytes;
    try {
      bytes = await new File(p.uri).bytes();
    } catch (e) {
      throw new Error(`No se pudo leer la foto ${i + 1}: ${e.message}`);
    }
    const name = (p.fileName || `foto-${i + 1}.jpg`).replace(/["\r\n]/g, '_');
    parts.push(
      enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="fotos"; filename="${name}"\r\nContent-Type: ${p.mimeType || 'image/jpeg'}\r\n\r\n`),
      bytes,
      enc.encode('\r\n')
    );
  }
  parts.push(enc.encode(`--${boundary}--\r\n`));
  const body = new Uint8Array(parts.reduce((n, x) => n + x.length, 0));
  let o = 0;
  parts.forEach((x) => { body.set(x, o); o += x.length; });
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}
