import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Directory, File, Paths } from 'expo-file-system';

/**
 * Fotos de reportes: las cámaras actuales generan archivos de 3-8 MB que no alcanzan a subir con
 * señal débil. Se reducen a 1600 px y JPEG 70 % (≈ 250-500 KB), suficiente para evaluar la emergencia.
 */
const MAX_LADO = 1600;

export async function prepararFoto(asset) {
  try {
    const ctx = ImageManipulator.manipulate(asset.uri);
    const w = asset.width || 0;
    const h = asset.height || 0;
    if (w >= h && w > MAX_LADO) ctx.resize({ width: MAX_LADO });
    else if (h > w && h > MAX_LADO) ctx.resize({ height: MAX_LADO });
    const img = await ctx.renderAsync();
    const r = await img.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
    return { uri: r.uri, width: r.width, height: r.height, fileName: `foto-${Date.now()}.jpg`, mimeType: 'image/jpeg' };
  } catch {
    // Si no se puede procesar, se envía la original con un tipo válido para el servidor.
    return { uri: asset.uri, width: asset.width, height: asset.height, fileName: asset.fileName || `foto-${Date.now()}.jpg`, mimeType: asset.mimeType || 'image/jpeg' };
  }
}

/** Carpeta permanente para fotos de envíos en cola (la caché puede ser vaciada por el sistema). */
function carpetaCola() {
  const dir = new Directory(Paths.document, 'cola-fotos');
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export async function persistirFotos(photos = []) {
  if (!photos.length) return photos;
  const dir = carpetaCola();
  return Promise.all(photos.map(async (p, i) => {
    try {
      const dest = new File(dir, `${Date.now()}-${i}-${p.fileName || 'foto.jpg'}`);
      await new File(p.uri).copy(dest);
      return { ...p, uri: dest.uri };
    } catch {
      return p;
    }
  }));
}

/** Descarta fotos cuyo archivo ya no existe (evita que un envío en cola quede bloqueado para siempre). */
export function fotosDisponibles(photos = []) {
  return photos.filter((p) => {
    try { return new File(p.uri).exists; } catch { return false; }
  });
}

export function borrarFotosCola(photos = []) {
  photos.forEach((p) => {
    try {
      if (p.uri.includes('/cola-fotos/')) new File(p.uri).delete();
    } catch { /* ya no existe */ }
  });
}
