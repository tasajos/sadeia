import { useEffect, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from '../../../components/Header';
import { Btn, Chip, Icon, Note } from '../../../components/ui';
import { api } from '../../../lib/api';
import { sendOrQueue } from '../../../lib/offlineQueue';
import { fShort } from '../../../lib/format';
import { C } from '../../../lib/theme';
import { alerta } from '../../../lib/dialog';

/** Reporte de avance desde campo: %, observación, foto y GPS. Funciona sin señal (cola). */
export default function Tarea() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [t, setT] = useState(null);
  const [pct, setPct] = useState(null);
  const [obs, setObs] = useState('');
  const [foto, setFoto] = useState(null);
  const [gps, setGps] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/coordinacion/tareas/${id}`).then((x) => { setT(x); setPct(Math.min(100, Math.ceil((x.avance + 1) / 25) * 25)); }).catch((e) => alerta('Error', e.message));
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const l = await Location.getCurrentPositionAsync({}).catch(() => null);
        if (l) setGps(l.coords);
      }
    })();
  }, [id]);

  const tomarFoto = async () => {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) return;
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!r.canceled) setFoto(r.assets[0]);
  };

  const enviar = async () => {
    setBusy(true);
    try {
      const r = await sendOrQueue({
        path: `/coordinacion/tareas/${id}/avance`,
        fields: { avance: pct, observacion: obs, lat: gps?.latitude, lng: gps?.longitude },
        photos: foto ? [foto] : [],
        label: `${t.codigo} → ${pct} %`
      });
      alerta(r.sent ? 'Avance enviado' : 'Guardado sin señal', r.sent ? `Avance de ${t.codigo} (${pct} %) enviado al COEN.` : 'El reporte se guardó y se enviará automáticamente al reconectar.');
      router.back();
    } catch (e) {
      alerta('No se pudo enviar', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.blanco }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title="Reportar avance" onBack={() => router.back()} bg={C.blanco} fg={C.tinta} logo={false} />
      {!t ? <Text style={{ padding: 20, color: C.texto2 }}>Cargando…</Text> : (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 6 }}>
            <Text style={{ fontFamily: 'monospace', fontSize: 12, color: C.texto2 }}>{t.codigo} · {t.evento_codigo}</Text>
            <Text style={{ fontSize: 19, fontWeight: '700', lineHeight: 25 }}>{t.titulo}</Text>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Chip estado={t.estado} /><Text style={{ fontSize: 13, color: C.texto2 }}>Plazo {fShort(t.plazo)} · actual {t.avance} %</Text></View>
          </View>
          {t.estado === 'Completada' ? <Note tone="ok" icon="task-alt">Tarea completada.</Note> : (
            <>
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '600' }}>Avance</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {[25, 50, 75, 100].map((p) => (
                    <Pressable key={p} onPress={() => setPct(p)} style={{ flex: 1, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: pct === p ? C.azul900 : C.blanco, borderWidth: 1, borderColor: pct === p ? C.azul900 : C.borde }}>
                      <Text style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: '600', color: pct === p ? C.blanco : C.tinta }}>{p}%</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '600' }}>Observación</Text>
                <TextInput multiline value={obs} onChangeText={setObs} placeholder="340 familias evacuadas a U.E. Cristo Rey. Resta sector Pompeya." style={{ minHeight: 80, borderWidth: 1, borderColor: C.borde, borderRadius: 10, padding: 12, fontSize: 15, textAlignVertical: 'top', color: C.tinta }} />
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable onPress={tomarFoto} style={{ flex: 1, height: 48, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: C.azul200, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, overflow: 'hidden' }}>
                  {foto ? <Image source={{ uri: foto.uri }} style={{ width: '100%', height: '100%' }} /> : <><Icon name="photo-camera" color={C.azul700} size={20} /><Text style={{ color: C.azul700, fontWeight: '600' }}>Foto</Text></>}
                </Pressable>
                <View style={{ flex: 1, height: 48, borderRadius: 10, borderWidth: 1, borderColor: C.borde, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Icon name="my-location" size={20} color={gps ? C.verde : C.texto3} />
                  <Text style={{ color: gps ? C.verde : C.texto3, fontWeight: '600', fontSize: 13 }}>{gps ? 'GPS activo' : 'Sin GPS'}</Text>
                </View>
              </View>
              <Btn big title="Enviar reporte" icon="send" loading={busy} disabled={!pct} onPress={enviar} />
              <Text style={{ fontSize: 12, color: C.texto2, textAlign: 'center' }}>Sin señal: el reporte se guarda y se envía al reconectar.</Text>
            </>
          )}
          {t.avances?.length > 0 && (
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '700' }}>Historial</Text>
              {t.avances.map((a) => (
                <View key={a.id} style={{ flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: C.fondo, paddingBottom: 8, gap: 10 }}>
                  <View style={{ flex: 1 }}><Text style={{ fontWeight: '600' }}>{a.usuario}</Text><Text style={{ color: C.texto2, fontSize: 13 }}>{a.observacion || '—'}</Text></View>
                  <View style={{ alignItems: 'flex-end' }}><Text style={{ fontFamily: 'monospace' }}>{a.avance} %</Text><Text style={{ fontFamily: 'monospace', fontSize: 11, color: C.texto2 }}>{fShort(a.fecha)}</Text></View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}
