import { Image, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './ui';
import { C } from '../lib/theme';

/** Encabezado institucional (azul 900 con isotipo del búho) o de color de alerta. */
export function Header({ title, subtitle, onBack, right, bg = C.azul900, fg = C.blanco, logo = true }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: bg, paddingTop: insets.top + 8, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={12} accessibilityLabel="Volver"><Icon name="arrow-back" size={26} color={fg} /></Pressable>
      ) : logo ? (
        <View style={{ width: 38, height: 38, borderRadius: 9, backgroundColor: C.blanco, alignItems: 'center', justifyContent: 'center' }}>
          <Image source={require('../../assets/buho.png')} style={{ width: 28, height: 28 }} resizeMode="contain" />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={{ color: fg, fontSize: 18, fontWeight: '700' }} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={{ color: fg === C.blanco ? C.azul200 : C.texto2, fontSize: 12 }} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}
