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
  Modificada: { bg: '#FEF3E7', fg: '#B85A0E' },
  // Despachos, unidades y recursos de primera respuesta
  Despachado: { bg: '#FDECEC', fg: '#C62828' },
  Aceptada: { bg: '#E3EFFA', fg: '#0F559C' },
  'En sitio': { bg: '#FEF3E7', fg: '#B85A0E' },
  Controlada: { bg: '#E4F4EA', fg: '#1E6B3E' },
  Rechazada: { bg: '#EEF3F8', fg: '#4A5A6E' },
  Disponible: { bg: '#E4F4EA', fg: '#1E6B3E' },
  'En misión': { bg: '#FEF3E7', fg: '#B85A0E' },
  'Fuera de servicio': { bg: '#EEF3F8', fg: '#4A5A6E' },
  Operativo: { bg: '#E4F4EA', fg: '#1E6B3E' },
  'En mantenimiento': { bg: '#FEF3E7', fg: '#B85A0E' },
  'De baja': { bg: '#EEF3F8', fg: '#4A5A6E' },
  Activa: { bg: '#E4F4EA', fg: '#1E6B3E' },
  Inactiva: { bg: '#EEF3F8', fg: '#4A5A6E' }
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
  { label: 'PRIMERA RESPUESTA', items: [
    { to: '/respuesta/emergencias', label: 'Emergencias despachadas', icon: 'e911_emergency', perms: ['respuesta.ver'], badge: 'respuesta' },
    { to: '/respuesta/unidades', label: 'Unidades de respuesta', icon: 'emergency_share', perms: ['respuesta.ver'] },
    { to: '/respuesta/usuarios', label: 'Personal', icon: 'badge', perms: ['respuesta.usuarios'] },
    { to: '/respuesta/vehiculos', label: 'Vehículos de emergencia', icon: 'fire_truck', perms: ['respuesta.ver'] },
    { to: '/respuesta/equipamiento', label: 'Equipamiento', icon: 'construction', perms: ['respuesta.ver'] },
    { to: '/respuesta/especialidades', label: 'Especialidades', icon: 'workspace_premium', perms: ['respuesta.ver'] }
  ] },
  { label: 'ANÁLISIS', items: [
    { to: '/fuentes', label: 'Fuentes de datos', icon: 'database', perms: ['fuentes.ver'] },
    { to: '/modelos', label: 'Modelos IA', icon: 'neurology', perms: ['modelos.ver'] },
    { to: '/reportes', label: 'Reportes', icon: 'monitoring', perms: ['reportes.ver'] }
  ] },
  { label: 'SISTEMA', items: [
    { to: '/admin', label: 'Administración', icon: 'admin_panel_settings', perms: ['admin.usuarios', 'admin.roles', 'admin.instituciones', 'bitacora.ver'] }
  ] }
];

/** Página de inicio según el rol: los equipos de primera respuesta llegan a sus emergencias. */
export const homeFor = (can) => (can('respuesta.ver') && !can('alertas.ver') ? '/respuesta/emergencias' : '/tablero');

export const TIPOS_INSTITUCION = ['Primera respuesta', 'Nacional', 'Departamental', 'Municipal', 'Técnica', 'Otra'];

/** Íconos de institución (Material Symbols) agrupados por clase; se muestran en el mapa. */
export const ICONOS_INSTITUCION = [
  { icono: 'local_fire_department', label: 'Bomberos', tipo: 'Primera respuesta' },
  { icono: 'fire_truck', label: 'Compañía de bomberos', tipo: 'Primera respuesta' },
  { icono: 'health_and_safety', label: 'Búsqueda y rescate', tipo: 'Primera respuesta' },
  { icono: 'emergency', label: 'Cruz Roja / socorro', tipo: 'Primera respuesta' },
  { icono: 'ambulance', label: 'Ambulancias', tipo: 'Primera respuesta' },
  { icono: 'local_hospital', label: 'Hospital / salud', tipo: 'Primera respuesta' },
  { icono: 'local_police', label: 'Policía', tipo: 'Primera respuesta' },
  { icono: 'scuba_diving', label: 'Rescate acuático', tipo: 'Primera respuesta' },
  { icono: 'forest', label: 'Guardaparques / forestal', tipo: 'Primera respuesta' },
  { icono: 'military_tech', label: 'Fuerzas Armadas', tipo: 'Nacional' },
  { icono: 'shield', label: 'Defensa civil', tipo: 'Nacional' },
  { icono: 'hub', label: 'Centro de operaciones', tipo: 'Nacional' },
  { icono: 'account_balance', label: 'Gobernación', tipo: 'Departamental' },
  { icono: 'location_city', label: 'Municipio', tipo: 'Municipal' },
  { icono: 'engineering', label: 'Obras / brigada técnica', tipo: 'Municipal' },
  { icono: 'thermostat', label: 'Meteorología', tipo: 'Técnica' },
  { icono: 'earthquake', label: 'Sismología', tipo: 'Técnica' },
  { icono: 'sailing', label: 'Hidrografía / naval', tipo: 'Técnica' },
  { icono: 'satellite_alt', label: 'Satelital', tipo: 'Técnica' },
  { icono: 'volunteer_activism', label: 'Voluntariado / ONG', tipo: 'Otra' },
  { icono: 'factory', label: 'Empresa / industria', tipo: 'Otra' },
  { icono: 'apartment', label: 'Otra institución', tipo: 'Otra' }
];

export const ICONOS_ESPECIALIDAD = [
  { icono: 'local_fire_department', label: 'Incendios' },
  { icono: 'pool', label: 'Acuático' },
  { icono: 'flood', label: 'Inundaciones' },
  { icono: 'landslide', label: 'Deslizamientos' },
  { icono: 'science', label: 'Mat. peligrosos' },
  { icono: 'medical_services', label: 'Prehospitalaria' },
  { icono: 'hiking', label: 'Montaña / altura' },
  { icono: 'car_crash', label: 'Vehicular' },
  { icono: 'domain_disabled', label: 'Estructuras colapsadas' },
  { icono: 'pets', label: 'Canes / K9' },
  { icono: 'cell_tower', label: 'Comunicaciones' },
  { icono: 'workspace_premium', label: 'Otra' }
];

export const TIPOS_VEHICULO = ['Autobomba', 'Cisterna', 'Escalera mecánica', 'Ambulancia', 'Camioneta de rescate', 'Unidad de materiales peligrosos', 'Bote de rescate', 'Motocicleta', 'Camión de transporte', 'Helicóptero', 'Dron', 'Otro'];

export const CATEGORIAS_EQUIPAMIENTO = ['Extinción', 'Rescate vehicular', 'Rescate en altura', 'Rescate acuático', 'Atención prehospitalaria', 'Protección personal', 'Materiales peligrosos', 'Comunicaciones', 'Iluminación y energía', 'Herramientas', 'Otro'];

export const DEPARTAMENTOS = ['Beni', 'Chuquisaca', 'Cochabamba', 'La Paz', 'Oruro', 'Pando', 'Potosí', 'Santa Cruz', 'Tarija'];
