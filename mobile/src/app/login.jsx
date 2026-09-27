import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth, homeFor } from '../lib/auth';
import { BASE_URL } from '../lib/api';
import { Header } from '../components/Header';
import { Btn, Note } from '../components/ui';
import { C } from '../lib/theme';

const DEMO = process.env.EXPO_PUBLIC_DEMO_LOGIN !== 'false';

export default function Login() {
  const { login } = useAuth();
  const router = useRouter();
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setErr('');
    try {
      const user = await login(u.trim(), p);
      router.replace(homeFor(user));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const input = { height: 50, borderWidth: 1, borderColor: C.borde, borderRadius: 10, paddingHorizontal: 14, fontSize: 16, backgroundColor: C.blanco, color: C.tinta };
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title="Acceso institucional" subtitle="Enlaces y equipos de primera respuesta" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 13, fontWeight: '600' }}>Usuario o correo</Text>
          <TextInput style={input} value={u} onChangeText={setU} autoCapitalize="none" autoCorrect={false} textContentType="username" placeholder="rsuarez" />
        </View>
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 13, fontWeight: '600' }}>Contraseña</Text>
          <TextInput style={input} value={p} onChangeText={setP} secureTextEntry textContentType="password" onSubmitEditing={submit} />
        </View>
        {err ? <Note tone="err" icon="error">{err}</Note> : null}
        <Btn big title="Ingresar" icon="arrow-forward" loading={busy} disabled={!u || !p} onPress={submit} />
        <Note tone="info" icon="lock">La sesión expira a las 8 horas. Todo acceso queda registrado en la bitácora de auditoría.</Note>
        {DEMO && (
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 12, color: C.texto2 }}>Demostración (contraseña Sadeia2026!):</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Btn style={{ flex: 1 }} variant="outline" title="Enlace FF.AA." onPress={() => { setU('rsuarez'); setP('Sadeia2026!'); }} />
              <Btn style={{ flex: 1 }} variant="outline" title="Primera respuesta" onPress={() => { setU('lmendez'); setP('Sadeia2026!'); }} />
            </View>
          </View>
        )}
        <Text style={{ fontSize: 11, color: C.texto3, textAlign: 'center' }}>Servidor: {BASE_URL}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
