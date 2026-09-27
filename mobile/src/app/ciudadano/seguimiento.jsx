import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from '../../components/Header';
import { Card, Empty, Icon, Note, PriorityBadge } from '../../components/ui';
import { api } from '../../lib/api';
import { connectSocket, getSocket } from '../../lib/socket';
import { misReportes } from '../../lib/misReportes';
import { fShort } from '../../lib/format';
import { C } from '../../lib/theme';

/** Seguimiento en tiempo real de un reporte ciudadano (sin cuenta: código + token). */
function Detalle({ item }) {
  const [rep, setRep] = useState(null);
  const [err, setErr] = useState('');
  const cargar = useCallback(() => api(`/publico/reportes/${item.codigo}?token=${item.token}`, { auth: false }).then((r) => { setRep(r); setErr(''); }).catch((e) => setErr(e.message)), [item]);

  useEffect(() => {
    cargar();
    let s = getSocket();
    const onUpd = (p) => p.codigo === item.codigo && cargar();
    (async () => {
      if (!s) s = await connectSocket(false);
      s.emit('seguir-reporte', { codigo: item.codigo, token: item.token });
      s.on('reporte:actualizado', onUpd);
    })();
    const poll = setInterval(cargar, 20000); // respaldo si el socket se corta
    return () => { clearInterval(poll); s?.off('reporte:actualizado', onUpd); };
  }, [cargar, item]);

  if (err) return <Note tone="err" icon="error">{err}</Note>;
  if (!rep) return <Text style={{ color: C.texto2 }}>Cargando…</Text>;
  const atendido = rep.estado === 'Atendido';
  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 6 }}>
        <Icon name={rep.estado === 'Falso / descartado' ? 'block' : 'check-circle'} size={40} color={rep.estado === 'Falso / descartado' ? C.texto3 : C.verde} />
        <Text style={{ fontSize: 20, fontWeight: '700' }}>{atendido ? 'Emergencia atendida' : 'Reporte recibido'}</Text>
        <Text style={{ fontFamily: 'monospace', fontSize: 13, color: C.texto2 }}>{rep.codigo} · {rep.titulo}</Text>
      </View>
      <View>
        {rep.pasos.map((p, i) => (
          <View key={p.label} style={{ flexDirection: 'row', gap: 12, minHeight: 50 }}>
            <View style={{ alignItems: 'center', width: 22 }}>
              <View style={{ width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: p.done ? C.azul600 : C.blanco, borderWidth: p.done ? 0 : 2, borderColor: C.borde }}>
                {p.done && <Icon name="check" size={14} color={C.blanco} />}
              </View>
              {i < rep.pasos.length - 1 && <View style={{ flex: 1, width: 2, backgroundColor: rep.pasos[i + 1].done ? C.azul600 : C.borde }} />}
            </View>
            <View style={{ flex: 1, paddingBottom: 10, gap: 2 }}>
              <Text style={{ fontSize: 15, fontWeight: p.done ? '700' : '400', color: p.done ? C.tinta : C.texto3 }}>{p.label}</Text>
              <Text style={{ fontSize: 12, color: C.texto2 }}>{p.sub}</Text>
            </View>
          </View>
        ))}
      </View>
      {!atendido && <Note icon="info">Diríjase a una zona segura. Mantenga el teléfono encendido; el equipo puede llamarle.</Note>}
    </View>
  );
}

export default function Seguimiento() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { codigo } = useLocalSearchParams();
  const [lista, setLista] = useState([]);
  const [sel, setSel] = useState(null);
  const [refresh, setRefresh] = useState(false);

  const cargar = useCallback(async () => {
    const l = await misReportes();
    setLista(l);
    setSel((prev) => prev || l.find((r) => r.codigo === codigo) || null);
  }, [codigo]);
  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  return (
    <View style={{ flex: 1, backgroundColor: C.blanco }}>
      <Header title={sel ? 'Seguimiento del reporte' : 'Mis reportes'} subtitle="Estado en tiempo real" onBack={() => (sel && !codigo ? setSel(null) : router.canGoBack() ? router.back() : router.replace('/'))} bg={C.azul600} />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 12, paddingBottom: insets.bottom + 20 }}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={async () => { setRefresh(true); await cargar(); setRefresh(false); }} />}>
        {sel ? <Detalle item={sel} /> : lista.length ? lista.map((r) => (
          <Pressable key={r.codigo} onPress={() => setSel(r)}>
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontFamily: 'monospace', fontSize: 12, color: C.texto2 }}>{r.codigo}</Text>
                {r.prioridad && <PriorityBadge prioridad={r.prioridad} />}
              </View>
              <Text style={{ fontSize: 16, fontWeight: '700' }}>{r.titulo}</Text>
              <Text style={{ fontSize: 12, color: C.texto2 }}>Enviado {fShort(r.fecha)}</Text>
            </Card>
          </Pressable>
        )) : <Empty icon="pending-actions" title="Sin reportes enviados" text="Los reportes que envíe desde este teléfono aparecerán aquí con su estado en tiempo real." />}
      </ScrollView>
    </View>
  );
}
