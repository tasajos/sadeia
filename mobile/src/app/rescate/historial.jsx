import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Header } from '../../components/Header';
import { Card, Chip, Empty } from '../../components/ui';
import { api } from '../../lib/api';
import { fShort } from '../../lib/format';
import { C } from '../../lib/theme';

export default function Historial() {
  const router = useRouter();
  const [rows, setRows] = useState(null);
  useEffect(() => { api('/misiones/historial').then(setRows).catch(() => setRows([])); }, []);
  return (
    <View style={{ flex: 1, backgroundColor: C.fondo }}>
      <Header title="Historial de misiones" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }}>
        {rows?.length === 0 && <Empty icon="history" title="Sin misiones registradas" />}
        {rows?.map((r) => (
          <Card key={r.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: 'monospace', fontSize: 12, color: C.texto2 }}>{r.reporte} · {fShort(r.fecha_despacho)}</Text>
              <Chip estado={r.estado === 'Controlada' ? 'Completada' : r.estado === 'Rechazada' ? 'Vencida' : 'En curso'} text={r.estado} />
            </View>
            <Text style={{ fontSize: 15, fontWeight: '700' }}>{r.titulo}</Text>
            <Text style={{ fontSize: 13, color: C.texto2 }}>{r.lugar}</Text>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}
