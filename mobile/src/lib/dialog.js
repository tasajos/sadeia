/**
 * Diálogos del sistema (reemplazan a Alert.alert): modal con el escudo de la EAEN que dibuja
 * <DialogHost /> en el layout raíz. Misma forma de uso que Alert.alert:
 *
 *   alerta('Título', 'Mensaje');
 *   alerta('Rechazar misión', '¿Confirma…?', [{ text: 'Cancelar' }, { text: 'Confirmar', style: 'destructive', onPress }]);
 */
let mostrar = null;
const pendientes = [];

export function registrarDialogo(fn) {
  mostrar = fn;
  while (pendientes.length) fn(pendientes.shift());
  return () => { if (mostrar === fn) mostrar = null; };
}

export function alerta(titulo, mensaje, botones) {
  const d = { titulo, mensaje, botones: botones?.length ? botones : [{ text: 'Entendido' }] };
  if (mostrar) mostrar(d);
  else pendientes.push(d);
}
