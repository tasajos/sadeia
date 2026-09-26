/** Distancia Haversine en km. */
export function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** ETA estimada en minutos a una velocidad urbana de emergencia (~20 km/h efectivos + 1 min de salida). */
export function etaMin(km, kmh = 20) {
  return Math.max(2, Math.round((km / kmh) * 60) + 1);
}

/** Departamentos de Bolivia con punto de monitoreo de referencia. */
export const DEPARTAMENTOS = {
  'La Paz': [-16.5, -68.15],
  Cochabamba: [-17.39, -66.16],
  'Santa Cruz': [-17.78, -63.18],
  Oruro: [-17.97, -67.11],
  Potosí: [-19.58, -65.75],
  Chuquisaca: [-19.05, -65.26],
  Tarija: [-21.53, -64.73],
  Beni: [-14.83, -64.9],
  Pando: [-11.03, -68.77]
};
