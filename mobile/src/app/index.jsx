import { useCallback, useState } from 'react';
import { Image, Linking, ScrollView, Text, View } from 'react-native';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { useAuth, homeFor } from '../lib/auth';
import { Btn, Icon, LevelBadge, Card } from '../components/ui';
import { C } from '../lib/theme';

/** Pantalla de inicio: App ciudadana (sin sesión) o acceso institucional. */
export default function Home() {
  const { user, ready } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [alertas, setAlertas] = useState([]);

  useFocusEffect(useCallback(() => {
    api('/publico/alertas', { auth: false }).then(setAlertas).catch(() => {});
  }, []));

  if (!ready) return null;
  if (user) return <Redirect href={homeFor(user)} />;
  const top = alertas.filter((a) => ['roja', 'naranja'].includes(a.nivel)).slice(0, 2);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.fondo }} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
      <View style={{ backgroundColor: C.azul600, paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 22, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 48, height: 48, borderRadius: 11, backgroundColor: C.blanco, alignItems: 'center', justifyContent: 'center' }}>
            <Image source={require('../../assets/buho.png')} style={{ width: 36, height: 36 }} resizeMode="contain" />
          </View>
          <View>
            <Text style={{ color: C.blanco, fontSize: 22, fontWeight: '800', letterSpacing: 0.5 }}>SADE-IA</Text>
            <Text style={{ color: C.azul100, fontSize: 12 }}>Sistema de Apoyo a la Decisión para Emergencias</Text>
          </View>
        </View>
        {top.map((a) => (
          <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 8, backgroundColor: a.nivel === 'roja' ? C.rojo : '#E8661A' }}>
            <Icon name="crisis-alert" color={C.blanco} size={20} />
            <Text style={{ color: C.blanco, fontSize: 13, fontWeight: '600', flex: 1 }}>Alerta {a.nivel.toUpperCase()} por {a.amenaza.toLowerCase()} en {a.lugar}</Text>
          </View>
        ))}
      </View>

      <View style={{ padding: 18, gap: 14 }}>
        <Text style={{ fontSize: 20, fontWeight: '700', color: C.tinta }}>¿Está ocurriendo una emergencia?</Text>
        <Btn big title="Reportar una emergencia" icon="sos" onPress={() => router.push('/ciudadano/reportar')} />
        <Btn title="Seguimiento de mis reportes" icon="pending-actions" variant="outline" onPress={() => router.push('/ciudadano/seguimiento')} />
        <Btn title="Llamar a emergencias (110 / 119)" icon="call" variant="danger" onPress={() => Linking.openURL('tel:110')} />

        {alertas.length > 0 && (
          <Card>
            <Text style={{ fontSize: 15, fontWeight: '700' }}>Alertas vigentes</Text>
            {alertas.map((a) => (
              <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
                <Icon name={a.icono} color={C.azul700} />
                <Text style={{ flex: 1, fontSize: 14 }}>{a.amenaza} · {a.lugar}</Text>
                <LevelBadge nivel={a.nivel} />
              </View>
            ))}
          </Card>
        )}

        <View style={{ height: 1, backgroundColor: C.borde, marginVertical: 6 }} />
        <Text style={{ fontSize: 13, color: C.texto2 }}>Personal institucional (enlaces y equipos de primera respuesta)</Text>
        <Btn title="Iniciar sesión institucional" icon="badge" variant="dark" onPress={() => router.push('/login')} />
      </View>
    </ScrollView>
  );
}
