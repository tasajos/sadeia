import { useState } from 'react';
import Icon from './Icon';
import { Modal } from './ui';
import { LocationPicker } from './MapView';

// Búsqueda de direcciones sobre OpenStreetMap (Nominatim). VITE_GEOCODER_URL=false la desactiva
// (redes aisladas); también puede apuntar a un Nominatim propio.
const GEOCODER = import.meta.env.VITE_GEOCODER_URL ?? 'https://nominatim.openstreetmap.org/search';

/** Grilla de íconos; los sugeridos para el tipo aparecen primero. */
export function IconPicker({ value, onChange, options, sugeridos }) {
  const [todos, setTodos] = useState(false);
  const orden = sugeridos ? [...options.filter((o) => sugeridos(o)), ...options.filter((o) => !sugeridos(o))] : options;
  const visibles = todos || !sugeridos ? orden : orden.filter((o) => sugeridos(o) || o.icono === value);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="icon-grid">
        {visibles.map((o) => (
          <button type="button" key={o.icono} className={`icon-opt ${value === o.icono ? 'on' : ''}`} onClick={() => onChange(o.icono)} title={o.label}>
            <Icon name={o.icono} />{o.label}
          </button>
        ))}
      </div>
      {sugeridos && visibles.length < orden.length && <button type="button" className="btn ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setTodos(true)}>Ver todos los íconos</button>}
    </div>
  );
}

/** Coordenadas con mapa: clic o arrastre del marcador, búsqueda de dirección o GPS del navegador. */
export function UbicacionField({ lat, lng, onChange, icon, radiusKm, others, hint = 'Haga clic en el mapa o arrastre el marcador para ubicar la sede.' }) {
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [focus, setFocus] = useState(null);
  const [error, setError] = useState('');

  const mover = (p) => { onChange(p); setFocus([p.lat, p.lng]); };
  const buscar = async () => {
    if (!texto.trim() || !GEOCODER || GEOCODER === 'false') return;
    setBuscando(true); setError('');
    try {
      const url = `${GEOCODER}?format=jsonv2&limit=5&countrycodes=bo&accept-language=es&q=${encodeURIComponent(texto)}`;
      const r = await fetch(url, { headers: { Accept: 'application/json' } });
      const data = await r.json();
      setResultados(data);
      if (data.length === 1) mover({ lat: Number(data[0].lat), lng: Number(data[0].lon) });
    } catch {
      setError('No se pudo consultar el buscador de direcciones. Ubique el punto directamente en el mapa.');
    } finally {
      setBuscando(false);
    }
  };
  const gps = () => {
    if (!navigator.geolocation) { setError('El navegador no permite obtener la ubicación.'); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => mover({ lat: Math.round(p.coords.latitude * 1e6) / 1e6, lng: Math.round(p.coords.longitude * 1e6) / 1e6 }),
      () => setError('No se obtuvo la ubicación del dispositivo.'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };
  const setCoord = (k) => (e) => {
    const p = { lat, lng, [k]: e.target.value === '' ? '' : Number(e.target.value) };
    onChange(p);
    // Coordenadas escritas a mano: centra el mapa en ellas
    if (p.lat !== '' && p.lng !== '' && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180) setFocus([Number(p.lat), Number(p.lng)]);
  };

  return (
    <div className="stack" style={{ gap: 10 }}>
      {GEOCODER && GEOCODER !== 'false' && (
        <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
          <input className="input" style={{ height: 38 }} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar dirección, lugar o municipio…"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscar(); } }} />
          <button type="button" className="btn xs outline" disabled={buscando} onClick={buscar}><Icon name="search" size={18} />{buscando ? 'Buscando…' : 'Buscar'}</button>
          <button type="button" className="btn xs outline" onClick={gps} title="Usar la ubicación de este dispositivo"><Icon name="my_location" size={18} /></button>
        </div>
      )}
      {resultados && resultados.length > 1 && (
        <div className="stack" style={{ gap: 4 }}>
          {resultados.map((x) => (
            <button type="button" key={x.place_id} className="btn ghost" style={{ justifyContent: 'flex-start', textAlign: 'left' }}
              onClick={() => { mover({ lat: Number(x.lat), lng: Number(x.lon) }); setResultados(null); }}>
              <Icon name="place" size={18} />{x.display_name}
            </button>
          ))}
        </div>
      )}
      {resultados && !resultados.length && <span className="hint">Sin resultados. Ubique el punto directamente en el mapa.</span>}
      {error && <span className="hint" style={{ color: 'var(--roja)' }}>{error}</span>}
      <LocationPicker value={{ lat, lng }} onChange={onChange} icon={icon} radiusKm={radiusKm} others={others} focus={focus} />
      <div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
        <label className="field" style={{ flex: 1 }}><span>Latitud</span><input className="input mono" style={{ height: 38 }} type="number" step="0.000001" value={lat ?? ''} onChange={setCoord('lat')} /></label>
        <label className="field" style={{ flex: 1 }}><span>Longitud</span><input className="input mono" style={{ height: 38 }} type="number" step="0.000001" value={lng ?? ''} onChange={setCoord('lng')} /></label>
      </div>
      <span className="hint">{hint}</span>
    </div>
  );
}

/** Contraseña temporal: se muestra una sola vez. */
export function TempPasswordModal({ username, password, onClose, children }) {
  return (
    <Modal title="Acceso creado" onClose={onClose} footer={<button className="btn sm primary" onClick={onClose}>Listo</button>}>
      {children}
      <div className="note warn"><Icon name="key" />Entregue estas credenciales por un canal seguro. La contraseña no se volverá a mostrar y el usuario deberá cambiarla en su primer ingreso.</div>
      {username && <label className="field"><span>Usuario</span><input className="input mono" readOnly value={username} /></label>}
      <label className="field"><span>Contraseña temporal</span><input className="input mono" readOnly value={password} onFocus={(e) => e.target.select()} /></label>
    </Modal>
  );
}
