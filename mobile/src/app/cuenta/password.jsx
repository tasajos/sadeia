import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from '../../components/Header';
import { Btn, Icon, Note } from '../../components/ui';
import { api } from '../../lib/api';
import { homeFor, useAuth } from '../../lib/auth';
import { SesionActions } from '../../components/SesionActions';
import { C } from '../../lib/theme';
import { alerta } from '../../lib/dialog';

/** Mismas reglas que valida el backend (PUT /auth/password). */
const REGLAS = [
  { t: 'Al menos 8 caracteres', ok: (p) => p.length >= 8 },
  { t: 'Letras y números', ok: (p) => /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(p) && /\d/.test(p) },
  { t: 'Distinta de la actual', ok: (p, a) => !!p && p !== a }
];

function Campo({ label, value, onChange, ver, autoComplete }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 13, fontWeight: '600' }}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} secureTextEntry={!ver} autoCapitalize="none" autoCorrect={false} autoComplete={autoComplete} maxLength={72}
        style={{ height: 52, borderWidth: 1, borderColor: C.borde, borderRadius: 10, paddingHorizontal: 14, fontSize: 16, color: C.tinta, backgroundColor: C.blanco }} />
    </View>
  );
}

export default function CambiarPassword() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, logout, passwordCambiada } = useAuth();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [conf, setConf] = useState('');
  const [ver, setVer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!user) return <Redirect href="/login" />;
  // Primer ingreso con contraseña temporal: no se puede volver atrás, solo cambiarla o cerrar sesión.
  const forzado = !!user.debe_cambiar_password;
  const reglasOk = REGLAS.every((r) => r.ok(nueva, actual));
  const coincide = conf.length > 0 && conf === nueva;

  const guardar = async () => {
    setBusy(true);
    setErr('');
    try {
      await api('/auth/password', { method: 'PUT', body: { actual, nueva } });
      if (forzado) {
        const u = await passwordCambiada();
        alerta('SADE-IA', 'Contraseña creada. Bienvenido a SADE-IA.');
        router.replace(homeFor(u));
      } else {
        alerta('SADE-IA', 'Contraseña actualizada. Úsela en su próximo inicio de sesión.');
        router.back();
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.fondo }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {forzado
        ? <Header title="Cree su contraseña" subtitle={`${user.nombre} · primer ingreso`} right={<SesionActions soloSalir />} />
        : <Header title="Cambiar contraseña" subtitle={`${user.nombre} · ${user.username}`} onBack={() => router.back()} />}
      <ScrollView contentContainerStyle={{ padding: 18, gap: 16, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        {forzado && <Note tone="info" icon="lock-reset">Su contraseña fue asignada por un administrador. Por seguridad, reemplácela por una que solo usted conozca antes de continuar.</Note>}
        <Campo label={forzado ? 'Contraseña temporal (la que recibió)' : 'Contraseña actual'} value={actual} onChange={setActual} ver={ver} autoComplete="current-password" />
        <Campo label="Nueva contraseña" value={nueva} onChange={setNueva} ver={ver} autoComplete="new-password" />
        <View style={{ gap: 6 }}>
          {REGLAS.map((r) => {
            const ok = r.ok(nueva, actual);
            return (
              <View key={r.t} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name={ok ? 'check-circle' : 'radio-button-unchecked'} size={18} color={ok ? C.verde : C.texto3} />
                <Text style={{ fontSize: 14, color: ok ? C.okFg : C.texto2, fontWeight: ok ? '700' : '400' }}>{r.t}</Text>
              </View>
            );
          })}
        </View>
        <Campo label="Confirmar nueva contraseña" value={conf} onChange={setConf} ver={ver} autoComplete="new-password" />
        {conf && !coincide ? <Text style={{ color: C.rojo, fontSize: 13, marginTop: -8 }}>Las contraseñas no coinciden</Text> : null}
        <Pressable onPress={() => setVer((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40 }} accessibilityRole="checkbox" accessibilityState={{ checked: ver }}>
          <Icon name={ver ? 'check-box' : 'check-box-outline-blank'} color={C.azul700} />
          <Text style={{ fontSize: 14 }}>Mostrar contraseñas</Text>
        </Pressable>
        {err ? <Note tone="err" icon="error">{err}</Note> : null}
        <Btn big title={forzado ? 'Crear contraseña' : 'Cambiar contraseña'} icon="key" loading={busy} disabled={!actual || !reglasOk || !coincide} onPress={guardar} />
        {forzado && <Btn variant="ghost" title="Cerrar sesión" icon="logout" onPress={() => logout()} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
