import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { useRouter } from 'expo-router';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { Btn, Icon } from './ui';
import { getSocket } from '../lib/socket';
import { alarmaMision, alarmaTarea, onMision } from '../lib/alarm';
import { fShort } from '../lib/format';
import { C, LV, PR, mono } from '../lib/theme';

const SIRENA = require('../../assets/sounds/sirena-despacho.wav');
const VIBRACION = [0, 700, 300, 700, 300, 700, 1200];

/**
 * Aviso de nueva misión (despacho a la unidad) o de nueva tarea (asignada a la institución por el COEN / VIDECI)
 * para el equipo de primera respuesta: modal a pantalla completa,
 * sirena en bucle (aunque el teléfono esté en silencio) y vibración hasta que la unidad lo atiende.
 */
export default function MisionAlarm() {
  const router = useRouter();
  const [m, setM] = useState(null);
  const [mudo, setMudo] = useState(false);
  const [pulso] = useState(() => new Animated.Value(0));

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers' }).catch(() => {});
    const s = getSocket();
    s?.on('mision:nueva', alarmaMision);
    s?.on('tarea:nueva', alarmaTarea);
    const off = onMision((x) => { setM(x); setMudo(false); });
    return () => { s?.off('mision:nueva', alarmaMision); s?.off('tarea:nueva', alarmaTarea); off(); };
  }, []);

  // Sirena + vibración mientras el aviso esté abierto
  useEffect(() => {
    if (!m || mudo) return undefined;
    const player = createAudioPlayer(SIRENA);
    player.loop = true;
    player.volume = 1;
    player.play();
    Vibration.vibrate(VIBRACION, true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    return () => { player.remove(); Vibration.cancel(); };
  }, [m, mudo]);

  useEffect(() => {
    if (!m) return undefined;
    const loop = Animated.loop(Animated.timing(pulso, { toValue: 1, duration: 1300, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => { loop.stop(); pulso.setValue(0); };
  }, [m, pulso]);

  if (!m) return null;
  const tarea = m.tipo === 'tarea';
  const pr = tarea ? LV[m.nivel] || LV.amarilla : PR[m.prioridad] || PR.MEDIA;
  const cerrar = () => setM(null);
  const ver = () => {
    cerrar();
    if (tarea) router.push({ pathname: '/rescate/tarea/[id]', params: { id: String(m.id) } });
    else if (router.canDismiss()) router.dismissTo('/rescate');
  };
  const meta = (tarea
    ? [m.codigo, m.evento, m.plazo && `Plazo ${fShort(m.plazo)}`]
    : [m.reporte, m.eta_min != null && `ETA ${m.eta_min} min`, m.distancia_km != null && `${String(m.distancia_km).replace('.', ',')} km`]).filter(Boolean);

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={cerrar}>
      <View style={s.back}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: pr.bg, opacity: pulso.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.15, 0.45, 0.15] }) }]} />
        <View style={[s.card, { borderColor: pr.bg }]} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          <View style={[s.band, { backgroundColor: pr.bg }]}>
            <View style={s.ringWrap}>
              <Animated.View style={[s.ring, { borderColor: pr.fg, opacity: pulso.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }), transform: [{ scale: pulso.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }] }]} />
              <View style={[s.ring, { borderColor: pr.fg, backgroundColor: 'rgba(255,255,255,0.18)' }]}>
                <Icon name={tarea ? 'assignment-late' : 'notifications-active'} size={36} color={pr.fg} />
              </View>
            </View>
            <Text style={[s.kicker, { color: pr.fg }]}>{tarea ? `NUEVA TAREA PARA SU INSTITUCIÓN${m.origen ? ` · ${String(m.origen).toUpperCase()}` : ''}` : `NUEVA MISIÓN · PRIORIDAD ${m.prioridad}`}</Text>
            <Text style={[s.titulo, { color: pr.fg }]}>{m.titulo}</Text>
            <Pressable onPress={() => setMudo((x) => !x)} hitSlop={10} style={s.mute} accessibilityLabel={mudo ? 'Activar sonido' : 'Silenciar'}>
              <Icon name={mudo ? 'volume-off' : 'volume-up'} color={pr.fg} />
            </Pressable>
          </View>
          <View style={s.body}>
            {tarea && m.evento_titulo ? (
              <View style={s.row}><Icon name="emergency" color={C.azul700} /><Text style={s.lugar}>{m.evento_titulo}</Text></View>
            ) : null}
            {!tarea && m.lugar ? (
              <View style={s.row}><Icon name="place" color={C.azul700} /><Text style={s.lugar}>{m.lugar}</Text></View>
            ) : null}
            {m.personas_riesgo && (
              <View style={[s.row, s.riesgo]}><Icon name="report" color={C.errFg} /><Text style={{ color: C.errFg, fontWeight: '700', fontSize: 15 }}>Personas en riesgo vital</Text></View>
            )}
            <Text style={s.meta}>{meta.join('  ·  ')}</Text>
            <Text style={{ color: C.texto2, fontSize: 13 }}>{tarea ? 'Registre el avance y los recursos que moviliza para que el COEN vea la respuesta de su institución.' : 'Despacho del COEN a su unidad. Acepte o rechace la misión para confirmar la recepción.'}</Text>
            <Btn big title={tarea ? 'Ver tarea' : 'Ver misión'} icon="assignment" onPress={ver} />
            <Btn variant="ghost" title="Enterado" onPress={cerrar} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(7,26,51,0.82)', justifyContent: 'center', padding: 18 },
  card: { backgroundColor: C.blanco, borderRadius: 16, overflow: 'hidden', borderWidth: 4, elevation: 12 },
  band: { alignItems: 'center', paddingTop: 26, paddingBottom: 20, paddingHorizontal: 20, gap: 8 },
  ringWrap: { width: 76, height: 76, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  ring: { position: 'absolute', width: 76, height: 76, borderRadius: 38, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontFamily: mono, fontSize: 12, fontWeight: '800', letterSpacing: 1, textAlign: 'center' },
  titulo: { fontSize: 23, fontWeight: '800', textAlign: 'center' },
  mute: { position: 'absolute', top: 12, right: 12, width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  body: { padding: 18, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lugar: { flex: 1, fontSize: 17, fontWeight: '700', color: C.tinta },
  riesgo: { backgroundColor: C.errBg, padding: 12, borderRadius: 8 },
  meta: { fontFamily: mono, fontSize: 14, color: C.texto2 }
});
