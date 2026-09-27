/**
 * Capas base para los mapas Leaflet en WebView: callejero (OSM o tileserver propio) y satélite
 * (Esri World Imagery, libre con atribución); "Híbrido" agrega vías y nombres de lugares.
 * La elección se guarda en memoria para que no se pierda cuando el WebView se recarga.
 */
export const TILE = process.env.EXPO_PUBLIC_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

let capa = 'mapa';
export const capaActual = () => capa;

/** Procesa un mensaje del WebView; devuelve true si era un cambio de capa. */
export function recordarCapa(data) {
  try {
    const d = JSON.parse(data);
    if (d.capa) { capa = d.capa; return true; }
  } catch { /* mensaje ajeno */ }
  return false;
}

export const capasCss = `.capas{position:absolute;top:10px;right:10px;z-index:1000;display:flex;gap:2px;padding:3px;background:#fff;border-radius:10px;box-shadow:0 2px 10px rgba(11,37,69,.25)}
.capas button{height:30px;padding:0 10px;border:0;border-radius:7px;background:transparent;color:#4A5A6E;font:700 12px sans-serif}
.capas button.on{background:#0B2545;color:#fff}`;

/** JS que crea las capas y el selector; requiere una variable global `map` ya creada. */
export function capasJs() {
  const E = 'https://server.arcgisonline.com/ArcGIS/rest/services';
  return `(function(){
var o={maxZoom:19,maxNativeZoom:18};
var sat=L.tileLayer('${E}/World_Imagery/MapServer/tile/{z}/{y}/{x}',Object.assign({attribution:'Imágenes © Esri'},o));
var C={mapa:[L.tileLayer('${TILE}',Object.assign({attribution:'© OpenStreetMap'},o))],satelite:[sat],
hibrido:[sat,L.tileLayer('${E}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',o),L.tileLayer('${E}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',o)]};
var box=document.createElement('div');box.className='capas';
var N={mapa:'Mapa',satelite:'Satélite',hibrido:'Híbrido'};
function set(k,avisar){Object.keys(C).forEach(function(x){C[x].forEach(function(l){map.removeLayer(l);});});
C[k].forEach(function(l){l.addTo(map);});
Array.prototype.forEach.call(box.children,function(b){b.className=b.dataset.k===k?'on':'';});
if(avisar&&window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({capa:k}));}
Object.keys(N).forEach(function(k){var b=document.createElement('button');b.textContent=N[k];b.dataset.k=k;
b.onclick=function(e){e.stopPropagation();set(k,true);};box.appendChild(b);});
L.DomEvent.disableClickPropagation(box);document.body.appendChild(box);
set('${capa}',false);})();`;
}
