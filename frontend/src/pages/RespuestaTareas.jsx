import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon';
import { api } from '../api/client';
import { useApi, useAction } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { LevelBadge, Loading, Empty, StatusChip, Bar, Seg } from '../components/ui';
import { EventMap } from '../components/MapView';
import PhotoViewer from '../components/PhotoViewer';
import { fShort, num } from '../utils/format';

/**
 * Tareas que el COEN / VIDECI asignan a la institución de primera respuesta: ver el evento,
 * reportar avance (con foto) y movilizar sus unidades, vehículos, equipamiento, personal y material.
 */
const EV = ['tarea:nueva', 'tarea:actualizada', 'evento:actualizado'];
const COLOR = { Completada: 'var(--verde)', Vencida: 'var(--roja)', 'En curso': 'var(--azul-600)', Pendiente: 'var(--naranja-600)' };
const TIPOS = {
  unidad: { label: 'Unidad', icon: 'emergency_share' },
  vehiculo: { label: 'Vehículo', icon: 'fire_truck' },
  equipamiento: { label: 'Equipamiento', icon: 'construction' },
  personal: { label: 'Personal', icon: 'badge' },
  material: { label: 'Material', icon: 'inventory_2' }
};
const vencida = (t) => t.estado !== 'Completada' && new Date(t.plazo) < new Date();

function Avance({ t, onSaved }) {
  const toast = useToast();
  const { busy, run } = useAction(toast);
  const [val, setVal] = useState(t.avance);
  const [obs, setObs] = useState('');
  const [foto, setFoto] = useState(null);
  const enviar = () => {
    const fd = new FormData();
    fd.append('avance', String(val));
    if (obs.trim()) fd.append('observacion', obs.trim());
    if (foto) fd.append('fotos', foto);
    return run(async () => (await api.post(`/respuesta/tareas/${t.id}/avance`, fd)).data,
      (r) => (r.estado === 'Completada' ? `Tarea ${t.codigo} completada. Los recursos movilizados quedaron disponibles.` : `Avance de ${t.codigo} registrado (${val} %).`))
      .then((r) => { if (r) { setObs(''); setFoto(null); onSaved(); } });
  };
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 12, flexWrap: 'nowrap' }}>
        <input type="range" min={0} max={100} step={5} value={val} onChange={(e) => setVal(Number(e.target.value))} style={{ flex: 1, accentColor: 'var(--azul-600)' }} aria-label="Porcentaje de avance" />
        <b className="mono" style={{ fontSize: 20, minWidth: 64, textAlign: 'right' }}>{val} %</b>
      </div>
      <div className="row" style={{ gap: 6 }}>
        {[25, 50, 75, 100].map((p) => (
          <button key={p} type="button" className={`btn xs ${val === p ? 'secondary' : 'outline'}`} onClick={() => setVal(p)}>{p === 100 ? 'Completada' : `${p} %`}</button>
        ))}
      </div>
      <label className="field"><span>Qué se hizo / situación en terreno</span>
        <textarea className="textarea" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Se instalaron 2 motobombas en el barrio Pompeya; 40 familias evacuadas…" />
      </label>
      <div className="row" style={{ gap: 10 }}>
        <label className="btn xs outline" style={{ cursor: 'pointer' }}>
          <Icon name="add_a_photo" size={18} />{foto ? 'Cambiar foto' : 'Adjuntar foto'}
          <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => setFoto(e.target.files[0] || null)} />
        </label>
        {foto && <span className="muted" style={{ fontSize: 13 }}>{foto.name} <button type="button" className="link-btn" onClick={() => setFoto(null)}>quitar</button></span>}
        <div className="spacer" />
        <button className="btn sm primary" disabled={busy || (val === t.avance && !obs.trim() && !foto)} onClick={enviar}><Icon name="send" size={18} />Registrar avance</button>
      </div>
    </div>
  );
}

