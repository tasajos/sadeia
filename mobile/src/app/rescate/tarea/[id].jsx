import { useCallback, useEffect, useState } from 'react';
import { Image, KeyboardAvoidingView, Linking, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from '../../../components/Header';
import LeafletMap from '../../../components/LeafletMap';
import { Btn, Card, Chip, Icon, LevelBadge, Note, Progress } from '../../../components/ui';
import { api, mediaUrl } from '../../../lib/api';
import { getSocket } from '../../../lib/socket';
import { sendOrQueue } from '../../../lib/offlineQueue';
import { COLOR_TAREA, TIPOS_RECURSO, vencida } from '../../../lib/tareas';
import { fShort } from '../../../lib/format';
import { C, LV } from '../../../lib/theme';
import { alerta } from '../../../lib/dialog';

const input = { height: 48, borderWidth: 1, borderColor: C.borde, borderRadius: 10, paddingHorizontal: 12, fontSize: 15, color: C.tinta, backgroundColor: C.blanco };
const Titulo = ({ children }) => <Text style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: 1, color: C.azul700, fontWeight: '700' }}>{children}</Text>;

function Contador({ value, onChange, max = 99999 }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Pressable onPress={() => onChange(Math.max(1, value - 1))} style={s.step} accessibilityLabel="Menos"><Icon name="remove" color={C.azul700} /></Pressable>
      <TextInput value={String(value)} onChangeText={(v) => onChange(Math.max(1, Math.min(max, Number(v.replace(/\D/g, '')) || 1)))} keyboardType="number-pad"
        style={[input, { width: 72, textAlign: 'center', fontFamily: 'monospace', fontWeight: '700' }]} />
      <Pressable onPress={() => onChange(Math.min(max, value + 1))} style={s.step} accessibilityLabel="Más"><Icon name="add" color={C.azul700} /></Pressable>
    </View>
  );
}

