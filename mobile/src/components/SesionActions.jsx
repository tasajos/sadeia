import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from './ui';
import { useAuth } from '../lib/auth';
import { C } from '../lib/theme';

/** Acciones de la cuenta en el encabezado: cambiar contraseña y cerrar sesión. */
export function SesionActions({ color = C.blanco, soloSalir = false }) {
  const router = useRouter();
  const { logout } = useAuth();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
      {!soloSalir && <Pressable onPress={() => router.push('/cuenta/password')} hitSlop={10} accessibilityLabel="Cambiar contraseña"><Icon name="key" color={color} /></Pressable>}
      <Pressable onPress={() => logout()} hitSlop={10} accessibilityLabel="Cerrar sesión"><Icon name="logout" color={color} /></Pressable>
    </View>
  );
}
