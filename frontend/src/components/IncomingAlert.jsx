import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from './Icon';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getSocket } from '../api/socket';
import { LV, PR } from '../utils/constants';
import { dec, fTime } from '../utils/format';
import { audioBlocked, ensureAudio, startAlarm, unlockAudio } from '../utils/siren';

const URGENTE = (nivel) => ['roja', 'naranja'].includes(nivel);

/** Traduce cada evento del socket a la ficha que muestra el modal. */
function ficha(tipo, d, can) {
  if (tipo === 'alerta' || tipo === 'recibida') {
    const lv = LV[d.nivel] || LV.amarilla;
    return {
      color: lv, icon: lv.icon, sonido: URGENTE(d.nivel) ? 'critica' : 'alerta',
      kicker: tipo === 'alerta' ? `NUEVA ALERTA ${lv.label} · PROPUESTA DEL MOTOR IA` : `ALERTA ${lv.label} NOTIFICADA A SU INSTITUCIÓN`,
      titulo: d.amenaza, lugar: d.lugar,
      meta: [d.codigo, d.probabilidad != null && `Probabilidad ${dec(d.probabilidad)}`, d.horizonte && `Horizonte ${d.horizonte}`],
      accion: can('alertas.ver') && { label: tipo === 'alerta' ? 'Revisar y validar' : 'Ver alerta', icon: 'fact_check', to: `/alertas?sel=${d.id}` }
    };
  }
  const pr = PR[d.prioridad] || PR.MEDIA;
  if (tipo === 'reporte') {
    return {
      color: pr, icon: d.icono || 'sos', sonido: d.prioridad === 'CRÍTICA' ? 'critica' : 'alerta',
      kicker: `EMERGENCIA CIUDADANA · PRIORIDAD ${pr.label}`,
      titulo: d.titulo, lugar: [d.lugar, d.departamento].filter(Boolean).join(' · '), riesgo: d.personas_riesgo,
      meta: [d.codigo],
      accion: { label: 'Atender reporte', icon: 'support_agent', to: `/ciudadanos?sel=${d.id}` }
    };
  }
  // mision: despacho del COEN a una unidad de la institución de primera respuesta
  return {
    color: pr, icon: 'notifications_active', sonido: 'despacho',
    kicker: `DESPACHO DEL COEN · UNIDAD ${d.equipo} · PRIORIDAD ${pr.label}`,
    titulo: d.titulo, lugar: d.lugar, riesgo: d.personas_riesgo,
    meta: [d.reporte, d.eta_min != null && `ETA ${d.eta_min} min`, d.distancia_km != null && `${dec(d.distancia_km, 1)} km`],
    accion: can('respuesta.ver') && { label: 'Ver emergencia', icon: 'emergency', to: `/respuesta/emergencias${d.reporte_id ? `?sel=${d.reporte_id}` : ''}` }
  };
}

/**
 * Aviso a pantalla completa con sirena para eventos que exigen acción inmediata:
 *  - COEN: nuevas alertas del motor IA y reportes ciudadanos de emergencia.
 *  - Primera respuesta: despachos del COEN a sus unidades y alertas notificadas a su institución.
 * Los avisos se encolan; la sirena suena hasta que el operador los atiende o la silencia.
 */
