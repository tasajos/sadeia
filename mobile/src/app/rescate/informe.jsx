import { useState } from 'react';
import { Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from '../../components/Header';
import { Btn, Icon } from '../../components/ui';
import { sendOrQueue } from '../../lib/offlineQueue';
import { C } from '../../lib/theme';
import { alerta } from '../../lib/dialog';

const APOYOS = [['amb', 'Ambulancia', 'local-hospital'], ['bote', 'Bote adicional', 'sailing'], ['aereo', 'Apoyo aéreo', 'flight'], ['pol', 'Policía', 'local-police']];

/** Informe en sitio: contadores con botones de 48 px (uso con guantes), apoyo y fotos. */
export default function Informe() {
  const { id, codigo } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [cnt, setCnt] = useState({ rescatados: 0, heridos: 0, viviendas: 0 });
  const [apoyos, setApoyos] = useState([]);
  const [obs, setObs] = useState('');
  const [fotos, setFotos] = useState([]);
  const [busy, setBusy] = useState(false);

  const mod = (k, d) => setCnt({ ...cnt, [k]: Math.max(0, cnt[k] + d) });
  const foto = async () => {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) return;
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!r.canceled) setFotos([...fotos, r.assets[0]].slice(0, 6));
  };
  const enviar = async () => {
    setBusy(true);
    try {
      const r = await sendOrQueue({ path: `/misiones/${id}/informe`, fields: { ...cnt, apoyos, observacion: obs }, photos: fotos, label: `Informe ${codigo}` });
      alerta(r.sent ? 'Informe enviado al COEN' : 'Guardado sin señal', r.sent ? `${cnt.rescatados} personas rescatadas${apoyos.length ? `, ${apoyos.length} apoyo(s) solicitado(s)` : ''}.` : 'Se enviará automáticamente al reconectar.');
      router.back();
    } catch (e) {
      alerta('No se pudo enviar', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.blanco }}>
      <Header title="Informe en sitio" subtitle={codigo} onBack={() => router.back()} bg={C.blanco} fg={C.tinta} logo={false} />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        {[['rescatados', 'Personas rescatadas'], ['heridos', 'Heridos trasladados'], ['viviendas', 'Viviendas evacuadas']].map(([k, label]) => (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 15, fontWeight: '600', flex: 1 }}>{label}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Pressable onPress={() => mod(k, -1)} style={{ width: 48, height: 48, borderRadius: 10, borderWidth: 1, borderColor: C.borde, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 22, color: C.azul900 }}>−</Text></Pressable>
              <Text style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: '600', width: 40, textAlign: 'center' }}>{cnt[k]}</Text>
              <Pressable onPress={() => mod(k, 1)} style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: C.azul900, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 22, color: C.blanco }}>+</Text></Pressable>
            </View>
          </View>
        ))}
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '600' }}>Solicitar apoyo</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {APOYOS.map(([k, label, icon]) => {
              const on = apoyos.includes(k);
              return (
                <Pressable key={k} onPress={() => setApoyos(on ? apoyos.filter((x) => x !== k) : [...apoyos, k])} style={{ height: 44, paddingHorizontal: 14, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: on ? C.azul900 : C.blanco, borderWidth: 1, borderColor: on ? C.azul900 : C.borde }}>
                  <Icon name={icon} size={18} color={on ? C.blanco : C.tinta} />
                  <Text style={{ fontSize: 14, fontWeight: '600', color: on ? C.blanco : C.tinta }}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <TextInput multiline value={obs} onChangeText={setObs} placeholder="Observaciones del sitio" style={{ minHeight: 72, borderWidth: 1, borderColor: C.borde, borderRadius: 10, padding: 12, fontSize: 15, textAlignVertical: 'top', color: C.tinta }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {fotos.map((f, i) => <Image key={i} source={{ uri: f.uri }} style={{ width: 72, height: 72, borderRadius: 8 }} />)}
        </View>
        <Btn variant="dashed" icon="photo-camera" title="Adjuntar fotos del sitio" onPress={foto} />
        <Btn big title="Enviar informe al COEN" icon="send" loading={busy} onPress={enviar} />
      </ScrollView>
    </View>
  );
}
