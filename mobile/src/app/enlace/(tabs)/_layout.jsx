import { useEffect } from 'react';
import { Vibration } from 'react-native';
import { Tabs } from 'expo-router/js-tabs';
import { Icon } from '../../../components/ui';
import { getSocket } from '../../../lib/socket';
import { C } from '../../../lib/theme';

/** App de enlace interinstitucional: tareas, alertas recibidas y mapa. */
export default function EnlaceTabs() {
  // Vibración al recibir una alerta o una tarea nueva para su institución.
  useEffect(() => {
    const s = getSocket();
    const buzz = () => Vibration.vibrate([0, 400, 200, 400]);
    s?.on('alerta:recibida', buzz);
    s?.on('tarea:nueva', buzz);
    return () => { s?.off('alerta:recibida', buzz); s?.off('tarea:nueva', buzz); };
  }, []);
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: C.azul600,
      tabBarInactiveTintColor: C.texto2,
      tabBarStyle: { height: 64, paddingBottom: 8, paddingTop: 6 },
      tabBarLabelStyle: { fontSize: 11, fontWeight: '700' }
    }}>
      <Tabs.Screen name="index" options={{ title: 'Tareas', tabBarIcon: ({ color }) => <Icon name="checklist" color={color} size={24} /> }} />
      <Tabs.Screen name="alertas" options={{ title: 'Alertas', tabBarIcon: ({ color }) => <Icon name="campaign" color={color} size={24} /> }} />
      <Tabs.Screen name="mapa" options={{ title: 'Mapa', tabBarIcon: ({ color }) => <Icon name="map" color={color} size={24} /> }} />
    </Tabs>
  );
}