export default function IncomingAlert() {
  const { can } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [cola, setCola] = useState([]);
  const [mudo, setMudo] = useState(false);
  const [, refrescar] = useState(0);

  useEffect(() => unlockAudio(), []);

  const push = useCallback((tipo, d) => {
    const key = `${tipo}:${d.despacho_id ?? d.id ?? d.codigo}`;
    setCola((c) => (c.some((x) => x.key === key) ? c : [...c, { key, tipo, d, at: new Date() }]));
    setMudo(false); // una alerta nueva vuelve a sonar aunque la anterior se haya silenciado
  }, []);

  useEffect(() => {
    const s = getSocket();
    if (!s) return undefined;
    const esRespuesta = can('respuesta.ver', 'rescate.misiones');
    const h = {
      'alerta:nueva': (a) => push('alerta', a),
      'reporte:nuevo': (r) => push('reporte', r),
      'mision:nueva': (m) => (esRespuesta ? push('mision', m) : toast(`Nuevo despacho ${m.reporte} para ${m.equipo}: ${m.titulo} · prioridad ${m.prioridad}`)),
      'alerta:recibida': (a) => (esRespuesta ? push('recibida', a) : toast(`Alerta ${a.codigo} recibida por su institución: ${a.amenaza} · ${a.lugar}`))
    };
    Object.entries(h).forEach(([ev, fn]) => s.on(ev, fn));
    return () => Object.entries(h).forEach(([ev, fn]) => s.off(ev, fn));
  }, [can, push, toast]);

  const actual = cola[0];
  const f = actual && ficha(actual.tipo, actual.d, can);

  // Sirena mientras haya avisos pendientes; cambia de patrón según el aviso en pantalla.
  useEffect(() => {
    if (!f || mudo) return undefined;
    return startAlarm(f.sonido);
  }, [actual?.key, mudo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Parpadeo del título de la pestaña si el operador está en otra ventana.
  useEffect(() => {
    if (!cola.length) return undefined;
    const base = document.title;
    let on = false;
    const t = setInterval(() => { on = !on; document.title = on ? `🔴 (${cola.length}) ALERTA · SADE-IA` : base; }, 1000);
    return () => { clearInterval(t); document.title = base; };
  }, [cola.length]);

  const cerrar = useCallback(() => setCola((c) => c.slice(1)), []);

  useEffect(() => {
    if (!actual) return undefined;
    const k = (e) => e.key === 'Escape' && cerrar();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [actual, cerrar]);

  if (!f) return null;
  const urgente = f.sonido !== 'alerta';
  const meta = f.meta.filter(Boolean);

  return (
    <div className={`ia-back ${urgente ? 'urgente' : ''}`} style={{ '--ia-c': f.color.bg }}>
      <div className="ia-card" role="alertdialog" aria-modal="true" aria-labelledby="ia-titulo" aria-describedby="ia-lugar">
        <div className="ia-band" style={{ background: f.color.bg, color: f.color.fg }}>
          <div className="ia-ring" style={{ color: f.color.fg }}><Icon name={f.icon} size={34} /></div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <span className="ia-kicker">{f.kicker}</span>
            <h2 id="ia-titulo">{f.titulo}</h2>
          </div>
          <button className="ia-mute" style={{ color: f.color.fg }} onClick={() => setMudo((m) => !m)} title={mudo ? 'Activar sonido' : 'Silenciar'} aria-label={mudo ? 'Activar sonido' : 'Silenciar'}>
            <Icon name={mudo ? 'volume_off' : 'volume_up'} />
          </button>
        </div>
        <div className="ia-body">
          {f.lugar && <p id="ia-lugar" className="ia-lugar"><Icon name="location_on" color="var(--azul-700)" />{f.lugar}</p>}
          {f.riesgo && <div className="note err"><Icon name="person_alert" /><b>Personas en riesgo vital</b></div>}
          <div className="ia-meta">
            {meta.map((m) => <span key={m} className="mono">{m}</span>)}
            <span className="mono muted">Recibido {fTime(actual.at, true)}</span>
          </div>
          {!mudo && audioBlocked() && (
            <button className="ia-audio" onClick={() => { ensureAudio(); setTimeout(() => refrescar((n) => n + 1), 100); }}>
              <Icon name="volume_up" size={18} />El navegador bloqueó el sonido · clic aquí para activarlo
            </button>
          )}
        </div>
        <div className="ia-foot">
          {cola.length > 1 && <span className="ia-count">1 de {cola.length} avisos</span>}
          <span className="spacer" />
          <button className="btn outline" onClick={cerrar}>Enterado</button>
          {f.accion && (
            <button className="btn primary" autoFocus onClick={() => { cerrar(); nav(f.accion.to); }}>
              <Icon name={f.accion.icon} size={20} />{f.accion.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
