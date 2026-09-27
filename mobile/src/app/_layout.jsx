import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../lib/auth';
import { startAutoFlush, flush, onSentKind } from '../lib/offlineQueue';
import { guardarMiReporte } from '../lib/misReportes';
import { C } from '../lib/theme';
import DialogHost from '../components/DialogHost';

// Cuando un reporte ciudadano encolado sin señal se envía, se guarda su código de seguimiento.
onSentKind('reporte', (data, item) => guardarMiReporte({ ...data, titulo: item.label }));

export default function RootLayout() {
  useEffect(() => {
    flush();
    const unsub = startAutoFlush();
    return () => unsub?.();
  }, []);
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.fondo } }} />
        <DialogHost />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
