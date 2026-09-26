import { useState } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler } from 'chart.js';
import Icon from '../components/Icon';
import { api } from '../api/client';
import { useApi, useAction } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { PageHead, Kpi, Loading, Empty, Modal } from '../components/ui';
import { FUENTE_COLOR } from '../utils/constants';
import { ago, dec, fTime, fShort } from '../utils/format';

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler);

const EV = ['ingesta:lote'];
const SERIES = [
  { m: 'Trinidad', v: 'nivel_rio', l: 'Nivel del río Mamoré · Trinidad (m)' },
  { m: 'San Ignacio de Velasco', v: 'focos_calor_24h', l: 'Focos de calor · San Ignacio de Velasco' },
  { m: 'Mecapaca', v: 'saturacion_suelo', l: 'Saturación del suelo · Mecapaca (%)' },
  { m: 'Altiplano', v: 'temp_min', l: 'Temperatura mínima · Oruro (°C)' },
  { m: 'Riberalta', v: 'nivel_rio', l: 'Nivel del río Beni · Riberalta (m)' }
];

function NuevaFuente({ onClose, onSaved }) {
  const { data: cat } = useApi('/admin/catalogos');
  const toast = useToast();
  const { busy, run } = useAction(toast);
  const [f, setF] = useState({ nombre: '', institucion_id: '', adaptador: 'API REST', url: '', periodicidad_min: 15 });
  const [key, setKey] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  if (key) {
    return (
      <Modal title="Fuente registrada" onClose={onSaved} footer={<button className="btn sm primary" onClick={onSaved}>Entendido</button>}>
        <div className="note ok"><Icon name="task_alt" />La fuente quedó registrada. Guarde la clave: no se volverá a mostrar.</div>
        <label className="field"><span>Clave de ingesta (cabecera x-api-key)</span><input className="input mono" readOnly value={key} onFocus={(e) => e.target.select()} /></label>
        <span className="hint">Envíe lecturas con <span className="mono">POST /api/datos/ingesta</span> y esta clave.</span>
      </Modal>
    );
  }
  return (
    <Modal title="Registrar fuente de datos (CU-01)" onClose={onClose} footer={<>
      <button className="btn sm outline" onClick={onClose}>Cancelar</button>
      <button className="btn sm primary" disabled={busy || !f.nombre || !f.institucion_id} onClick={() => run(async () => (await api.post('/datos/fuentes', f)).data, 'Fuente registrada.').then((r) => r && setKey(r.api_key))}>Registrar</button>
    </>}>
      <label className="field"><span>Nombre</span><input className="input" value={f.nombre} onChange={set('nombre')} placeholder="Red hidrométrica del Pilcomayo" /></label>
      <div className="form-grid">
        <label className="field"><span>Institución</span><select className="select" value={f.institucion_id} onChange={set('institucion_id')}><option value="">Seleccione…</option>{cat?.instituciones.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}</select></label>
        <label className="field"><span>Adaptador</span><select className="select" value={f.adaptador} onChange={set('adaptador')}>{['API REST', 'SFTP / CSV', 'Formulario', 'MQTT'].map((a) => <option key={a}>{a}</option>)}</select></label>
        <label className="field"><span>Periodicidad (min)</span><input className="input" type="number" min={1} value={f.periodicidad_min} onChange={set('periodicidad_min')} /></label>
      </div>
      <label className="field"><span>URL (para sincronización programada)</span><input className="input" value={f.url} onChange={set('url')} placeholder="https://api.senamhi.gob.bo/lecturas" /></label>
    </Modal>
  );
}

