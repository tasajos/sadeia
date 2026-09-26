/** Niveles de alerta D.S. N.° 2342 (RF-04). El naranja de marca (#F7931E) nunca se usa como nivel. */
export const LV = {
  verde: { bg: '#2E9E5B', fg: '#FFFFFF', label: 'VERDE', icon: 'check_circle', hex: '#2E9E5B' },
  amarilla: { bg: '#F2C230', fg: '#0E1B2C', label: 'AMARILLA', icon: 'visibility', hex: '#F2C230' },
  naranja: { bg: '#E8661A', fg: '#0E1B2C', label: 'NARANJA', icon: 'warning', hex: '#E8661A' },
  roja: { bg: '#C62828', fg: '#FFFFFF', label: 'ROJA', icon: 'crisis_alert', hex: '#C62828' }
};

export const ST = {
  'Pendiente de validación': { bg: '#FEF3E7', fg: '#B85A0E' },
  'Modificada · pendiente': { bg: '#FEF3E7', fg: '#B85A0E' },
  'Emitida no notificada': { bg: '#FDECEC', fg: '#C62828' },
  'Validada y notificada': { bg: '#E3EFFA', fg: '#0F559C' },
  Notificada: { bg: '#E3EFFA', fg: '#0F559C' },
  Descartada: { bg: '#EEF3F8', fg: '#4A5A6E' },
  Cerrada: { bg: '#EEF3F8', fg: '#4A5A6E' },
  'En curso': { bg: '#E3EFFA', fg: '#0F559C' },
  Pendiente: { bg: '#FEF3E7', fg: '#B85A0E' },
  Vencida: { bg: '#FDECEC', fg: '#C62828' },
  Completada: { bg: '#E4F4EA', fg: '#1E6B3E' },
  Nuevo: { bg: '#FDECEC', fg: '#C62828' },
  'En revisión': { bg: '#FEF3E7', fg: '#B85A0E' },
  'Equipo despachado': { bg: '#E3EFFA', fg: '#0F559C' },
  'Vinculado a evento': { bg: '#E3EFFA', fg: '#0F559C' },
  'Falso / descartado': { bg: '#EEF3F8', fg: '#4A5A6E' },
  Atendido: { bg: '#E4F4EA', fg: '#1E6B3E' },
  'En producción': { bg: '#E4F4EA', fg: '#1E6B3E' },
  Archivada: { bg: '#EEF3F8', fg: '#4A5A6E' },
  Entrenando: { bg: '#FEF3E7', fg: '#B85A0E' },
  Fallida: { bg: '#FDECEC', fg: '#C62828' },
  Aprobada: { bg: '#E4F4EA', fg: '#1E6B3E' },
  Modificada: { bg: '#FEF3E7', fg: '#B85A0E' }
};

export const PR = {
  'CRÍTICA': { bg: '#C62828', fg: '#FFFFFF', label: 'CRÍTICA' },
  ALTA: { bg: '#E8661A', fg: '#0E1B2C', label: 'ALTA' },
  MEDIA: { bg: '#F2C230', fg: '#0E1B2C', label: 'MEDIA' },
  BAJA: { bg: '#D6DFEA', fg: '#0E1B2C', label: 'BAJA' }
};

export const FUENTE_COLOR = { Operativa: '#2E9E5B', Retrasada: '#B85A0E', 'Con errores': '#C62828', Inactiva: '#8394A8' };

/** Navegación: cada ítem se muestra si el usuario tiene alguno de los permisos. */
export const NAV = [
  { label: 'OPERACIÓN', items: [
    { to: '/tablero', label: 'Tablero de situación', icon: 'space_dashboard', perms: ['tablero.ver'] },
    { to: '/alertas', label: 'Alertas tempranas', icon: 'campaign', perms: ['alertas.ver'], badge: 'alertas' },
    { to: '/eventos', label: 'Eventos y decisión', icon: 'emergency_home', perms: ['eventos.ver'] },
    { to: '/ciudadanos', label: 'Reportes ciudadanos', icon: 'record_voice_over', perms: ['ciudadanos.ver'], badge: 'ciudadanos' },
    { to: '/coordinacion', label: 'Coordinación', icon: 'groups', perms: ['coordinacion.ver'], badge: 'coordinacion' }
  ] },
  { label: 'ANÁLISIS', items: [
    { to: '/fuentes', label: 'Fuentes de datos', icon: 'database', perms: ['fuentes.ver'] },
    { to: '/modelos', label: 'Modelos IA', icon: 'neurology', perms: ['modelos.ver'] },
    { to: '/reportes', label: 'Reportes', icon: 'monitoring', perms: ['reportes.ver'] }
  ] },
  { label: 'SISTEMA', items: [
    { to: '/admin', label: 'Administración', icon: 'admin_panel_settings', perms: ['admin.usuarios', 'admin.roles', 'bitacora.ver'] }
  ] }
];

export const DEPARTAMENTOS = ['Beni', 'Chuquisaca', 'Cochabamba', 'La Paz', 'Oruro', 'Pando', 'Potosí', 'Santa Cruz', 'Tarija'];
