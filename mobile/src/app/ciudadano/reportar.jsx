import { useEffect, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from '../../components/Header';
import LeafletMap from '../../components/LeafletMap';
import LocationPicker, { direccionDe } from '../../components/LocationPicker';
import { Btn, Icon, Note } from '../../components/ui';
import { sendOrQueue } from '../../lib/offlineQueue';
import { guardarMiReporte } from '../../lib/misReportes';
import { C } from '../../lib/theme';
import { alerta } from '../../lib/dialog';

const TIPOS = [
  { k: 'inundacion', label: 'Inundación', icon: 'flood', desc: 'El agua está entrando a las casas y sigue subiendo.' },
  { k: 'incendio', label: 'Incendio', icon: 'local-fire-department', desc: 'Hay fuego cerca de las casas.' },
  { k: 'deslizamiento', label: 'Deslizamiento', icon: 'landslide', desc: 'Se cayó parte del cerro sobre la calle.' },
  { k: 'tormenta', label: 'Tormenta / granizo', icon: 'thunderstorm', desc: 'El viento o el granizo dañó techos.' },
  { k: 'personas', label: 'Personas en peligro', icon: 'sos', desc: 'Hay personas atrapadas que necesitan ayuda.' },
  { k: 'otro', label: 'Otro', icon: 'more-horiz', desc: '' }
];

export default function Reportar() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [paso, setPaso] = useState(1);
  const [tipo, setTipo] = useState(null);
  const [fotos, setFotos] = useState([]);
  // Ubicación: la actual del teléfono (GPS) u otra marcada en el mapa (Manual)
  const [modo, setModo] = useState('gps');
  const [gpsPos, setGpsPos] = useState(null);
  const [gpsLugar, setGpsLugar] = useState('');
  const [manualPos, setManualPos] = useState(null);
  const [picker, setPicker] = useState(false);
  const [lugar, setLugar] = useState('');
  const [gpsErr, setGpsErr] = useState('');
  const pos = modo === 'gps' ? gpsPos : manualPos;
  const [riesgo, setRiesgo] = useState(null);
  const [desc, setDesc] = useState('');
  const [nombre, setNombre] = useState('');
  const [tel, setTel] = useState('');
  const [busy, setBusy] = useState(false);

  // GPS automático al entrar al paso 2
  useEffect(() => {
    if (paso !== 2 || gpsPos || gpsErr) return;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setGpsErr('Sin permiso de ubicación. Actívelo o marque el lugar en el mapa con "Otra ubicación".'); return; }
      try {
        const l = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        setGpsPos(l.coords);
        const dir = await direccionDe(l.coords);
        setGpsLugar(dir);
        setLugar((x) => x || dir);
      } catch {
        setGpsErr('No se pudo obtener la ubicación GPS. Salga a un lugar abierto o marque el lugar en el mapa.');
      }
    })();
  }, [paso, gpsPos, gpsErr]);

  const usarGps = () => { setModo('gps'); setLugar(gpsLugar); };
  const confirmarManual = async (c) => {
    setPicker(false);
    setManualPos(c);
    setModo('manual');
    setLugar(await direccionDe(c));
  };

  const agregarFoto = async (camara) => {
    if (fotos.length >= 3) return;
    // El selector de fotos del sistema no requiere permiso de galería; la cámara sí.
    if (camara) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return alerta('Permiso requerido', 'Autorice el acceso a la cámara para tomar fotos.');
    }
    const opts = { mediaTypes: ['images'], quality: 0.8, exif: false };
    try {
      const r = camara ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync({ ...opts, allowsMultipleSelection: true, selectionLimit: 3 - fotos.length });
      if (!r.canceled) setFotos((f) => [...f, ...r.assets].slice(0, 3));
    } catch (e) {
      alerta('No se pudo abrir', e.message);
    }
  };

  const enviar = async () => {
    if (!pos) return alerta('Ubicación requerida', modo === 'gps' ? 'Espere a que el GPS obtenga su ubicación o marque el lugar en el mapa.' : 'Marque el lugar de la emergencia en el mapa.');
    setBusy(true);
    try {
      const fields = {
        tipo: tipo.k, descripcion: desc || tipo.desc, lat: pos.latitude, lng: pos.longitude,
        precision_m: modo === 'gps' ? Math.round(pos.accuracy || 0) : undefined, ubicacion_origen: modo === 'gps' ? 'GPS' : 'Manual',
        personas_riesgo: riesgo ? 'true' : 'false', lugar, reportante: nombre, telefono: tel
      };
      const r = await sendOrQueue({ path: '/publico/reportes', fields, photos: fotos, auth: false, label: tipo.label, kind: 'reporte' });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (r.sent) {
        await guardarMiReporte({ ...r.data, titulo: tipo.label });
        router.replace({ pathname: '/ciudadano/seguimiento', params: { codigo: r.data.codigo } });
      } else {
        alerta('Sin señal', `Su reporte se guardó en el teléfono y se enviará automáticamente al recuperar la conexión. Si hay riesgo para la vida, llame al 110.${r.detalle ? `\n\nDetalle técnico: ${r.detalle}` : ''}`);
        router.replace('/');
      }
    } catch (e) {
      alerta('No se pudo enviar', e.message);
    } finally {
      setBusy(false);
    }
  };

  if (paso === 1) {
    return (
      <View style={{ flex: 1, backgroundColor: C.blanco }}>
        <Header title="Reporte ciudadano" subtitle="SADE-IA · Defensa Civil" onBack={() => router.back()} bg={C.azul600} />
        <ScrollView contentContainerStyle={{ padding: 18, gap: 14, paddingBottom: insets.bottom + 20 }}>
          <Text style={{ fontSize: 20, fontWeight: '700' }}>¿Qué está pasando?</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {TIPOS.map((t) => (
              <Pressable key={t.k} onPress={() => { setTipo(t); setPaso(2); }} style={{ width: '48%', height: 96, borderRadius: 12, borderWidth: 1, borderColor: C.borde, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.blanco }}>
                <Icon name={t.icon} size={32} color={C.azul700} />
                <Text style={{ fontSize: 14, fontWeight: '600', textAlign: 'center' }}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
          <Note tone="info" icon="info">Su reporte llega al COEN con fotos, ubicación GPS y sus datos. Un operador lo verificará y despachará al equipo más cercano.</Note>
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.blanco }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title="Detalles del reporte" subtitle={tipo.label} onBack={() => setPaso(1)} bg={C.blanco} fg={C.tinta} logo={false}
        right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 28, borderRadius: 999, backgroundColor: C.azul100 }}><Icon name={tipo.icon} size={16} color={C.azul800} /><Text style={{ fontSize: 12, fontWeight: '700', color: C.azul800 }}>{tipo.label}</Text></View>} />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 16, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '600' }}>Fotos ({fotos.length}/3) · opcional</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {[['Tomar foto', 'photo-camera', true], ['Elegir del álbum', 'photo-library', false]].map(([l, ic, cam]) => (
              <Pressable key={l} disabled={fotos.length >= 3} onPress={() => agregarFoto(cam)} accessibilityRole="button"
                style={({ pressed }) => ({ flex: 1, height: 84, borderRadius: 12, borderWidth: 1.5, borderColor: C.azul600, backgroundColor: pressed ? C.azul100 : C.azul50, alignItems: 'center', justifyContent: 'center', gap: 4, opacity: fotos.length >= 3 ? 0.45 : 1 })}>
                <Icon name={ic} size={30} color={C.azul700} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.azul800 }}>{l}</Text>
              </Pressable>
            ))}
          </View>
          {fotos.length > 0 && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {fotos.map((f, i) => (
                <View key={f.uri} style={{ width: 88, height: 88, borderRadius: 8, overflow: 'hidden', backgroundColor: C.azul50 }}>
                  <Image source={{ uri: f.uri }} style={{ width: '100%', height: '100%' }} />
                  <Pressable onPress={() => setFotos(fotos.filter((_, j) => j !== i))} hitSlop={8} accessibilityLabel={`Quitar foto ${i + 1}`}
                    style={{ position: 'absolute', top: 4, right: 4, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(7,26,51,0.75)', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="close" size={16} color={C.blanco} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '600' }}>¿Dónde es la emergencia?</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[['gps', 'Mi ubicación actual', 'my-location'], ['manual', 'Otra ubicación', 'edit-location-alt']].map(([k, l, ic]) => {
              const on = modo === k;
              return (
                <Pressable key={k} onPress={() => (k === 'gps' ? usarGps() : setPicker(true))} accessibilityRole="radio" accessibilityState={{ selected: on }}
                  style={{ flex: 1, minHeight: 52, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8, backgroundColor: on ? C.azul900 : C.blanco, borderWidth: 1, borderColor: on ? C.azul900 : C.borde }}>
                  <Icon name={ic} size={20} color={on ? C.blanco : C.azul700} />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: on ? C.blanco : C.tinta, flexShrink: 1 }}>{l}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{ borderWidth: 1, borderColor: C.borde, borderRadius: 10, overflow: 'hidden' }}>
            {pos ? <LeafletMap center={[pos.latitude, pos.longitude]} height={140} zoom={16} /> : (
              <View style={{ minHeight: 60, alignItems: 'center', justifyContent: 'center', padding: 12 }}>
                <Text style={{ color: C.texto2, textAlign: 'center' }}>{modo === 'gps' ? (gpsErr || 'Obteniendo ubicación GPS…') : 'Toque "Otra ubicación" para marcar el lugar en el mapa.'}</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10 }}>
              <Icon name={modo === 'gps' ? 'my-location' : 'place'} size={18} color={pos ? C.verde : C.texto3} />
              <TextInput style={{ flex: 1, fontSize: 13, color: C.tinta, padding: 0 }} value={lugar} onChangeText={setLugar} placeholder="Referencia (calle, barrio)" />
              {pos && modo === 'gps' && <Text style={{ fontFamily: 'monospace', fontSize: 11, color: C.texto2 }}>± {Math.round(pos.accuracy || 0)} m</Text>}
            </View>
          </View>
          {modo === 'manual' && manualPos && <Btn variant="outline" title="Cambiar punto en el mapa" icon="edit-location-alt" onPress={() => setPicker(true)} />}
          {modo === 'gps' && gpsErr ? <Btn variant="outline" title="Reintentar GPS" icon="my-location" onPress={() => { setGpsErr(''); setGpsPos(null); }} /> : null}
        </View>
        <LocationPicker visible={picker} initial={manualPos || gpsPos} onClose={() => setPicker(false)} onConfirm={confirmarManual} />

        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 13, fontWeight: '600' }}>¿Hay personas en peligro?</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[['Sí', true], ['No', false]].map(([l, v]) => (
              <Pressable key={l} onPress={() => setRiesgo(v)} style={{ flex: 1, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: riesgo === v ? C.azul900 : C.blanco, borderWidth: 1, borderColor: riesgo === v ? C.azul900 : C.borde }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: riesgo === v ? C.blanco : C.tinta }}>{l}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 13, fontWeight: '600' }}>Describa lo que ocurre</Text>
          <TextInput multiline value={desc} onChangeText={setDesc} placeholder={tipo.desc || 'Describa lo que está pasando'} style={{ minHeight: 72, borderWidth: 1, borderColor: C.borde, borderRadius: 10, padding: 12, fontSize: 15, textAlignVertical: 'top', color: C.tinta }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput value={nombre} onChangeText={setNombre} placeholder="Su nombre (opcional)" style={{ flex: 1, height: 48, borderWidth: 1, borderColor: C.borde, borderRadius: 10, paddingHorizontal: 12, color: C.tinta }} />
          <TextInput value={tel} onChangeText={setTel} placeholder="Teléfono" keyboardType="phone-pad" style={{ flex: 1, height: 48, borderWidth: 1, borderColor: C.borde, borderRadius: 10, paddingHorizontal: 12, color: C.tinta }} />
        </View>
        <Btn big title="Enviar reporte" icon="send" loading={busy} disabled={!pos || riesgo === null} onPress={enviar} />
        {riesgo === null && <Text style={{ fontSize: 12, color: C.texto2, textAlign: 'center' }}>Indique si hay personas en peligro para enviar.</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
