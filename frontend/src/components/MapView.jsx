import { useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LV } from '../utils/constants';

/**
 * Cartografía libre (sin Google Maps): Leaflet + teselas OpenStreetMap o un servidor XYZ propio.
 * Configurable con VITE_TILE_URL para usar un tileserver institucional en producción.
 */
const TILE_URL = import.meta.env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTR = import.meta.env.VITE_TILE_ATTRIBUTION || '© OpenStreetMap contributors';
const BOLIVIA = [-16.6, -64.6];

function FitBounds({ points, maxZoom = 15, padding = 30 }) {
  const map = useMap();
  const key = JSON.stringify(points);
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) map.setView(points[0], maxZoom > 13 ? 14 : maxZoom);
    else map.fitBounds(points, { padding: [padding, padding], maxZoom });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

const radius = { roja: 13, naranja: 11, amarilla: 9, verde: 7 };

/** Mapa de situación: puntos por nivel de alerta. */
export function SituationMap({ points = [], onSelect, height = 480 }) {
  const pts = points.filter((p) => p.lat != null);
  return (
    <div style={{ position: 'relative' }}>
      <MapContainer center={BOLIVIA} zoom={5} className="map" style={{ height }} scrollWheelZoom>
        <TileLayer url={TILE_URL} attribution={TILE_ATTR} maxZoom={18} />
        {pts.map((p, i) => (
          <CircleMarker key={`${p.codigo || p.titulo}-${i}`} center={[p.lat, p.lng]} radius={radius[p.nivel] || 7}
            pathOptions={{ color: '#fff', weight: 2, fillColor: LV[p.nivel]?.hex || '#2E9E5B', fillOpacity: 0.95 }}
            eventHandlers={onSelect && p.id ? { click: () => onSelect(p) } : undefined}>
            <Popup><b>{p.titulo}</b>{p.detalle}</Popup>
          </CircleMarker>
        ))}
        <FitBounds points={pts.map((p) => [p.lat, p.lng])} maxZoom={7} />
      </MapContainer>
      <div className="legend">
        {['verde', 'amarilla', 'naranja', 'roja'].map((l) => (
          <span key={l}><i className="dot" style={{ background: LV[l].hex, width: 10, height: 10 }} />{l[0].toUpperCase() + l.slice(1)}</span>
        ))}
      </div>
    </div>
  );
}

const pinIcon = L.divIcon({ className: '', html: '<div class="pin-report"></div>', iconSize: [22, 22], iconAnchor: [11, 11] });
const teamIcon = (t) => L.divIcon({
  className: '',
  html: `<div class="team-marker ${t.despachado ? 'd' : t.ocupado ? 'b' : ''}">${t.codigo}</div>`,
  iconSize: null,
  iconAnchor: [20, 10]
});

/** Mapa de un reporte ciudadano con los equipos cercanos y la ruta del despachado. */
export function ReportMap({ point, teams = [], height = 300 }) {
  if (!point?.lat) return null;
  const p = [Number(point.lat), Number(point.lng)];
  const all = [p, ...teams.map((t) => [Number(t.lat), Number(t.lng)])];
  return (
    <MapContainer center={p} zoom={14} className="map sm" style={{ height }} scrollWheelZoom={false}>
      <TileLayer url={TILE_URL} attribution={TILE_ATTR} maxZoom={18} />
      <Marker position={p} icon={pinIcon} />
      {teams.map((t) => (
        <Marker key={t.codigo} position={[Number(t.lat), Number(t.lng)]} icon={teamIcon(t)}>
          <Popup><b>{t.codigo} · {t.nombre}</b>{t.institucion}</Popup>
        </Marker>
      ))}
      {teams.filter((t) => t.despachado).map((t) => (
        <Polyline key={`r-${t.codigo}`} positions={[[Number(t.lat), Number(t.lng)], p]} pathOptions={{ color: '#F7931E', weight: 4, dashArray: '8 6' }} />
      ))}
      <FitBounds points={all} padding={36} />
    </MapContainer>
  );
}
