/** Niveles de alerta del D.S. N.° 2342 (RF-04) y reglas de clasificación. */
export const NIVELES = ['verde', 'amarilla', 'naranja', 'roja'];

export const NIVEL_INFO = {
  verde: { label: 'VERDE', color: '#2E9E5B', desc: 'Sin amenaza. Monitoreo regular.' },
  amarilla: { label: 'AMARILLA', color: '#F2C230', desc: 'Amenaza probable. Preparación institucional.' },
  naranja: { label: 'NARANJA', color: '#E8661A', desc: 'Amenaza inminente. Alistamiento de recursos.' },
  roja: { label: 'ROJA', color: '#C62828', desc: 'Evento en curso o inminente. Respuesta.' }
};

/** Cortes de probabilidad → nivel. Configurables por entorno si se requiere. */
export const CORTES = { roja: 0.8, naranja: 0.65, amarilla: 0.5 };

export function nivelDesdeProbabilidad(p, algunaVariableSuperaUmbral = true) {
  if (!algunaVariableSuperaUmbral) return 'verde';
  if (p >= CORTES.roja) return 'roja';
  if (p >= CORTES.naranja) return 'naranja';
  if (p >= CORTES.amarilla) return 'amarilla';
  return 'verde';
}

export const nivelMayor = (a, b) => (NIVELES.indexOf(a) >= NIVELES.indexOf(b) ? a : b);

/** Estados de alerta considerados "abiertos". */
export const ALERTA_ABIERTA = ['Pendiente de validación', 'Modificada · pendiente', 'Emitida no notificada', 'Validada y notificada', 'Notificada'];
export const ALERTA_PENDIENTE = ['Pendiente de validación', 'Modificada · pendiente'];

/** Tipos de reporte ciudadano. */
export const TIPOS_REPORTE = {
  inundacion: { label: 'Inundación', icon: 'flood', amenaza: 'INU' },
  incendio: { label: 'Incendio', icon: 'local_fire_department', amenaza: 'INC' },
  deslizamiento: { label: 'Deslizamiento', icon: 'landslide', amenaza: 'DES' },
  tormenta: { label: 'Tormenta / granizo', icon: 'thunderstorm', amenaza: 'GRA' },
  personas: { label: 'Personas en peligro', icon: 'sos', amenaza: null },
  otro: { label: 'Otro', icon: 'more_horiz', amenaza: null }
};
