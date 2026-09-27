import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { Header } from '../../../components/Header';
import LeafletMap from '../../../components/LeafletMap';
import { api } from '../../../lib/api';
import { C, LV } from '../../../lib/theme';

/** Mapa de alertas vigentes (OpenStreetMap) con la posición del enlace. */
export default function Mapa() {
  const [alertas, setAlertas] = useState([]);
  const [me, setMe] = useState(null);

  useFocusEffect(useCallback(() => {
    api('/alertas/recibidas').then(setAlertas).catch(() => {});
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const l = await Location.getLastKnownPositionAsync().catch(() => null) || await Location.getCurrentPositionAsync({}).catch(() => null);
        if (l) setMe([l.coords.latitude, l.coords.longitude]);
      }
    })();
  }, []));

  const markers = alertas.filter((a) => a.lat).map((a) => ({
    kind: 'alert', lat: Number(a.lat), lng: Number(a.lng), color: LV[a.nivel].bg, r: a.nivel === 'roja' ? 13 : 10,
    label: `${a.amenaza} · ${a.lugar}`, sub: `${a.codigo} · ${LV[a.nivel].label}`
  }));

  return (
    <View style={{ flex: 1, backgroundColor: C.fondo }}>
      <Header title="Mapa de situación" subtitle="Leaflet · OpenStreetMap" />
      <LeafletMap markers={markers} me={me} height={undefined} style={{ flex: 1 }} zoom={6} />
      <View style={{ flexDirection: 'row', gap: 12, padding: 10, backgroundColor: C.blanco, justifyContent: 'center' }}>
        {['amarilla', 'naranja', 'roja'].map((l) => (
          <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: LV[l].bg }} />
            <Text style={{ fontSize: 12 }}>{l[0].toUpperCase() + l.slice(1)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
