import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Header } from '../../../components/Header';
import { Btn, Card, Empty, Icon, LevelBadge, Note } from '../../../components/ui';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { getSocket } from '../../../lib/socket';
import { dec, fShort } from '../../../lib/format';
import { C, LV } from '../../../lib/theme';

/** Alertas notificadas a la institución del enlace, con confirmación de recepción. */
export default function Alertas() {
  const { user } = useAuth();
  const [alertas, setAlertas] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(null);
  const [refresh, setRefresh] = useState(false);

  const cargar = useCallback(() => api('/alertas/recibidas').then((r) => { setAlertas(r); setErr(''); }).catch((e) => setErr(e.message)), []);
  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));
  useEffect(() => {
    const s = getSocket();
    s?.on('alerta:recibida', cargar);
    s?.on('alerta:actualizada', cargar);
    return () => { s?.off('alerta:recibida', cargar); s?.off('alerta:actualizada', cargar); };
  }, [cargar]);

  const confirmar = async (a) => {
    setBusy(a.id);
    try { await api(`/alertas/${a.id}/confirmar`, { method: 'POST' }); await cargar(); } catch (e) { setErr(e.message); } finally { setBusy(null); }
  };

  const top = alertas?.find((a) => a.nivel === 'roja' && a.recepcion?.estado !== 'Confirmada');
  return (
    <View style={{ flex: 1, backgroundColor: C.fondo }}>
      {top ? (
        <View>
          <Header title={`ALERTA ${LV[top.nivel].label}`} subtitle={top.codigo} bg={LV[top.nivel].bg} logo={false} />
          <View style={{ backgroundColor: LV[top.nivel].bg, paddingHorizontal: 20, paddingBottom: 18, gap: 6 }}>
            <Text style={{ color: C.blanco, fontSize: 22, fontWeight: '700' }}>{top.amenaza} · {top.lugar}</Text>
            <Text style={{ color: C.blanco, fontFamily: 'monospace', fontSize: 13 }}>{top.horizonte} · prob. {dec(top.probabilidad)}</Text>
          </View>
        </View>
      ) : <Header title="Alertas recibidas" subtitle={user?.institucion_nombre} />}
      <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }} refreshControl={<RefreshControl refreshing={refresh} onRefresh={async () => { setRefresh(true); await cargar(); setRefresh(false); }} />}>
        {err ? <Note tone="err" icon="error">{err}</Note> : null}
        {alertas?.length === 0 && <Empty icon="notifications-paused" title="Sin alertas vigentes" text="Cuando una alerta sea validada, se notificará simultáneamente a su institución." />}
        {alertas?.map((a) => {
          const conf = a.recepcion?.estado === 'Confirmada';
          const principal = a.sustento?.find((v) => v.supera);
          return (
            <Card key={a.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontFamily: 'monospace', fontSize: 12, color: C.texto2 }}>{a.codigo}</Text>
                <LevelBadge nivel={a.nivel} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name={a.icono} color={C.azul700} />
                <Text style={{ fontSize: 16, fontWeight: '700', flex: 1 }}>{a.amenaza} · {a.lugar}</Text>
              </View>
              <Text style={{ fontSize: 14, lineHeight: 20, color: C.tinta }}>
                {a.validado_por ? `Validada por ${a.validado_por} el ${fShort(a.fecha_validacion)}. ` : ''}
                {principal ? `${principal.name}: ${String(principal.val).replace('.', ',')} ${principal.unidad}, umbral ${String(principal.thr).replace('.', ',')} ${principal.unidad}.` : ''}
              </Text>
              {conf ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icon name="task-alt" color={C.verde} size={18} /><Text style={{ color: C.okFg, fontWeight: '600' }}>Recepción confirmada {fShort(a.recepcion.fecha_confirmacion)}</Text></View>
              ) : (
                <Btn title="Confirmar recepción" icon="done-all" loading={busy === a.id} onPress={() => confirmar(a)} />
              )}
            </Card>
          );
        })}
      </ScrollView>
    </View>
  );
}