/** Registro de avance: %, observación, foto (cámara o álbum) y GPS. Sin señal, se guarda y se envía al reconectar. */
function Avance({ t, onDone }) {
  const [pct, setPct] = useState(Math.min(100, Math.ceil((t.avance + 1) / 25) * 25));
  const [obs, setObs] = useState('');
  const [foto, setFoto] = useState(null);
  const [gps, setGps] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const l = await Location.getCurrentPositionAsync({}).catch(() => null);
      if (l) setGps(l.coords);
    })();
  }, []);

  const elegirFoto = async (camara) => {
    if (camara) {
      const p = await ImagePicker.requestCameraPermissionsAsync();
      if (!p.granted) return alerta('Permiso requerido', 'Autorice la cámara para tomar la foto.');
    }
    const opts = { mediaTypes: ['images'], quality: 0.8 };
    const r = camara ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (!r.canceled) setFoto(r.assets[0]);
  };

  const enviar = async () => {
    setBusy(true);
    try {
      const r = await sendOrQueue({
        path: `/respuesta/tareas/${t.id}/avance`,
        fields: { avance: pct, observacion: obs, lat: gps?.latitude, lng: gps?.longitude },
        photos: foto ? [foto] : [],
        label: `${t.codigo} → ${pct} %`
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      alerta(r.sent ? 'Avance enviado' : 'Guardado sin señal', r.sent
        ? (pct >= 100 ? `Tarea ${t.codigo} completada. Los recursos movilizados quedaron disponibles.` : `Avance de ${t.codigo} (${pct} %) enviado al COEN.`)
        : 'El reporte se guardó en el teléfono y se enviará automáticamente al reconectar.');
      setObs('');
      setFoto(null);
      onDone();
    } catch (e) {
      alerta('No se pudo enviar', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[25, 50, 75, 100].map((p) => (
          <Pressable key={p} onPress={() => setPct(p)} style={[s.opt, pct === p && s.optOn]}>
            <Text style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: '700', color: pct === p ? C.blanco : C.tinta }}>{p === 100 ? '✓ 100' : p}%</Text>
          </Pressable>
        ))}
      </View>
      <TextInput multiline value={obs} onChangeText={setObs} placeholder="Qué se hizo en terreno: 2 motobombas instaladas, 40 familias evacuadas…"
        style={[input, { height: undefined, minHeight: 84, paddingTop: 12, textAlignVertical: 'top' }]} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {foto ? (
          <View style={{ flex: 1, height: 84, borderRadius: 10, overflow: 'hidden' }}>
            <Image source={{ uri: foto.uri }} style={{ width: '100%', height: '100%' }} />
            <Pressable onPress={() => setFoto(null)} hitSlop={8} style={s.quitar} accessibilityLabel="Quitar foto"><Icon name="close" size={16} color={C.blanco} /></Pressable>
          </View>
        ) : [['Tomar foto', 'photo-camera', true], ['Del álbum', 'photo-library', false]].map(([l, ic, cam]) => (
          <Pressable key={l} onPress={() => elegirFoto(cam)} style={s.fotoBtn}>
            <Icon name={ic} size={26} color={C.azul700} /><Text style={{ fontSize: 13, fontWeight: '700', color: C.azul800 }}>{l}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name="my-location" size={16} color={gps ? C.verde : C.texto3} />
        <Text style={{ fontSize: 12, color: gps ? C.verde : C.texto3 }}>{gps ? 'Se adjunta su ubicación GPS' : 'Sin GPS'}</Text>
      </View>
      <Btn big title="Enviar avance" icon="send" loading={busy} onPress={enviar} />
    </View>
  );
}

/** Movilizar unidades, vehículos, equipamiento, personal o material propio a la tarea. */
function Movilizar({ t, onDone }) {
  const [tipo, setTipo] = useState('unidad');
  const [ref, setRef] = useState(null);
  const [cant, setCant] = useState(1);
  const [desc, setDesc] = useState('');
  const [unidad, setUnidad] = useState('');
  const [busy, setBusy] = useState(false);
  const ops = t.disponibles[tipo] || [];
  const sel = ops.find((o) => o.id === ref);
  const valido = tipo === 'material' ? desc.trim().length > 0 : !!sel;

  const enviar = async () => {
    setBusy(true);
    try {
      await api(`/respuesta/tareas/${t.id}/recursos`, {
        method: 'POST',
        body: tipo === 'material' ? { tipo, descripcion: desc, cantidad: cant, unidad } : { tipo, ref_id: ref, cantidad: cant }
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setRef(null); setCant(1); setDesc(''); setUnidad('');
      onDone();
    } catch (e) {
      alerta(e.network ? 'Sin conexión' : 'No se pudo movilizar', e.network ? 'Movilizar recursos requiere señal. Intente de nuevo al reconectar.' : e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 10 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {Object.entries(TIPOS_RECURSO).map(([k, v]) => (
          <Pressable key={k} onPress={() => { setTipo(k); setRef(null); setCant(1); }} style={[s.tipo, tipo === k && s.optOn]}>
            <Icon name={v.icon} size={18} color={tipo === k ? C.blanco : C.azul700} />
            <Text style={{ fontWeight: '700', fontSize: 13, color: tipo === k ? C.blanco : C.tinta }}>{v.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {tipo === 'material' ? (
        <View style={{ gap: 8 }}>
          <TextInput value={desc} onChangeText={setDesc} placeholder="Agua para extinción, sacos de arena, raciones…" maxLength={150} style={input} />
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Contador value={cant} onChange={setCant} />
            <TextInput value={unidad} onChangeText={setUnidad} placeholder="litros, sacos…" maxLength={30} style={[input, { flex: 1 }]} />
          </View>
        </View>
      ) : !ops.length ? (
        <Note tone="info" icon="info">Su institución no tiene recursos de este tipo registrados. Se registran desde el sistema web (Primera respuesta).</Note>
      ) : (
        <View style={{ gap: 6 }}>
          {ops.map((o) => {
            const agotado = tipo === 'equipamiento' ? o.disponible < 1 : !!o.ocupado;
            const on = ref === o.id;
            return (
              <Pressable key={o.id} disabled={agotado} onPress={() => { setRef(o.id); setCant(1); }}
                style={[s.opcion, on && { borderColor: C.azul600, backgroundColor: C.azul50 }, agotado && { opacity: 0.45 }]}>
                <Icon name={on ? 'radio-button-checked' : 'radio-button-unchecked'} size={20} color={on ? C.azul600 : C.texto3} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600' }}>{o.label}</Text>
                  <Text style={{ fontSize: 12, color: C.texto2 }}>
                    {tipo === 'equipamiento' ? `${o.disponible} de ${o.total} ${o.unidad} disponibles` : o.ocupado ? (/^T-/.test(o.ocupado) ? `Movilizado en ${o.ocupado}` : o.ocupado) : 'Disponible'}
                  </Text>
                </View>
              </Pressable>
            );
          })}
          {tipo === 'equipamiento' && sel && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 13, color: C.texto2 }}>Cantidad (máx. {sel.disponible})</Text>
              <Contador value={cant} onChange={setCant} max={sel.disponible} />
            </View>
          )}
        </View>
      )}
      <Btn title="Movilizar a la tarea" icon="add-task" loading={busy} disabled={!valido} onPress={enviar} />
    </View>
  );
}

export default function TareaPR() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [t, setT] = useState(null);
  const [refresh, setRefresh] = useState(false);
  const [busy, setBusy] = useState(null);

  const cargar = useCallback(async () => {
    try {
      setT(await api(`/respuesta/tareas/${id}`));
    } catch (e) {
      if (!e.network) alerta('Error', e.message);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));
  useEffect(() => {
    const s = getSocket();
    s?.on('tarea:actualizada', cargar);
    return () => s?.off('tarea:actualizada', cargar);
  }, [cargar]);

  const retornar = (x) => alerta('Retornar a base', `¿${x.descripcion} ya no está en esta tarea?`, [
    { text: 'Cancelar' },
    {
      text: 'Retornar',
      onPress: async () => {
        setBusy(x.id);
        try { await api(`/respuesta/tareas/recursos/${x.id}/retornar`, { method: 'POST' }); await cargar(); } catch (e) { alerta('Error', e.message); } finally { setBusy(null); }
      }
    }
  ]);

  if (!t) {
    return <View style={{ flex: 1, backgroundColor: C.fondo }}><Header title="Tarea" onBack={() => router.back()} /><Text style={{ padding: 20, color: C.texto2 }}>Cargando…</Text></View>;
  }
  const ev = t.evento;
  const abierta = t.estado !== 'Completada' && t.evento_estado === 'En curso';
  const lv = LV[ev?.nivel] || LV.amarilla;
  const activos = t.recursos.filter((x) => x.estado === 'Movilizado');

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.fondo }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title={t.codigo} subtitle={ev ? `${ev.codigo} · ${ev.titulo}` : t.evento_titulo} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={async () => { setRefresh(true); await cargar(); setRefresh(false); }} />}>
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', flex: 1, lineHeight: 24 }}>{t.titulo}</Text>
            <Chip estado={t.estado} />
          </View>
          <Progress pct={t.avance} color={COLOR_TAREA[t.estado]} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <Text style={{ fontFamily: 'monospace', fontWeight: '700' }}>{t.avance} %</Text>
            <Text style={{ fontSize: 13, color: vencida(t) ? C.rojo : C.texto2, fontWeight: vencida(t) ? '700' : '400' }}>Plazo {fShort(t.plazo)}{vencida(t) ? ' · vencido' : ''}</Text>
            {t.responsable ? <Text style={{ fontSize: 13, color: C.texto2 }}>Resp.: {t.responsable}</Text> : null}
          </View>
        </Card>

        {ev && (
          <Card style={{ gap: 8, padding: 0, overflow: 'hidden' }}>
            <View style={{ padding: 14, gap: 6, borderLeftWidth: 5, borderLeftColor: lv.bg }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Titulo>EVENTO</Titulo><LevelBadge nivel={ev.nivel} /></View>
              <Text style={{ fontSize: 15, fontWeight: '700' }}>{ev.titulo}</Text>
              <Text style={{ fontSize: 13, color: C.texto2 }}>{ev.lugar} · {ev.departamento}{ev.impacto ? ` · ${ev.impacto}` : ''}</Text>
              {ev.estado === 'Cerrado' && <Note tone="info" icon="lock">El COEN cerró este evento. La tarea queda como registro.</Note>}
            </View>
            {ev.lat != null && <LeafletMap center={[Number(ev.lat), Number(ev.lng)]} zoom={ev.radio_km ? 12 : 13} height={200} />}
            {ev.lat != null && (
              <View style={{ padding: 10, paddingTop: 0 }}>
                <Btn variant="outline" icon="navigation" title="Cómo llegar (OpenStreetMap)" onPress={() => Linking.openURL(`https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=%3B${ev.lat}%2C${ev.lng}`)} />
              </View>
            )}
          </Card>
        )}

        {abierta && (
          <Card style={{ gap: 10 }}>
            <Titulo>REGISTRAR AVANCE</Titulo>
            <Avance key={`${t.id}-${t.avance}`} t={t} onDone={cargar} />
          </Card>
        )}

        <Card style={{ gap: 10 }}>
          <Titulo>RECURSOS MOVILIZADOS · {activos.length} EN TERRENO</Titulo>
          {t.recursos.length ? t.recursos.map((x) => (
            <View key={x.id} style={[s.mov, x.estado === 'Retornado' && { opacity: 0.5, backgroundColor: C.fondo }]}>
              <View style={s.movIc}><Icon name={TIPOS_RECURSO[x.tipo].icon} size={18} color={C.naranja700} /></View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700' }}>{x.tipo === 'equipamiento' || x.tipo === 'material' ? `${x.cantidad} ${x.unidad || ''} · ` : ''}{x.descripcion}</Text>
                <Text style={{ fontSize: 12, color: C.texto2 }}>{TIPOS_RECURSO[x.tipo].label} · {x.usuario} · {fShort(x.fecha)}{x.fecha_retorno ? ` → ${fShort(x.fecha_retorno)}` : ''}</Text>
              </View>
              {x.estado === 'Movilizado'
                ? <Pressable onPress={() => retornar(x)} disabled={busy === x.id} style={s.retornar}><Icon name="keyboard-return" size={16} color={C.azul700} /><Text style={{ color: C.azul700, fontWeight: '700', fontSize: 12 }}>Retornar</Text></Pressable>
                : <Text style={{ fontSize: 12, color: C.texto2 }}>Retornado</Text>}
            </View>
          )) : <Text style={{ color: C.texto2, fontSize: 13 }}>Aún no se registraron recursos para esta tarea.</Text>}
          {abierta && <View style={{ borderTopWidth: 1, borderTopColor: C.borde, borderStyle: 'dashed', paddingTop: 12 }}><Movilizar t={t} onDone={cargar} /></View>}
        </Card>

        <Card style={{ gap: 10 }}>
          <Titulo>HISTORIAL DE AVANCE</Titulo>
          {t.avances.length ? t.avances.map((a) => (
            <View key={a.id} style={{ gap: 6, borderBottomWidth: 1, borderBottomColor: C.fondo, paddingBottom: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                <Text style={{ fontWeight: '700', flex: 1 }}>{a.usuario}</Text>
                <Text style={{ fontFamily: 'monospace', fontWeight: '700' }}>{a.avance} %</Text>
              </View>
              <Text style={{ color: C.texto2, fontSize: 13 }}>{a.observacion || '—'}</Text>
              {a.foto ? <Image source={{ uri: mediaUrl(a.foto) }} style={{ width: '100%', height: 160, borderRadius: 8, backgroundColor: C.azul50 }} resizeMode="cover" /> : null}
              <Text style={{ fontFamily: 'monospace', fontSize: 11, color: C.texto2 }}>{fShort(a.fecha)}</Text>
            </View>
          )) : <Text style={{ color: C.texto2, fontSize: 13 }}>Sin reportes de avance aún.</Text>}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = {
  opt: { flex: 1, height: 50, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.blanco, borderWidth: 1, borderColor: C.borde },
  optOn: { backgroundColor: C.azul900, borderColor: C.azul900 },
  fotoBtn: { flex: 1, height: 84, borderRadius: 12, borderWidth: 1.5, borderColor: C.azul600, backgroundColor: C.azul50, alignItems: 'center', justifyContent: 'center', gap: 4 },
  quitar: { position: 'absolute', top: 6, right: 6, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(7,26,51,0.75)', alignItems: 'center', justifyContent: 'center' },
  tipo: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: C.borde, backgroundColor: C.blanco },
  opcion: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: C.borde, backgroundColor: C.blanco },
  step: { width: 44, height: 48, borderRadius: 10, borderWidth: 1, borderColor: C.azul200, backgroundColor: C.azul50, alignItems: 'center', justifyContent: 'center' },
  mov: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: C.borde },
  movIc: { width: 34, height: 34, borderRadius: 8, backgroundColor: C.naranja50, alignItems: 'center', justifyContent: 'center' },
  retornar: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: C.azul200 }
};
