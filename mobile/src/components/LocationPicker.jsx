import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Btn, Icon } from './ui';
import { C } from '../lib/theme';
import { capasCss, capasJs, recordarCapa } from '../lib/mapLayers';

const BOLIVIA = { latitude: -16.5, longitude: -64.6 };

/** Dirección legible a partir de coordenadas (misma forma que en el paso de GPS). */
export async function direccionDe({ latitude, longitude }) {
  const g = await Location.reverseGeocodeAsync({ latitude, longitude }).catch(() => []);
  return g[0] ? [g[0].street, g[0].district || g[0].subregion, g[0].city, g[0].region].filter(Boolean).join(', ') : '';
}

/**
 * Selector de "otra ubicación": el ciudadano mueve el mapa bajo un pin fijo en el centro
 * (o busca una dirección) para reportar una emergencia en un lugar distinto a donde está.
 * onConfirm({ latitude, longitude })
 */
export default function LocationPicker({ visible, initial, onClose, onConfirm }) {
  const insets = useSafeAreaInsets();
  const web = useRef(null);
  const [centro, setCentro] = useState(null);
  const [q, setQ] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [msg, setMsg] = useState('');

  const inicio = initial || BOLIVIA;
  const zoom = initial ? 16 : 5;
  // El HTML solo depende del punto inicial: mover el mapa no recarga el WebView.
  const html = useMemo(() => `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#m{margin:0;height:100%;background:#E6EEF7}
.pin{position:absolute;left:50%;top:50%;z-index:1000;pointer-events:none;transform:translate(-50%,-100%)}
.pin svg{display:block;filter:drop-shadow(0 3px 4px rgba(11,37,69,.4))}
${capasCss}
.dot{position:absolute;left:50%;top:50%;z-index:999;width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;background:rgba(11,37,69,.45);pointer-events:none}</style>
</head><body><div id="m"></div>
<div class="dot"></div>
<div class="pin"><svg width="40" height="52" viewBox="0 0 40 52"><path d="M20 0C9 0 0 9 0 20c0 15 20 32 20 32s20-17 20-32C40 9 31 0 20 0z" fill="#C62828"/><circle cx="20" cy="20" r="8" fill="#fff"/></svg></div>
<script>
var map=L.map('m',{zoomControl:false}).setView([${inicio.latitude},${inicio.longitude}],${zoom});
${capasJs()}
function post(){var c=map.getCenter();window.ReactNativeWebView.postMessage(JSON.stringify({lat:c.lat,lng:c.lng}));}
map.on('moveend',post);post();
window.ir=function(lat,lng){map.setView([lat,lng],17);};
</script></body></html>`, [inicio.latitude, inicio.longitude, zoom]);

  const buscar = async () => {
    if (q.trim().length < 3) return;
    Keyboard.dismiss();
    setBuscando(true);
    setMsg('');
    try {
      const r = await Location.geocodeAsync(`${q}, Bolivia`);
      if (r[0]) web.current?.injectJavaScript(`window.ir(${r[0].latitude},${r[0].longitude});true;`);
      else setMsg('No se encontró esa dirección. Mueva el mapa hasta el lugar.');
    } catch {
      setMsg('No se pudo buscar la dirección. Mueva el mapa hasta el lugar.');
    } finally {
      setBuscando(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: C.blanco }}>
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 14, paddingBottom: 10, gap: 10, backgroundColor: C.blanco, borderBottomWidth: 1, borderColor: C.borde }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Cerrar"><Icon name="close" size={26} /></Pressable>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '700' }}>Marcar otra ubicación</Text>
              <Text style={{ fontSize: 12, color: C.texto2 }}>Mueva el mapa hasta dejar el pin sobre el lugar de la emergencia</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 48, borderWidth: 1, borderColor: C.borde, borderRadius: 10, paddingHorizontal: 12 }}>
            <Icon name="search" size={20} color={C.texto2} />
            <TextInput style={{ flex: 1, fontSize: 15, color: C.tinta, padding: 0 }} value={q} onChangeText={setQ} placeholder="Buscar dirección, barrio o ciudad" returnKeyType="search" onSubmitEditing={buscar} />
            {buscando ? <ActivityIndicator color={C.azul600} /> : q ? <Pressable onPress={buscar} hitSlop={8}><Text style={{ color: C.azul700, fontWeight: '700' }}>Buscar</Text></Pressable> : null}
          </View>
          {msg ? <Text style={{ fontSize: 12, color: C.errFg }}>{msg}</Text> : null}
        </View>
        <View style={{ flex: 1 }}>
          <WebView
            ref={web}
            originWhitelist={['*']}
            source={{ html }}
            style={{ flex: 1, backgroundColor: C.fondo }}
            javaScriptEnabled
            domStorageEnabled
            onMessage={(e) => {
              if (recordarCapa(e.nativeEvent.data)) return;
              try { const d = JSON.parse(e.nativeEvent.data); setCentro({ latitude: d.lat, longitude: d.lng }); } catch { /* mensaje ajeno */ }
            }}
          />
        </View>
        <View style={{ padding: 14, paddingBottom: insets.bottom + 14, gap: 6, borderTopWidth: 1, borderColor: C.borde }}>
          <Text style={{ fontFamily: 'monospace', fontSize: 12, color: C.texto2, textAlign: 'center' }}>
            {centro ? `${centro.latitude.toFixed(5)}, ${centro.longitude.toFixed(5)}` : 'Cargando mapa…'}
          </Text>
          <Btn big title="Usar este lugar" icon="where-to-vote" disabled={!centro} onPress={() => onConfirm(centro)} />
        </View>
      </View>
    </Modal>
  );
}
