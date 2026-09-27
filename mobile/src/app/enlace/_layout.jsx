import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../lib/auth';

export default function EnlaceLayout() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  if (!user) return <Redirect href="/login" />;
  if (user.debe_cambiar_password) return <Redirect href="/cuenta/password" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
