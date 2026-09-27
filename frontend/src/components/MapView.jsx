import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Circle, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
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

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Marcador de institución con su ícono (naranja para primera respuesta). */
export const instIcon = (inst, large = false) => L.divIcon({
  className: '',
  html: `<div class="inst-marker ${inst.tipo === 'Primera respuesta' ? 'pr' : ''} ${large ? 'lg' : ''}" title="${esc(inst.sigla)}"><span class="icon">${esc(inst.icono || 'apartment')}</span></div>`,
  iconSize: large ? [38, 38] : [30, 30],
  iconAnchor: large ? [19, 19] : [15, 15]
});

/** Mapa de situación: puntos por nivel de alerta y, opcionalmente, instituciones con su ícono. */
export function SituationMap({ points = [], instituciones = [], onSelect, height = 480 }) {
  const [verInst, setVerInst] = useState(true);
  const pts = points.filter((p) => p.lat != null);
  return (
    <div style={{ position: 'relative' }}>
      <MapContainer center={BOLIVIA} zoom={5} className="map" style={{ height }} scrollWheelZoom>
        <TileLayer url={TILE_URL} attribution={TILE_ATTR} maxZoom={18} />
        {verInst && instituciones.map((i) => (
          <Marker key={`inst-${i.id}`} position={[Number(i.lat), Number(i.lng)]} icon={instIcon(i)} zIndexOffset={-100}>
            <Popup>
              <b>{i.sigla} · {i.nombre}</b>
              {i.tipo}{i.sede ? ` · ${i.sede}` : ''}{i.municipio ? `, ${i.municipio}` : ''}
              {i.tipo === 'Primera respuesta' && <><br />{i.unidades_disponibles} unidad(es) disponible(s) · jurisdicción {i.radio_km} km</>}
            </Popup>
          </Marker>
        ))}
        {pts.map((p, i) => (
          <CircleMarker key={`${p.codigo || p.titulo}-${i}`} center={[p.lat, p.lng]} radius={radius[p.nivel] || 7}
            pathOptions={{ color: '#fff', weight: 2, fillColor: LV[p.nivel]?.hex || '#2E9E5B', fillOpacity: 0.95 }}
            eventHandlers={onSelect && p.id ? { click: () => onSelect(p) } : undefined}>
            <Popup><b>{p.titulo}</b>{p.detalle}</Popup>
          </CircleMarker>
        ))}
        <FitBounds points={pts.map((p) => [p.lat, p.lng])} maxZoom={7} />
      </MapContainer>
      <div className="legend" style={{ flexWrap: 'wrap' }}>
        {['verde', 'amarilla', 'naranja', 'roja'].map((l) => (
          <span key={l}><i className="dot" style={{ background: LV[l].hex, width: 10, height: 10 }} />{l[0].toUpperCase() + l.slice(1)}</span>
        ))}
        {instituciones.length > 0 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input type="checkbox" checked={verInst} onChange={(e) => setVerInst(e.target.checked)} style={{ margin: 0 }} />Instituciones ({instituciones.length})
          </label>
        )}
      </div>
    </div>
  );
}

function ClickToPick({ onPick }) {
  useMapEvents({ click: (e) => onPick([e.latlng.lat, e.latlng.lng]) });
  return null;
}

