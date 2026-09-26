/**
 * Simulador de fuentes: envía lecturas a la API de ingesta como lo haría la red de SENAMHI.
 * Demuestra el flujo completo CU-01 → CU-02 → CU-03: validación, descarte, inferencia y
 * propuesta automática de alerta.
 *
 * Uso: npm run simulate [-- --url http://localhost:4000 --key dev-senamhi-hidro --loop]
 */
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? true : arr[i + 1]] : null).filter(Boolean));
const URL_API = (args.url || process.env.API_URL || 'http://localhost:4000').replace(/\/$/, '');
const KEY = args.key || 'dev-senamhi-hidro';

const rnd = (a, b) => Math.round((a + Math.random() * (b - a)) * 100) / 100;

function lote(paso) {
  const nivel = 7.4 + paso * 0.35; // el río Beni en Riberalta va subiendo
  return [
    // Riberalta, Beni: al cruzar umbrales el motor propone una alerta nueva
    { estacion: 'Est. Riberalta (río Beni)', departamento: 'Beni', municipio: 'Riberalta', lat: -11.0, lng: -66.07, variable: 'nivel_rio', valor: nivel },
    { estacion: 'Est. Riberalta (río Beni)', departamento: 'Beni', municipio: 'Riberalta', lat: -11.0, lng: -66.07, variable: 'precip_72h', valor: 90 + paso * 12 },
    { estacion: 'Est. Riberalta (río Beni)', departamento: 'Beni', municipio: 'Riberalta', lat: -11.0, lng: -66.07, variable: 'humedad_suelo', valor: Math.min(99, 80 + paso * 3) },
    { estacion: 'Est. Riberalta (río Beni)', departamento: 'Beni', municipio: 'Riberalta', lat: -11.0, lng: -66.07, variable: 'tendencia_nivel', valor: 2 + paso * 0.8 },
    // Trinidad sigue creciendo (actualiza la propuesta pendiente)
    { estacion: 'Est. Puerto Varador (río Mamoré)', departamento: 'Beni', municipio: 'Trinidad', lat: -14.833, lng: -64.9, variable: 'nivel_rio', valor: 8.92 + paso * 0.05 },
    // Monitoreo normal
    { estacion: 'Est. Tarija', departamento: 'Tarija', municipio: 'Tarija', lat: -21.53, lng: -64.73, variable: 'temperatura', valor: rnd(15, 24) },
    // Lectura inválida (control de calidad RF-02)
    ...(paso % 2 === 0 ? [{ estacion: 'Est. El Alto Aeropuerto', departamento: 'La Paz', municipio: 'El Alto', variable: 'temperatura', valor: -41 }] : [])
  ];
}

async function enviar(paso) {
  const r = await fetch(`${URL_API}/api/datos/ingesta`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': KEY },
    body: JSON.stringify({ lecturas: lote(paso) })
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.status);
  const alertas = j.evaluaciones.filter((e) => e.alerta).map((e) => `${e.alerta}${e.nueva ? ' (nueva)' : ''} ${e.prediccion.nivel.toUpperCase()} p=${e.prediccion.probabilidad}`);
  console.log(`[sim] paso ${paso}: ${j.aceptadas} aceptadas, ${j.descartadas} descartadas${alertas.length ? ' · ' + alertas.join(' · ') : ''}`);
}

const pasos = args.loop ? Infinity : 5;
for (let p = 0; p < pasos; p++) {
  try { await enviar(p % 8); } catch (e) { console.error('[sim] error:', e.message); }
  await new Promise((ok) => setTimeout(ok, args.loop ? 30000 : 1500));
}
