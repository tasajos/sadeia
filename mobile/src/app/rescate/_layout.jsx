import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../lib/auth';
import MisionAlarm from '../../components/MisionAlarm';

export default function RescateLayout() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  if (!user) return <Redirect href="/login" />;
  if (user.debe_cambiar_password) return <Redirect href="/cuenta/password" />;
  if (!user.permisos.includes('rescate.misiones')) return <Redirect href="/enlace" />;
  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <MisionAlarm />
    </>
  );
}
