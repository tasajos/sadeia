import { useMemo } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { C } from '../lib/theme';
import { capasCss, capasJs, recordarCapa } from '../lib/mapLayers';

/**
 * Mapa libre sin Google Maps: Leaflet + teselas OpenStreetMap dentro de un WebView.
 * Funciona en Expo Go (sin compilación nativa) y en Android/iOS por igual.
 * Para producción puede apuntarse a un servidor de teselas propio con EXPO_PUBLIC_TILE_URL.
 *
 * props:
 *  - center: [lat, lng]            punto principal (reporte / ubicación)
 *  - markers: [{lat,lng,label,kind:'team'|'team-d'|'team-b'|'alert', color}]
 *  - route: true                   dibuja línea del primer equipo despachado al punto
 *  - me: [lat,lng]                 posición del dispositivo
 */

export default function LeafletMap({ center, markers = [], me, height = 260, zoom = 14, fit = true, style }) {
  // Clave estable: el WebView solo se recarga si cambian los datos (no en cada render).
  const key = JSON.stringify({ center, markers, me, zoom, fit });
  const html = useMemo(() => {
    const data = key.replace(/</g, '\\u003c');
    return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#m{margin:0;height:100%;background:#E6EEF7;font-family:sans-serif}
.pin{width:22px;height:22px;border-radius:50%;background:#C62828;border:3px solid #fff;box-shadow:0 0 0 6px rgba(198,40,40,.25)}
.me{width:16px;height:16px;border-radius:50%;background:#1170B8;border:3px solid #fff;box-shadow:0 0 0 6px rgba(17,112,184,.25)}
.tm{font:700 11px sans-serif;color:#fff;background:#0B2545;border:2px solid #fff;border-radius:6px;padding:2px 6px;white-space:nowrap;box-shadow:0 2px 6px rgba(11,37,69,.3)}
.tm.d{background:#F7931E;color:#0B2545}.tm.b{background:#8394A8}
${capasCss}</style></head><body><div id="m"></div><script>
var d=${data};
var map=L.map('m',{zoomControl:false,attributionControl:true});
${capasJs()}
var pts=[];
if(d.center){L.marker(d.center,{icon:L.divIcon({className:'',html:'<div class="pin"></div>',iconSize:[22,22],iconAnchor:[11,11]})}).addTo(map);pts.push(d.center);}
if(d.me){L.marker(d.me,{icon:L.divIcon({className:'',html:'<div class="me"></div>',iconSize:[16,16],iconAnchor:[8,8]})}).addTo(map);pts.push(d.me);}
(d.markers||[]).forEach(function(t){
  if(t.kind==='alert'){L.circleMarker([t.lat,t.lng],{radius:t.r||10,color:'#fff',weight:2,fillColor:t.color,fillOpacity:.95}).addTo(map).bindPopup('<b>'+t.label+'</b>'+(t.sub?'<br>'+t.sub:''));}
  else{var c=t.kind==='team-d'?'tm d':t.kind==='team-b'?'tm b':'tm';
    L.marker([t.lat,t.lng],{icon:L.divIcon({className:'',html:'<div class="'+c+'">'+t.label+'</div>',iconSize:null,iconAnchor:[20,10]})}).addTo(map);
    if(t.kind==='team-d'&&d.center)L.polyline([[t.lat,t.lng],d.center],{color:'#F7931E',weight:4,dashArray:'8 6'}).addTo(map);}
  pts.push([t.lat,t.lng]);
});
if(d.fit&&pts.length>1)map.fitBounds(pts,{padding:[30,30],maxZoom:15});else if(pts.length)map.setView(pts[0],d.zoom);else map.setView([-16.6,-64.6],5);
</script></body></html>`;
  }, [key]);

  return (
    <View style={[{ height, backgroundColor: '#E6EEF7', overflow: 'hidden' }, style]}>
      <WebView originWhitelist={['*']} source={{ html }} style={{ flex: 1, backgroundColor: C.fondo }} javaScriptEnabled domStorageEnabled scrollEnabled={false} onMessage={(e) => recordarCapa(e.nativeEvent.data)} />
    </View>
  );
}