function Recenter({ center, zoom }) {
  const map = useMap();
  const key = center ? center.join(',') : '';
  useEffect(() => {
    if (center) map.setView(center, Math.max(map.getZoom(), zoom));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

/**
 * Selector de ubicación: clic en el mapa o arrastre del marcador para fijar las coordenadas.
 * Muestra el radio de jurisdicción y las demás instituciones como referencia.
 */
export function LocationPicker({ value, onChange, icon, radiusKm, others = [], height = 340, focus }) {
  const pos = value?.lat != null && value?.lng != null && value.lat !== '' && value.lng !== '' ? [Number(value.lat), Number(value.lng)] : null;
  const pick = ([lat, lng]) => onChange({ lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 });
  return (
    <MapContainer center={pos || BOLIVIA} zoom={pos ? 13 : 5} className="map sm map-pick" style={{ height }} scrollWheelZoom>
      <TileLayer url={TILE_URL} attribution={TILE_ATTR} maxZoom={18} />
      <ClickToPick onPick={pick} />
      {others.filter((o) => o.lat != null).map((o) => (
        <Marker key={`o-${o.id}`} position={[Number(o.lat), Number(o.lng)]} icon={instIcon(o)} opacity={0.55}>
          <Popup><b>{o.sigla}</b>{o.nombre}</Popup>
        </Marker>
      ))}
      {pos && radiusKm > 0 && radiusKm <= 500 && <Circle center={pos} radius={radiusKm * 1000} pathOptions={{ color: '#1170B8', weight: 1, fillOpacity: 0.06 }} />}
      {pos && (
        <Marker position={pos} icon={icon || pinIcon} draggable zIndexOffset={1000}
          eventHandlers={{ dragend: (e) => { const ll = e.target.getLatLng(); pick([ll.lat, ll.lng]); } }} />
      )}
      <Recenter center={focus} zoom={14} />
    </MapContainer>
  );
}

const pinIcon = L.divIcon({ className: '', html: '<div class="pin-report"></div>', iconSize: [22, 22], iconAnchor: [11, 11] });
const teamIcon = (t) => L.divIcon({
  className: '',
  html: `<div class="team-marker ${t.despachado ? 'd' : t.ocupado ? 'b' : ''}">${t.codigo}</div>`,
  iconSize: null,
  iconAnchor: [20, 10]
});

const reportIcon = (e, sel) => L.divIcon({
  className: '',
  html: `<div class="pin-report ${e.mio && e.estado !== 'Atendido' ? 'mine' : ''} ${e.estado === 'Atendido' ? 'done' : ''} ${sel ? '' : 'sm'}"></div>`,
  iconSize: sel ? [22, 22] : [16, 16],
  iconAnchor: sel ? [11, 11] : [8, 8]
});

/** Jurisdicción de una institución de primera respuesta: su sede, radio, unidades y emergencias cercanas. */
export function JurisdictionMap({ institucion, unidades = [], emergencias = [], selId, onSelect, height = 420 }) {
  const sede = institucion?.lat != null ? [Number(institucion.lat), Number(institucion.lng)] : null;
  const pts = [
    ...(sede ? [sede] : []),
    ...emergencias.map((e) => [Number(e.lat), Number(e.lng)]),
    ...unidades.filter((u) => u.lat != null).map((u) => [Number(u.lat), Number(u.lng)])
  ];
  return (
    <MapContainer center={sede || BOLIVIA} zoom={sede ? 11 : 5} className="map" style={{ height }} scrollWheelZoom>
      <TileLayer url={TILE_URL} attribution={TILE_ATTR} maxZoom={18} />
      {sede && institucion.radio_km <= 500 && <Circle center={sede} radius={institucion.radio_km * 1000} pathOptions={{ color: '#1170B8', weight: 1, fillOpacity: 0.05, dashArray: '6 6' }} />}
      {sede && (
        <Marker position={sede} icon={instIcon(institucion, true)} zIndexOffset={-50}>
          <Popup><b>{institucion.sigla} · {institucion.nombre}</b>{institucion.sede || ''} · jurisdicción {institucion.radio_km} km</Popup>
        </Marker>
      )}
      {unidades.filter((u) => u.lat != null).map((u) => (
        <Marker key={`u-${u.id}`} position={[Number(u.lat), Number(u.lng)]} icon={teamIcon({ codigo: u.codigo, ocupado: u.estado !== 'Disponible' })}>
          <Popup><b>{u.codigo} · {u.nombre}</b>{u.estado}</Popup>
        </Marker>
      ))}
      {emergencias.map((e) => (
        <Marker key={`e-${e.id}`} position={[Number(e.lat), Number(e.lng)]} icon={reportIcon(e, String(e.id) === String(selId))}
          zIndexOffset={String(e.id) === String(selId) ? 900 : e.mio ? 500 : 0}
          eventHandlers={onSelect ? { click: () => onSelect(e) } : undefined}>
          <Popup><b>{e.codigo} · {e.titulo}</b>{e.lugar}</Popup>
        </Marker>
      ))}
      <FitBounds points={pts} maxZoom={13} padding={36} />
    </MapContainer>
  );
}

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
