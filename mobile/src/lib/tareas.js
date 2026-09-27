import { C } from './theme';

/** Utilidades compartidas de las tareas asignadas a la institución de primera respuesta. */
export const COLOR_TAREA = { Completada: C.verde, Vencida: C.rojo, 'En curso': C.azul600, Pendiente: C.naranja600 };
export const vencida = (t) => t.estado !== 'Completada' && new Date(t.plazo) < new Date();

export const TIPOS_RECURSO = {
  unidad: { label: 'Unidad', icon: 'emergency-share' },
  vehiculo: { label: 'Vehículo', icon: 'fire-truck' },
  equipamiento: { label: 'Equipo', icon: 'construction' },
  personal: { label: 'Personal', icon: 'badge' },
  material: { label: 'Material', icon: 'inventory-2' }
};
