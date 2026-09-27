import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { registrarDialogo } from '../lib/dialog';
import { C, mono } from '../lib/theme';

const EAEN = require('../../assets/eaen.png');

/** Muestra los diálogos del sistema (lib/dialog.js) en cola, con el escudo de la EAEN. */
export default function DialogHost() {
  const [cola, setCola] = useState([]);
  useEffect(() => registrarDialogo((d) => setCola((c) => [...c, d])), []);
  const d = cola[0];
  if (!d) return null;

  const elegir = (b) => {
    setCola((c) => c.slice(1));
    b?.onPress?.();
  };
  const cancelar = d.botones.find((b) => b.style === 'cancel') || d.botones[0];
  const peligro = d.botones.some((b) => b.style === 'destructive');

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => elegir(cancelar)}>
      <View style={s.back}>
        <View style={s.card} accessibilityRole="alert">
          <View style={[s.head, { borderBottomColor: peligro ? C.rojo : C.naranja500 }]}>
            <Image source={EAEN} style={s.logo} resizeMode="contain" accessibilityLabel="Escuela de Altos Estudios Nacionales" />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.kicker}>SADE-IA · E.A.E.N.</Text>
              <Text style={s.titulo}>{d.titulo}</Text>
            </View>
          </View>
          {d.mensaje ? <Text style={s.msg}>{d.mensaje}</Text> : null}
          <View style={[s.botones, d.botones.length > 2 && { flexDirection: 'column' }]}>
            {d.botones.map((b, i) => {
              const principal = i === d.botones.length - 1;
              const rojo = b.style === 'destructive';
              return (
                <Pressable key={`${b.text}-${i}`} onPress={() => elegir(b)} accessibilityRole="button"
                  style={({ pressed }) => [s.btn, principal ? { backgroundColor: rojo ? C.rojo : C.azul900, borderColor: rojo ? C.rojo : C.azul900 } : null, { opacity: pressed ? 0.85 : 1 }]}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: principal ? C.blanco : rojo ? C.rojo : C.azul700 }}>{b.text}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(7,26,51,0.6)', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: C.blanco, borderRadius: 16, overflow: 'hidden', elevation: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: C.azul50, borderBottomWidth: 3 },
  logo: { width: 44, height: 56 },
  kicker: { fontFamily: mono, fontSize: 10, letterSpacing: 1, color: C.azul700, fontWeight: '700' },
  titulo: { fontSize: 18, fontWeight: '800', color: C.tinta, lineHeight: 23 },
  msg: { fontSize: 15, lineHeight: 22, color: C.texto2, paddingHorizontal: 18, paddingTop: 16 },
  botones: { flexDirection: 'row', gap: 8, padding: 16 },
  btn: { flex: 1, minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: C.azul200, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }
});