function CargaManual({ fuentes, onClose, onSaved }) {
  const toast = useToast();
  const { busy, run } = useAction(toast);
  const [fuente, setFuente] = useState(fuentes[0]?.id || '');
  const [txt, setTxt] = useState('estacion;departamento;municipio;lat;lng;variable;valor\nEst. Puerto Varador (río Mamoré);Beni;Trinidad;-14.833;-64.9;nivel_rio;8.95');
  const [res, setRes] = useState(null);
  const parse = () => {
    const [h, ...ls] = txt.trim().split(/\r?\n/);
    const cols = h.split(/[;,\t]/).map((c) => c.trim());
    return ls.filter(Boolean).map((l) => Object.fromEntries(l.split(/[;\t]/).map((v, i) => [cols[i], v.trim()])));
  };
  return (
    <Modal title="Carga manual de lecturas" onClose={onClose} footer={<>
      <button className="btn sm outline" onClick={onClose}>Cerrar</button>
      <button className="btn sm primary" disabled={busy} onClick={() => run(async () => (await api.post('/datos/ingesta', { fuente_id: fuente, lecturas: parse() })).data, (r) => `${r.aceptadas} lecturas aceptadas, ${r.descartadas} descartadas.`).then((r) => { if (r) { setRes(r); onSaved(); } })}>Validar e ingerir</button>
    </>}>
      <label className="field"><span>Fuente</span><select className="select" value={fuente} onChange={(e) => setFuente(e.target.value)}>{fuentes.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select></label>
      <label className="field"><span>Lecturas (CSV separado por “;”)</span><textarea className="textarea mono" style={{ minHeight: 140, fontSize: 13 }} value={txt} onChange={(e) => setTxt(e.target.value)} /></label>
      <span className="hint">Variables: nivel_rio, precip_72h, precip_24h, humedad_suelo, tendencia_nivel, focos_calor_24h, dias_sin_lluvia, viento, saturacion_suelo, pendiente_talud, temp_min, temperatura, nubosidad, cape, reflectividad, spi3, deficit_precip.</span>
      {res && (
        <div className="note info" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          <b>{res.aceptadas} aceptadas · {res.descartadas} descartadas</b>
          {res.detalleDescartes.map((d, i) => <span key={i} className="mono" style={{ fontSize: 12 }}>{d.estacion} · {d.variable}={String(d.valor)} → {d.motivo}</span>)}
          {res.evaluaciones.filter((e) => e.alerta).map((e, i) => <span key={i}>Motor IA: {e.alerta} {e.nueva ? '(nueva propuesta)' : 'actualizada'} · {e.prediccion.nivel.toUpperCase()} · p={dec(e.prediccion.probabilidad)}</span>)}
        </div>
      )}
    </Modal>
  );
}

export default function Fuentes() {
  const { data: kpis, reload: rk } = useApi('/datos/fuentes/kpis', EV);
  const { data: fuentes, loading, reload } = useApi('/datos/fuentes', EV);
  const { data: desc, reload: rd } = useApi('/datos/lecturas/descartadas', EV);
  const [serie, setSerie] = useState(0);
  const s = SERIES[serie];
  const { data: lect } = useApi(`/datos/lecturas?municipio=${encodeURIComponent(s.m)}&variable=${s.v}&horas=72`, EV);
  const { can } = useAuth();
  const toast = useToast();
  const { busy, run } = useAction(toast);
  const [nueva, setNueva] = useState(false);
  const [manual, setManual] = useState(false);
  const all = () => { rk(); reload(); rd(); };

  return (
    <div className="page">
      <PageHead kicker="CU-01 · RF-01 · RF-02" title="Ingesta e integración de datos">
        {can('fuentes.gestionar') && <button className="btn sm outline" onClick={() => setManual(true)}><Icon name="upload" />Carga manual</button>}
        {can('fuentes.gestionar') && <button className="btn primary" onClick={() => setNueva(true)}><Icon name="add" />Registrar fuente</button>}
      </PageHead>
      <div className="grid-kpi">{kpis?.map((k) => <Kpi key={k.label} label={k.label} value={k.value} mono />)}</div>

      <div className="card table-wrap">
        {loading && !fuentes ? <Loading /> : (
          <table className="t" style={{ minWidth: 900 }}>
            <thead><tr><th>FUENTE</th><th>ADAPTADOR</th><th>PERIODO</th><th>ÚLTIMA SINCR.</th><th>CALIDAD</th><th>ESTADO</th>{can('fuentes.gestionar') && <th />}</tr></thead>
            <tbody>
              {fuentes?.map((f) => (
                <tr key={f.id}>
                  <td><div className="stack" style={{ gap: 2 }}><span style={{ fontWeight: 600 }}>{f.nombre}</span><span className="muted" style={{ fontSize: 12 }}>{f.institucion}</span></div></td>
                  <td className="mono" style={{ fontSize: 12 }}>{f.adaptador}</td>
                  <td className="mono" style={{ fontSize: 13 }}>{f.periodicidad_min >= 1440 ? 'Diaria' : f.periodicidad_min >= 60 ? `${f.periodicidad_min / 60} h` : `${f.periodicidad_min} min`}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{ago(f.ultima_sinc)}</td>
                  <td className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{f.calidad != null ? `${dec(f.calidad, 1)} %` : '—'}</td>
                  <td><span className="status-dot" style={{ color: FUENTE_COLOR[f.estado] }} title={f.ultimo_error || ''}><i className="dot" style={{ background: FUENTE_COLOR[f.estado] }} />{f.estado}</span></td>
                  {can('fuentes.gestionar') && <td>{f.url && <button className="btn xs outline" disabled={busy} onClick={() => run(async () => (await api.post(`/datos/fuentes/${f.id}/sincronizar`)).data, (r) => r.error ? `Error: ${r.error}` : `Sincronizada: ${r.aceptadas} lecturas.`).then(all)}>Sincronizar</button>}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="auto-col">
        <div className="card">
          <div className="card-head"><b>Serie de lecturas · 72 h</b>
            <select className="select" style={{ height: 36, width: 'auto', fontSize: 13 }} value={serie} onChange={(e) => setSerie(Number(e.target.value))}>{SERIES.map((x, i) => <option key={i} value={i}>{x.l}</option>)}</select>
          </div>
          <div className="card-body">
            {lect?.length ? (
              <div className="chart-box">
                <Line data={{ labels: lect.map((l) => fShort(l.fecha_hora)), datasets: [{ data: lect.map((l) => l.valor), borderColor: '#1170B8', backgroundColor: 'rgba(76,155,214,.15)', fill: true, pointRadius: 0, tension: 0.3 }] }}
                  options={{ maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { maxTicksLimit: 6, font: { family: 'IBM Plex Mono', size: 11 } } }, y: { ticks: { font: { family: 'IBM Plex Mono', size: 11 } } } } }} />
              </div>
            ) : <Empty icon="show_chart" title="Sin lecturas en las últimas 72 h" />}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><b>Lecturas descartadas · 24 h</b><small>No superaron los criterios de calidad</small></div>
          {desc?.length ? desc.slice(0, 12).map((r) => (
            <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '60px minmax(0,1fr) auto', gap: 12, padding: '12px 18px', borderBottom: '1px solid var(--fondo)', alignItems: 'center' }}>
              <span className="mono muted" style={{ fontSize: 13 }}>{fTime(r.fecha_hora)}</span>
              <div className="stack" style={{ gap: 2 }}><span style={{ fontWeight: 600 }}>{r.estacion}</span><span className="mono muted" style={{ fontSize: 12 }}>{r.variable} = {r.valor_texto}</span></div>
              <span className="chip" style={{ background: 'var(--naranja-50)', color: 'var(--naranja-700)' }}>{r.motivo}</span>
            </div>
          )) : <Empty icon="verified" title="Sin descartes" />}
        </div>
      </div>
      {nueva && <NuevaFuente onClose={() => setNueva(false)} onSaved={() => { setNueva(false); all(); }} />}
      {manual && fuentes && <CargaManual fuentes={fuentes} onClose={() => setManual(false)} onSaved={all} />}
    </div>
  );
}