function Movilizar({ t, onSaved }) {
  const toast = useToast();
  const { busy, run } = useAction(toast);
  const [tipo, setTipo] = useState('unidad');
  const [ref, setRef] = useState('');
  const [cant, setCant] = useState(1);
  const [desc, setDesc] = useState('');
  const [unidad, setUnidad] = useState('');
  const ops = t.disponibles[tipo] || [];
  const sel = ops.find((o) => String(o.id) === ref);
  const max = tipo === 'equipamiento' ? sel?.disponible || 0 : Infinity;
  const valido = tipo === 'material' ? desc.trim() && cant >= 1 : sel && !sel.ocupado && cant >= 1 && cant <= max;
  const cambiarTipo = (k) => { setTipo(k); setRef(''); setCant(1); };
  const enviar = () => run(() => api.post(`/respuesta/tareas/${t.id}/recursos`, tipo === 'material'
    ? { tipo, descripcion: desc, cantidad: cant, unidad }
    : { tipo, ref_id: Number(ref), cantidad: cant }), 'Recurso movilizado. El COEN lo ve en el evento.')
    .then((r) => { if (r) { setRef(''); setCant(1); setDesc(''); setUnidad(''); onSaved(); } });

  return (
    <div className="stack" style={{ gap: 10 }}>
      <Seg value={tipo} onChange={cambiarTipo} options={Object.entries(TIPOS).map(([k, v]) => ({ value: k, label: v.label }))} />
      {tipo === 'material' ? (
        <div className="form-grid">
          <label className="field"><span>Material o insumo</span><input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Agua para extinción, sacos de arena, raciones…" maxLength={150} /></label>
          <div className="row" style={{ gap: 8, flexWrap: 'nowrap', alignItems: 'flex-end' }}>
            <label className="field" style={{ flex: 1 }}><span>Cantidad</span><input className="input" type="number" min={1} value={cant} onChange={(e) => setCant(Number(e.target.value))} /></label>
            <label className="field" style={{ flex: 1 }}><span>Unidad</span><input className="input" value={unidad} onChange={(e) => setUnidad(e.target.value)} placeholder="litros, sacos…" maxLength={30} /></label>
          </div>
        </div>
      ) : !ops.length ? (
        <div className="note info"><Icon name="info" />Su institución no tiene {TIPOS[tipo].label.toLowerCase()}s registrados. Regístrelos en el menú de Primera respuesta.</div>
      ) : (
        <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: '1 1 260px' }}><span>{TIPOS[tipo].label}</span>
            <select className="select" value={ref} onChange={(e) => { setRef(e.target.value); setCant(1); }}>
              <option value="">Seleccione…</option>
              {ops.map((o) => (
                <option key={o.id} value={o.id} disabled={!!o.ocupado || (tipo === 'equipamiento' && o.disponible < 1)}>
                  {o.label}{tipo === 'equipamiento' ? ` · ${num(o.disponible)} de ${num(o.total)} ${o.unidad} disponibles` : o.ocupado ? ` · ${/^T-/.test(o.ocupado) ? `en ${o.ocupado}` : o.ocupado}` : ''}
                </option>
              ))}
            </select>
          </label>
          {tipo === 'equipamiento' && sel && (
            <label className="field" style={{ width: 150 }}><span>Cantidad (máx. {num(max)})</span><input className="input" type="number" min={1} max={max} value={cant} onChange={(e) => setCant(Number(e.target.value))} /></label>
          )}
        </div>
      )}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn sm primary" disabled={busy || !valido} onClick={enviar}><Icon name="add_task" size={18} />Movilizar a la tarea</button>
      </div>
    </div>
  );
}

