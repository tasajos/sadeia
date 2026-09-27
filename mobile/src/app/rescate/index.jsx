import { useCallback, useEffect, useState } from 'react';
import { Image, Linking, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from '../../components/Header';
import { SesionActions } from '../../components/SesionActions';
import LeafletMap from '../../components/LeafletMap';
import { Btn, Card, Empty, Icon, Note } from '../../components/ui';
import { api, mediaUrl } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { getSocket } from '../../lib/socket';
import { alarmaMision } from '../../lib/alarm';
import { fTime } from '../../lib/format';
import { C, PR } from '../../lib/theme';
import { alerta } from '../../lib/dialog';

const PASOS = [['Misión asignada', 'fecha_despacho'], ['En camino', 'fecha_aceptacion'], ['En sitio', 'fecha_llegada'], ['Situación controlada', 'fecha_control']];
const IDX = { Despachado: 0, Aceptada: 1, 'En sitio': 2, Controlada: 3 };

/** App del equipo de primera respuesta: recepción de misión, ruta, estados e informe en sitio. */
export default function Rescate() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState(null);
  const [me, setMe] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(false);
  const [tareas, setTareas] = useState(null); // tareas del COEN / VIDECI para la institución

  const cargar = useCallback(async () => {
    try {
      const d = await api('/misiones/actual');
      if (d.mision?.estado === 'Despachado') {
        // Alarma (modal + sirena): cubre misiones que no llegaron por socket
        const rep = d.mision.reporte;
        alarmaMision({
          despacho_id: d.mision.id, reporte: rep.codigo, prioridad: rep.prioridad, titulo: rep.titulo, lugar: rep.lugar,
          eta_min: d.mision.eta_min, distancia_km: d.mision.distancia_km, personas_riesgo: !!rep.personas_riesgo
        });
      }
      setData(d);
      api('/respuesta/tareas').then((ts) => setTareas(ts.filter((t) => t.estado !== 'Completada' && t.evento_estado === 'En curso'))).catch(() => {});
    } catch (e) {
      alerta('Error', e.message);
    }
  }, []);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));
  useEffect(() => {
    const s = getSocket();
    s?.on('mision:nueva', cargar);
    s?.on('tarea:nueva', cargar);
    s?.on('tarea:actualizada', cargar);
    const poll = setInterval(cargar, 30000);
    return () => { s?.off('mision:nueva', cargar); s?.off('tarea:nueva', cargar); s?.off('tarea:actualizada', cargar); clearInterval(poll); };
  }, [cargar]);

  // Posición GPS del equipo al COEN mientras hay misión activa (cada 30 s).
  const activa = data?.mision && ['Aceptada', 'En sitio'].includes(data.mision.estado);
  useEffect(() => {
    let sub = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const l = await Location.getCurrentPositionAsync({}).catch(() => null);
      if (l) setMe([l.coords.latitude, l.coords.longitude]);
      if (!activa) return;
      sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 30000, distanceInterval: 50 }, (p) => {
        setMe([p.coords.latitude, p.coords.longitude]);
        api('/misiones/ubicacion', { method: 'PUT', body: { lat: p.coords.latitude, lng: p.coords.longitude } }).catch(() => {});
      });
    })();
    return () => sub?.remove();
  }, [activa]);

  const accion = async (path, msg) => {
    setBusy(true);
    try {
      await api(`/misiones/${data.mision.id}/${path}`, { method: 'POST' });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (msg) alerta('SADE-IA', msg);
      await cargar();
    } catch (e) {
      alerta('Error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const eq = data?.equipo;
  const m = data?.mision;
  const rep = m?.reporte;
  const pr = rep ? PR[rep.prioridad] : null;
  const step = m ? IDX[m.estado] : -1;
  const nTareas = tareas?.length || 0;
  const pendientesT = tareas?.filter((t) => t.estado === 'Pendiente' || t.estado === 'Vencida').length || 0;
  const salir = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
      <Pressable onPress={() => router.push('/rescate/tareas')} hitSlop={10} accessibilityLabel={`Tareas asignadas: ${nTareas}`}>
        <Icon name="assignment" color={C.blanco} />
        {pendientesT > 0 && <View style={{ position: 'absolute', top: -6, right: -8, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: C.naranja500, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 11, fontWeight: '800', color: C.azul900 }}>{pendientesT}</Text></View>}
      </Pressable>
      <SesionActions />
    </View>
  );

  if (!data) return <View style={{ flex: 1, backgroundColor: C.fondo }}><Header title="Primera respuesta" right={salir} /></View>;

  // ---------- Sin misión ----------
  if (!m) {
    return (
      <View style={{ flex: 1, backgroundColor: C.blanco }}>
        <Header title={`${eq.codigo} · ${eq.nombre}`} subtitle={`${user.nombre} · ${eq.tripulacion || ''}`} right={salir} />
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} refreshControl={<RefreshControl refreshing={refresh} onRefresh={async () => { setRefresh(true); await cargar(); setRefresh(false); }} />}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 10, backgroundColor: eq.estado === 'Disponible' ? C.okBg : C.naranja50 }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: eq.estado === 'Disponible' ? C.verde : C.naranja700 }} />
            <Text style={{ fontSize: 16, fontWeight: '700', color: eq.estado === 'Disponible' ? C.okFg : C.naranja700 }}>{eq.estado} · en base</Text>
          </View>
          <Empty icon="notifications-paused" title="Sin misiones asignadas" text="Cuando el COEN despache a esta unidad, la misión aparecerá aquí con alarma y vibración." />
          <Pressable onPress={() => router.push('/rescate/tareas')}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderColor: pendientesT ? C.naranja500 : C.borde, borderWidth: pendientesT ? 1.5 : 1 }}>
              <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: pendientesT ? C.naranja50 : C.azul50, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="assignment" size={24} color={pendientesT ? C.naranja700 : C.azul700} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700' }}>Tareas de mi institución</Text>
                <Text style={{ fontSize: 13, color: C.texto2 }}>{tareas === null ? 'Cargando…' : nTareas ? `${nTareas} activa(s)${pendientesT ? ` · ${pendientesT} sin iniciar o vencida(s)` : ''}` : 'Sin tareas activas del COEN'}</Text>
              </View>
              <Icon name="chevron-right" color={C.texto3} />
            </Card>
          </Pressable>
          <Btn variant="outline" title="Ver historial de misiones" icon="history" onPress={() => router.push('/rescate/historial')} />
        </ScrollView>
      </View>
    );
  }

  // ---------- Nueva misión (pendiente de aceptar) ----------
  if (m.estado === 'Despachado') {
    return (
      <View style={{ flex: 1, backgroundColor: C.blanco }}>
        <View style={{ backgroundColor: pr.bg, paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 20, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="notifications-active" size={26} color={pr.fg} />
            <Text style={{ color: pr.fg, fontWeight: '800', letterSpacing: 1, fontSize: 13 }}>NUEVA MISIÓN · {rep.prioridad}</Text>
          </View>
          <Text style={{ color: pr.fg, fontSize: 22, fontWeight: '700' }}>{rep.titulo}</Text>
          <Text style={{ color: pr.fg, fontSize: 14 }}>{rep.lugar}</Text>
          <Text style={{ color: pr.fg, fontFamily: 'monospace', fontSize: 13 }}>{rep.codigo} · ETA {m.eta_min} min · {String(m.distancia_km).replace('.', ',')} km</Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 18, gap: 12, paddingBottom: insets.bottom + 20 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={{ flex: 1, height: 84, borderRadius: 8, backgroundColor: C.azul50, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                {rep.fotos[i] ? <Image source={{ uri: mediaUrl(rep.fotos[i]) }} style={{ width: '100%', height: '100%' }} /> : <Text style={{ color: C.texto3, fontSize: 12 }}>Sin foto</Text>}
              </View>
            ))}
          </View>
          {rep.personas_riesgo && <Note tone="err" icon="report">{rep.riesgo_detalle}</Note>}
          {rep.descripcion ? <Text style={{ fontSize: 15, lineHeight: 21 }}>“{rep.descripcion}”</Text> : null}
          <Text style={{ fontSize: 12, color: C.texto2 }}>Reporta: {rep.reportante} · {rep.telefono || 'sin teléfono'}</Text>
          <Text style={{ fontSize: 12, color: C.texto2 }}>Triaje IA: {rep.ia_tipo} · {rep.ia_nota}</Text>
          <Btn big title="Aceptar misión" loading={busy} onPress={() => accion('aceptar', 'Misión aceptada. El COEN y el reportante fueron notificados.')} />
          <Btn variant="ghost" title="No disponible" disabled={busy} onPress={() => alerta('Rechazar misión', '¿Confirma que la unidad no está disponible? El COEN reasignará la misión.', [{ text: 'Cancelar' }, { text: 'Confirmar', style: 'destructive', onPress: () => accion('rechazar') }])} />
        </ScrollView>
      </View>
    );
  }

  // ---------- En ruta / en sitio / controlada ----------
  return (
    <View style={{ flex: 1, backgroundColor: C.blanco }}>
      <Header title={m.estado === 'Aceptada' ? 'En ruta' : m.estado === 'En sitio' ? 'En sitio' : 'Misión controlada'} subtitle={`${rep.codigo} · ${rep.titulo}`} right={<Text style={{ color: C.naranja500, fontFamily: 'monospace', fontWeight: '600' }}>{m.estado === 'Aceptada' ? `ETA ${m.eta_min} min` : ''}</Text>} />
      <LeafletMap center={[Number(rep.lat), Number(rep.lng)]} me={me} markers={[{ kind: 'team-d', lat: me ? me[0] : Number(eq.lat), lng: me ? me[1] : Number(eq.lng), label: eq.codigo }]} height={280} />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 12, paddingBottom: insets.bottom + 20 }}>
        <Card style={{ gap: 4 }}>
          {PASOS.map(([label, campo], i) => (
            <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 34 }}>
              <View style={{ width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: i <= step ? C.azul600 : C.blanco, borderWidth: i <= step ? 0 : 2, borderColor: C.borde }}>
                {i <= step && <Icon name="check" size={14} color={C.blanco} />}
              </View>
              <Text style={{ flex: 1, fontSize: 14, fontWeight: i <= step ? '700' : '400', color: i <= step ? C.tinta : C.texto3 }}>{label}</Text>
              <Text style={{ fontFamily: 'monospace', fontSize: 12, color: C.texto2 }}>{i <= step ? fTime(m[campo]) : ''}</Text>
            </View>
          ))}
        </Card>
        <Btn variant="outline" icon="navigation" title="Abrir navegación (OpenStreetMap)" onPress={() => Linking.openURL(`https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${me ? `${me[0]},${me[1]}` : `${eq.lat},${eq.lng}`};${rep.lat},${rep.lng}`)} />
        {rep.telefono_completo ? <Btn variant="outline" icon="call" title="Llamar al reportante" onPress={() => Linking.openURL(`tel:${rep.telefono_completo}`)} /> : null}
        {m.estado === 'Aceptada' && <Btn big title="Llegué al sitio" loading={busy} onPress={() => accion('avanzar', 'Llegada al sitio registrada.')} />}
        {m.estado === 'En sitio' && <Btn big title="Situación controlada" loading={busy} onPress={() => accion('avanzar', 'Situación controlada. Reportante notificado.')} />}
        {['En sitio', 'Controlada'].includes(m.estado) && (
          <Btn big variant={m.estado === 'Controlada' ? 'primary' : 'dark'} icon="assignment" title="Informe en sitio" onPress={() => router.push({ pathname: '/rescate/informe', params: { id: String(m.id), codigo: rep.codigo } })} />
        )}
      </ScrollView>
    </View>
  );
}
