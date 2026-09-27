import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Header } from '../../../components/Header';
import { Card, Chip, Empty, Note, Progress } from '../../../components/ui';
import { SesionActions } from '../../../components/SesionActions';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { getSocket } from '../../../lib/socket';
import { flush, onQueueChange, pendingCount } from '../../../lib/offlineQueue';
import { fShort } from '../../../lib/format';
import { C } from '../../../lib/theme';

export default function MisTareas() {
  const { user } = useAuth();
  const router = useRouter();
  const [tareas, setTareas] = useState(null);
  const [err, setErr] = useState('');
  const [cola, setCola] = useState(0);
  const [refresh, setRefresh] = useState(false);

  const cargar = useCallback(async () => {
    try { setTareas(await api('/coordinacion/tareas/mias')); setErr(''); } catch (e) { setErr(e.message); }
    setCola(await pendingCount());
  }, []);
  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));
  useEffect(() => {
    const s = getSocket();
    s?.on('tarea:actualizada', cargar);
    s?.on('tarea:nueva', cargar);
    const off = onQueueChange(setCola);
    return () => { s?.off('tarea:actualizada', cargar); s?.off('tarea:nueva', cargar); off(); };
  }, [cargar]);

  return (
    <View style={{ flex: 1, backgroundColor: C.fondo }}>
      <Header title="Mis tareas" subtitle={`${user?.nombre} · ${user?.institucion}`}
        right={<SesionActions />} />
      <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={async () => { setRefresh(true); await flush(); await cargar(); setRefresh(false); }} />}>
        {cola > 0 && <Note icon="cloud-upload">{cola} reporte(s) guardado(s) sin señal. Se enviarán automáticamente al reconectar (deslice hacia abajo para reintentar).</Note>}
        {err ? <Note tone="err" icon="error">{err}</Note> : null}
        {tareas?.length === 0 && <Empty icon="task-alt" title="Sin tareas asignadas" text="Las tareas aprobadas por el decisor para su institución aparecerán aquí." />}
        {tareas?.map((t) => (
          <Pressable key={t.id} onPress={() => router.push({ pathname: '/enlace/tarea/[id]', params: { id: String(t.id) } })}>
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontFamily: 'monospace', fontSize: 12, color: C.texto2 }}>{t.codigo} · {t.evento_codigo}</Text>
                <Chip estado={t.estado} />
              </View>
              <Text style={{ fontSize: 16, fontWeight: '700', lineHeight: 21 }}>{t.titulo}</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, color: t.estado === 'Vencida' ? C.rojo : C.texto2 }}>Plazo {fShort(t.plazo)}</Text>
                <Text style={{ fontFamily: 'monospace', fontWeight: '600' }}>{t.avance}%</Text>
              </View>
              <Progress pct={t.avance} />
            </Card>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