function Detalle({ id, onChanged }) {
  const { data: t, reload } = useApi(id ? `/respuesta/tareas/${id}` : null, EV);
  const { can } = useAuth();
  const toast = useToast();
  const { busy, run } = useAction(toast);
  const [visor, setVisor] = useState(null);
  if (!id) return <Empty icon="assignment" title="Seleccione una tarea" text="Las tareas que el COEN o VIDECI asignan a su institución aparecen aquí." />;
  if (!t) return <Loading />;
  const ev = t.evento;
  const abierta = t.estado !== 'Completada' && t.evento_estado === 'En curso';
  const atiende = can('respuesta.atender') && abierta;
  const listo = () => { reload(); onChanged(); };
  const activos = t.recursos.filter((x) => x.estado === 'Movilizado');
  const fotos = t.avances.filter((a) => a.foto).map((a) => a.foto);

  return (
    <div className="stack" style={{ gap: 0 }}>
      <div className="tarea-head">
        <div className="sb" style={{ alignItems: 'flex-start', gap: 12 }}>
          <div className="stack" style={{ gap: 4, minWidth: 0 }}>
            <span className="mono muted" style={{ fontSize: 12 }}>{t.codigo} · asignada {fShort(t.created_at)}</span>
            <b style={{ fontSize: 19, lineHeight: 1.3 }}>{t.titulo}</b>
          </div>
          <StatusChip estado={t.estado} />
        </div>
        <Bar pct={t.avance} color={COLOR[t.estado]} />
        <div className="row muted" style={{ fontSize: 13, gap: 14 }}>
          <span><b className="mono" style={{ color: 'var(--tinta)' }}>{t.avance} %</b> de avance</span>
          <span style={{ color: vencida(t) ? 'var(--roja)' : undefined, fontWeight: vencida(t) ? 700 : 400 }}><Icon name="schedule" size={15} /> Plazo {fShort(t.plazo)}{vencida(t) ? ' · vencido' : ''}</span>
          {t.responsable && <span><Icon name="person" size={15} /> {t.responsable}</span>}
        </div>
      </div>

      {ev && (
        <div className="tarea-sec">
          <div className="sb" style={{ gap: 8 }}>
            <span className="tarea-sec-t">EVENTO</span>
            <LevelBadge nivel={ev.nivel} small />
          </div>
          <b style={{ fontSize: 15 }}>{ev.codigo} · {ev.titulo}</b>
          <span className="muted" style={{ fontSize: 13 }}><Icon name="location_on" size={15} /> {ev.lugar} · {ev.departamento}{ev.impacto ? ` · ${ev.impacto}` : ''}{ev.ubicacion_aprox ? ' · ubicación aproximada' : ''}</span>
          {ev.estado === 'Cerrado' && <div className="note info"><Icon name="lock" />El COEN cerró este evento. La tarea queda como registro.</div>}
          <EventMap evento={ev} height={230} />
        </div>
      )}

      {atiende && (
        <div className="tarea-sec">
          <span className="tarea-sec-t">REGISTRAR AVANCE</span>
          <Avance key={`${t.id}-${t.avance}`} t={t} onSaved={listo} />
        </div>
      )}

      <div className="tarea-sec">
        <div className="sb"><span className="tarea-sec-t">RECURSOS MOVILIZADOS · {activos.length} EN TERRENO</span></div>
        {t.recursos.length ? (
          <div className="stack" style={{ gap: 6 }}>
            {t.recursos.map((x) => (
              <div key={x.id} className={`mov-row ${x.estado === 'Retornado' ? 'off' : ''}`}>
                <span className="mov-ic"><Icon name={TIPOS[x.tipo].icon} size={18} /></span>
                <div className="stack" style={{ gap: 1, minWidth: 0, flex: 1 }}>
                  <b style={{ fontSize: 14 }}>{x.tipo === 'equipamiento' || x.tipo === 'material' ? `${num(x.cantidad)} ${x.unidad || ''} · ` : ''}{x.descripcion}</b>
                  <small className="muted">{TIPOS[x.tipo].label} · {x.usuario} · {fShort(x.fecha)}{x.fecha_retorno ? ` → retornó ${fShort(x.fecha_retorno)}` : ''}</small>
                </div>
                {x.estado === 'Movilizado' && can('respuesta.atender')
                  ? <button className="btn xs outline" disabled={busy} onClick={() => run(() => api.post(`/respuesta/tareas/recursos/${x.id}/retornar`), `${x.descripcion} retornó a base.`).then((r) => r && listo())}>Retornar</button>
                  : <span className="chip soft" style={{ height: 24 }}>{x.estado}</span>}
              </div>
            ))}
          </div>
        ) : <span className="muted" style={{ fontSize: 13 }}>Aún no se registraron recursos para esta tarea.</span>}
        {atiende && <div style={{ borderTop: '1px dashed var(--borde)', paddingTop: 12, marginTop: 4 }}><Movilizar t={t} onSaved={listo} /></div>}
      </div>

      <div className="tarea-sec">
        <span className="tarea-sec-t">HISTORIAL DE AVANCE</span>
        {t.avances.length ? t.avances.map((a) => (
          <div key={a.id} className="sb" style={{ alignItems: 'flex-start', gap: 12, paddingBottom: 10, borderBottom: '1px solid var(--fondo)' }}>
            <div className="stack" style={{ gap: 2, minWidth: 0 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{a.usuario}</span>
              <span className="muted" style={{ fontSize: 13 }}>{a.observacion || '—'}</span>
              {a.foto && <button type="button" className="link-btn" onClick={() => setVisor(fotos.indexOf(a.foto))}><Icon name="photo" size={16} />Ver foto</button>}
            </div>
            <div className="stack" style={{ alignItems: 'flex-end', gap: 2 }}><b className="mono">{a.avance} %</b><span className="muted mono" style={{ fontSize: 12 }}>{fShort(a.fecha)}</span></div>
          </div>
        )) : <span className="muted" style={{ fontSize: 13 }}>Sin reportes de avance aún.</span>}
      </div>
      {visor !== null && <PhotoViewer fotos={fotos} index={visor} titulo={t.titulo} subtitulo={t.codigo} onClose={() => setVisor(null)} />}
    </div>
  );
}

export default function RespuestaTareas() {
  const { data, reload } = useApi('/respuesta/tareas', EV);
  const [params, setParams] = useSearchParams();
  const [vista, setVista] = useState('activas');
  if (!data) return <Loading />;
  const activas = data.filter((t) => t.estado !== 'Completada' && t.evento_estado === 'En curso');
  const lista = vista === 'activas' ? activas : data;
  const selId = params.get('sel') || lista[0]?.id;
  const pendientes = data.filter((t) => t.estado === 'Pendiente' && t.evento_estado === 'En curso').length;
  const vencidas = activas.filter(vencida).length;

  return (
    <div className="stack" style={{ gap: 16 }}>
      {pendientes > 0 && <div className="note warn"><Icon name="assignment_late" /><b>{pendientes} tarea{pendientes > 1 ? 's' : ''} sin iniciar.</b>&nbsp;Registre el avance y los recursos que moviliza para que el COEN vea la respuesta.</div>}
      {vencidas > 0 && <div className="note err"><Icon name="schedule" /><b>{vencidas} tarea{vencidas > 1 ? 's' : ''} con el plazo vencido.</b></div>}
      <Seg value={vista} onChange={setVista} options={[
        { value: 'activas', label: `Activas · ${activas.length}` },
        { value: 'todas', label: `Todas · ${data.length}` }
      ]} />
      <div className="split">
        <div className="card list-pane">
          {lista.length ? lista.map((t) => (
            <button key={t.id} className={`sel-row ${String(t.id) === String(selId) ? 'on' : ''}`} onClick={() => setParams({ sel: t.id })}>
              <div className="sb"><span className="mono muted" style={{ fontSize: 12 }}>{t.codigo} · {t.evento_codigo}</span><LevelBadge nivel={t.nivel} small /></div>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{t.titulo}</span>
              <span className="muted" style={{ fontSize: 13 }}><Icon name={t.icono} size={15} /> {t.evento_titulo}</span>
              <Bar pct={t.avance} color={COLOR[t.estado]} thin />
              <div className="sb" style={{ flexWrap: 'wrap' }}>
                <span className="muted" style={{ fontSize: 12, color: vencida(t) ? 'var(--roja)' : undefined }}>{t.avance} % · plazo {fShort(t.plazo)}{t.recursos_movilizados ? ` · ${t.recursos_movilizados} recurso(s)` : ''}</span>
                <StatusChip estado={t.estado} />
              </div>
            </button>
          )) : <Empty icon="task_alt" title="Sin tareas" text={vista === 'activas' ? 'No hay tareas activas para su institución.' : 'Aún no se asignaron tareas a su institución.'} />}
        </div>
        <div className="card detail-pane">
          <Detalle id={lista.some((t) => String(t.id) === String(selId)) ? selId : null} onChanged={reload} />
        </div>
      </div>
    </div>
  );
}
