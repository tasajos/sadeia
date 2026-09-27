import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Header } from '../../components/Header';
import { Card, Chip, Empty, Icon, LevelBadge, Note, Progress } from '../../components/ui';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { onQueueChange, pendingCount } from '../../lib/offlineQueue';
import { fShort } from '../../lib/format';
import { C } from '../../lib/theme';
import { COLOR_TAREA, vencida } from '../../lib/tareas';
import { alerta } from '../../lib/dialog';

/** Tareas que el COEN / VIDECI asignaron a la institución (vista de campo del equipo de primera respuesta). */
export default function TareasPR() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [todas, setTodas] = useState(false);
  const [refresh, setRefresh] = useState(false);
  const [cola, setCola] = useState(0);

  const cargar = useCallback(async () => {
    try {
      setData(await api('/respuesta/tareas'));
    } catch (e) {
      if (!e.network) alerta('Error', e.message);
    }
  }, []);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));
  useEffect(() => {
    const s = getSocket();
    s?.on('tarea:nueva', cargar);
    s?.on('tarea:actualizada', cargar);
    pendingCount().then(setCola);
    const off = onQueueChange(setCola);
    return () => { s?.off('tarea:nueva', cargar); s?.off('tarea:actualizada', cargar); off(); };
  }, [cargar]);

  const activas = data?.filter((t) => t.estado !== 'Completada' && t.evento_estado === 'En curso') || [];
  const lista = todas ? data || [] : activas;

  return (
    <View style={{ flex: 1, backgroundColor: C.fondo }}>
      <Header title="Tareas asignadas" subtitle="Del COEN y VIDECI para su institución" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={async () => { setRefresh(true); await cargar(); setRefresh(false); }} />}>
        {cola > 0 && <Note icon="cloud-upload">{cola} reporte(s) de avance guardado(s) sin señal. Se enviarán automáticamente al reconectar.</Note>}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[[false, `Activas · ${activas.length}`], [true, `Todas · ${data?.length || 0}`]].map(([v, l]) => (
            <Pressable key={l} onPress={() => setTodas(v)} style={{ flex: 1, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: todas === v ? C.azul900 : C.blanco, borderWidth: 1, borderColor: todas === v ? C.azul900 : C.borde }}>
              <Text style={{ fontWeight: '700', color: todas === v ? C.blanco : C.tinta }}>{l}</Text>
            </Pressable>
          ))}
        </View>
        {!data ? <Text style={{ color: C.texto2, padding: 12 }}>Cargando…</Text> : lista.length ? lista.map((t) => (
          <Pressable key={t.id} onPress={() => router.push({ pathname: '/rescate/tarea/[id]', params: { id: String(t.id) } })}>
            <Card style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontFamily: 'monospace', fontSize: 12, color: C.texto2 }}>{t.codigo} · {t.evento_codigo}</Text>
                <LevelBadge nivel={t.nivel} />
              </View>
              <Text style={{ fontSize: 16, fontWeight: '700', lineHeight: 22 }}>{t.titulo}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name={t.icono} size={16} color={C.azul700} />
                <Text style={{ fontSize: 13, color: C.texto2, flex: 1 }} numberOfLines={1}>{t.evento_titulo}</Text>
              </View>
              <Progress pct={t.avance} color={COLOR_TAREA[t.estado]} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 12, color: vencida(t) ? C.rojo : C.texto2, fontWeight: vencida(t) ? '700' : '400', flex: 1 }}>
                  {t.avance} % · plazo {fShort(t.plazo)}{vencida(t) ? ' · vencido' : ''}{t.recursos_movilizados ? ` · ${t.recursos_movilizados} recurso(s)` : ''}
                </Text>
                <Chip estado={t.estado} />
              </View>
            </Card>
          </Pressable>
        )) : <Empty icon="task-alt" title="Sin tareas" text={todas ? 'Aún no se asignaron tareas a su institución.' : 'No hay tareas activas para su institución.'} />}
      </ScrollView>
    </View>
  );
}
