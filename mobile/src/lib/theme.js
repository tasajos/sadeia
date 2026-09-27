/** Tokens de la Guía de estilo SADE-IA v1.0. Controles de 48 px para uso con guantes (RNF-07). */
export const C = {
  azul950: '#071A33', azul900: '#0B2545', azul800: '#0D3A6E', azul700: '#0F559C', azul600: '#1170B8',
  azul400: '#4C9BD6', azul200: '#B9D7F0', azul100: '#E3EFFA', azul50: '#F3F8FD',
  naranja700: '#B85A0E', naranja600: '#E0741A', naranja500: '#F7931E', naranja50: '#FEF3E7',
  tinta: '#0E1B2C', texto2: '#4A5A6E', texto3: '#8394A8', borde: '#D6DFEA', fondo: '#EEF3F8', blanco: '#FFFFFF',
  verde: '#2E9E5B', okBg: '#E4F4EA', okFg: '#1E6B3E', rojo: '#C62828', errBg: '#FDECEC', errFg: '#8E1C1C'
};

export const LV = {
  verde: { bg: '#2E9E5B', fg: '#FFFFFF', label: 'VERDE', icon: 'check-circle' },
  amarilla: { bg: '#F2C230', fg: '#0E1B2C', label: 'AMARILLA', icon: 'visibility' },
  naranja: { bg: '#E8661A', fg: '#0E1B2C', label: 'NARANJA', icon: 'warning' },
  roja: { bg: '#C62828', fg: '#FFFFFF', label: 'ROJA', icon: 'crisis-alert' }
};

export const PR = {
  'CRÍTICA': { bg: '#C62828', fg: '#FFFFFF' },
  ALTA: { bg: '#E8661A', fg: '#0E1B2C' },
  MEDIA: { bg: '#F2C230', fg: '#0E1B2C' },
  BAJA: { bg: '#D6DFEA', fg: '#0E1B2C' }
};

export const ST = {
  'En curso': { bg: '#E3EFFA', fg: '#0F559C' },
  Pendiente: { bg: '#FEF3E7', fg: '#B85A0E' },
  Vencida: { bg: '#FDECEC', fg: '#C62828' },
  Completada: { bg: '#E4F4EA', fg: '#1E6B3E' },
  Confirmada: { bg: '#E4F4EA', fg: '#1E6B3E' },
  Enviada: { bg: '#FEF3E7', fg: '#B85A0E' }
};

export const mono = 'monospace';
