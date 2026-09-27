import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { C, LV, PR, ST } from '../lib/theme';

/** Íconos: nombres de la web (Material Symbols) mapeados a MaterialIcons. */
const ALIAS = { weather_hail: 'grain', ambulance: 'local-hospital', person_alert: 'report', neurology: 'psychology', emergency_home: 'home-repair-service', troubleshoot: 'manage-search' };
export function Icon({ name = 'help-outline', size = 22, color = C.tinta, style }) {
  const n = ALIAS[name] || name.replace(/_/g, '-');
  const valid = MaterialIcons.glyphMap?.[n] !== undefined;
  return <MaterialIcons name={valid ? n : 'help-outline'} size={size} color={color} style={style} />;
}

export function Btn({ title, onPress, variant = 'primary', icon, disabled, loading, style, big }) {
  const v = {
    primary: { bg: C.naranja500, fg: C.azul900, bd: C.naranja500 },
    outline: { bg: C.blanco, fg: C.azul700, bd: C.azul200 },
    dark: { bg: C.azul900, fg: C.blanco, bd: C.azul900 },
    danger: { bg: C.rojo, fg: C.blanco, bd: C.rojo },
    ghost: { bg: C.blanco, fg: C.texto2, bd: C.borde },
    dashed: { bg: C.azul50, fg: C.azul700, bd: C.azul200 }
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.btn,
        { backgroundColor: v.bg, borderColor: v.bd, height: big ? 56 : 48, opacity: disabled ? 0.5 : pressed ? 0.85 : 1, borderStyle: variant === 'dashed' ? 'dashed' : 'solid' },
        style
      ]}
    >
      {loading ? <ActivityIndicator color={v.fg} /> : (
        <>
          {icon && <Icon name={icon} size={20} color={v.fg} />}
          <Text style={[s.btnTxt, { color: v.fg, fontSize: big ? 17 : 15, fontWeight: variant === 'primary' ? '800' : '700' }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function LevelBadge({ nivel }) {
  const l = LV[nivel] || LV.verde;
  return (
    <View style={[s.pill, { backgroundColor: l.bg }]}>
      <Icon name={l.icon} size={14} color={l.fg} />
      <Text style={[s.pillTxt, { color: l.fg }]}>{l.label}</Text>
    </View>
  );
}

export function PriorityBadge({ prioridad }) {
  const p = PR[prioridad] || PR.BAJA;
  return <View style={[s.pill, { backgroundColor: p.bg }]}><Text style={[s.pillTxt, { color: p.fg }]}>{prioridad}</Text></View>;
}

export function Chip({ estado, text }) {
  const c = ST[estado] || { bg: C.fondo, fg: C.texto2 };
  return <View style={[s.chip, { backgroundColor: c.bg }]}><Text style={{ color: c.fg, fontSize: 12, fontWeight: '600' }}>{text || estado}</Text></View>;
}

export function Card({ children, style }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Note({ icon = 'info', tone = 'warn', children }) {
  const t = { warn: [C.naranja50, '#7A3D08'], info: [C.azul50, C.texto2], err: [C.errBg, C.errFg], ok: [C.okBg, C.okFg] }[tone];
  return (
    <View style={[s.note, { backgroundColor: t[0] }]}>
      <Icon name={icon} size={20} color={t[1]} />
      <Text style={{ color: t[1], fontSize: 13, lineHeight: 19, flex: 1 }}>{children}</Text>
    </View>
  );
}

export function Progress({ pct, color = C.azul600 }) {
  return <View style={s.bar}><View style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', backgroundColor: color, borderRadius: 3 }} /></View>;
}

export function Empty({ icon = 'inbox', title, text }) {
  return (
    <View style={s.empty}>
      <Icon name={icon} size={48} color={C.azul200} />
      {title && <Text style={{ fontSize: 16, fontWeight: '600', color: C.tinta, textAlign: 'center' }}>{title}</Text>}
      {text && <Text style={{ fontSize: 13, lineHeight: 19, color: C.texto2, textAlign: 'center' }}>{text}</Text>}
    </View>
  );
}

export const s = StyleSheet.create({
  btn: { borderRadius: 10, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
  btnTxt: { fontSize: 15 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 24, paddingHorizontal: 9, borderRadius: 999, alignSelf: 'flex-start' },
  pillTxt: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  chip: { height: 22, paddingHorizontal: 8, borderRadius: 4, justifyContent: 'center', alignSelf: 'flex-start' },
  card: { backgroundColor: C.blanco, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.borde, gap: 10 },
  note: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 12, borderRadius: 10 },
  bar: { height: 6, backgroundColor: C.fondo, borderRadius: 3, overflow: 'hidden' },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 32, paddingHorizontal: 16 }
});
