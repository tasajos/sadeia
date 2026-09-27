import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon';
import { api, download } from '../api/client';
import { useApi, useAction } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useDialog } from '../context/DialogContext';
import { PageHead, LevelBadge, Loading, Empty, Modal, StatusChip, Bar, Seg } from '../components/ui';
import { EventMap, eventIcon } from '../components/MapView';
import { UbicacionField } from '../components/Pickers';
import { NuevaTarea } from './Coordinacion';
import { DEPARTAMENTOS, LV } from '../utils/constants';
import { dec, fShort, num } from '../utils/format';

const EV = ['evento:nuevo', 'evento:actualizado', 'tarea:actualizada', 'tarea:nueva', 'recurso:actualizado', 'reporte:nuevo'];
const DEC = {
  Aprobada: ['#E4F4EA', '#1E6B3E', 'task_alt', 'Tarea generada (CU-08)'],
  Modificada: ['#FEF3E7', '#B85A0E', 'edit', 'Original y versión modificada conservadas'],
  Descartada: ['#EEF3F8', '#4A5A6E', 'block', 'Registrada en bitácora']
};
const MOV_ICON = { unidad: 'emergency_share', vehiculo: 'fire_truck', equipamiento: 'construction', personal: 'badge', material: 'inventory_2' };
const TAREA_COLOR = { Completada: 'var(--verde)', Vencida: 'var(--roja)', 'En curso': 'var(--azul-600)', Pendiente: 'var(--naranja-600)' };
const HINT_MAPA = 'Busque el lugar, haga clic en el mapa o arrastre el marcador hasta el punto del evento.';

/* ------------------------------ Formularios ------------------------------ */

function NuevoEvento({ onClose, onDone }) {
  const { data: cat } = useApi('/admin/catalogos');
  const { data: alertas } = useApi('/alertas?estado=abiertas');
  const toast = useToast();
  const { busy, run } = useAction(toast);
  const [f, setF] = useState({ amenaza_id: '', departamento: 'Beni', lugar: '', nivel: 'amarilla', impacto: '', alerta_id: '', lat: '', lng: '', radio_km: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const desdeAlerta = (id) => {
    const a = alertas?.find((x) => String(x.id) === id);
    if (!a) return setF({ ...f, alerta_id: '' });
    const am = cat?.amenazas.find((x) => x.codigo === a.amenaza_codigo);
    setF({ ...f, alerta_id: id, amenaza_id: am?.id || '', departamento: a.departamento, lugar: a.lugar, nivel: a.nivel, lat: a.lat ?? '', lng: a.lng ?? '' });
  };
  const amenaza = cat?.amenazas.find((a) => String(a.id) === String(f.amenaza_id));
  const conPunto = f.lat !== '' && f.lng !== '';
  const submit = () => run(async () => (await api.post('/eventos', { ...f, alerta_id: f.alerta_id || null })).data,
    (r) => `Evento ${r.codigo} registrado con ${r.recomendaciones} cursos de acción recomendados.`).then((r) => r && onDone(r));

  return (
    <Modal large title="Registrar evento (CU-05)" onClose={onClose} footer={<>
      {!conPunto && <span className="muted" style={{ fontSize: 13, marginRight: 'auto' }}><Icon name="info" size={16} /> Sin punto en el mapa se usará el centro del departamento (aproximado).</span>}
      <button className="btn sm outline" onClick={onClose}>Cancelar</button>
      <button className="btn sm primary" disabled={busy || !f.amenaza_id || !f.lugar} onClick={submit}>Registrar evento</button>
    </>}>
      <label className="field"><span>A partir de la alerta (opcional)</span>
        <select className="select" value={f.alerta_id} onChange={(e) => desdeAlerta(e.target.value)}>
          <option value="">— Sin alerta asociada —</option>
          {alertas?.map((a) => <option key={a.id} value={a.id}>{a.codigo} · {a.amenaza} · {a.lugar}</option>)}
        </select>
      </label>
      <div className="form-grid">
        <label className="field"><span>Tipología (amenaza)</span>
          <select className="select" value={f.amenaza_id} onChange={set('amenaza_id')}>
            <option value="">Seleccione…</option>
            {cat?.amenazas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </label>
        <label className="field"><span>Severidad</span>
          <select className="select" value={f.nivel} onChange={set('nivel')}>
            {Object.keys(LV).map((l) => <option key={l} value={l}>{LV[l].label}</option>)}
          </select>
        </label>
        <label className="field"><span>Departamento</span>
          <select className="select" value={f.departamento} onChange={set('departamento')}>
            {DEPARTAMENTOS.map((d) => <option key={d}>{d}</option>)}
          </select>
        </label>
        <label className="field"><span>Ubicación territorial</span><input className="input" value={f.lugar} onChange={set('lugar')} placeholder="Municipio, comunidad o zona" /></label>
        <label className="field"><span>Impacto estimado</span><input className="input" value={f.impacto} onChange={set('impacto')} placeholder="≈ 3.400 familias expuestas" /></label>
        <label className="field"><span>Radio del área afectada (km, opcional)</span><input className="input" type="number" min="0.1" max="500" step="0.5" value={f.radio_km} onChange={set('radio_km')} placeholder="p. ej. 5" /></label>
      </div>
      <div className="field"><span>Punto del evento en el mapa</span>
        <UbicacionField lat={f.lat} lng={f.lng} onChange={(p) => setF((x) => ({ ...x, ...p }))} radiusKm={Number(f.radio_km) || 0}
          icon={eventIcon({ nivel: f.nivel, icono: amenaza?.icono }, true)} hint={HINT_MAPA} />
      </div>
    </Modal>
  );
}

function EditarEvento({ ev, onClose, onSaved }) {
  const toast = useToast();
  const { busy, run } = useAction(toast);
  const [f, setF] = useState({ nivel: ev.nivel, impacto: ev.impacto || '', lugar: ev.lugar, radio_km: ev.radio_km ?? '', lat: Number(ev.lat), lng: Number(ev.lng) });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const guardar = () => run(() => api.patch(`/eventos/${ev.id}`, f), 'Situación del evento actualizada.').then((r) => r && onSaved());
  return (
    <Modal large title={`Actualizar ${ev.codigo}`} onClose={onClose} footer={<>
      <button className="btn sm outline" onClick={onClose}>Cancelar</button>
      <button className="btn sm primary" disabled={busy || !f.lugar.trim()} onClick={guardar}>Guardar cambios</button>
    </>}>
      {ev.ubicacion_aprox && <div className="note warn"><Icon name="wrong_location" />La ubicación actual es aproximada (centro del departamento). Marque el punto exacto del evento.</div>}
      <div className="form-grid">
        <label className="field"><span>Severidad</span>
          <select className="select" value={f.nivel} onChange={set('nivel')}>{Object.keys(LV).map((l) => <option key={l} value={l}>{LV[l].label}</option>)}</select>
        </label>
        <label className="field"><span>Ubicación territorial</span><input className="input" value={f.lugar} onChange={set('lugar')} /></label>
        <label className="field"><span>Impacto estimado</span><input className="input" value={f.impacto} onChange={set('impacto')} placeholder="≈ 3.400 familias expuestas" /></label>
        <label className="field"><span>Radio del área afectada (km)</span><input className="input" type="number" min="0.1" max="500" step="0.5" value={f.radio_km} onChange={set('radio_km')} /></label>
      </div>
      <UbicacionField lat={f.lat} lng={f.lng} onChange={(p) => setF((x) => ({ ...x, ...p }))} radiusKm={Number(f.radio_km) || 0}
        icon={eventIcon({ nivel: f.nivel, icono: ev.icono }, true)} hint={HINT_MAPA} />
    </Modal>
  );
}

function ProponerAccion({ ev, onClose, onSaved }) {
  const { data: cat } = useApi('/admin/catalogos');
  const toast = useToast();
  const { busy, run } = useAction(toast);
  const [f, setF] = useState({ titulo: '', institucion_id: '', recursos: '', sustento: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title="Proponer curso de acción" onClose={onClose} footer={<>
      <button className="btn sm outline" onClick={onClose}>Cancelar</button>
      <button className="btn sm primary" disabled={busy || !f.titulo.trim() || !f.institucion_id}
        onClick={() => run(() => api.post(`/eventos/${ev.id}/recomendaciones`, f), 'Curso de acción agregado. Queda pendiente de decisión.').then((r) => r && onSaved())}>Agregar</button>
    </>}>
      <div className="note info"><Icon name="info" />La acción se suma a las recomendadas y queda <b>&nbsp;pendiente de decisión</b>. Al aprobarla se genera la tarea para la institución.</div>
      <label className="field"><span>Acción</span><textarea className="textarea" value={f.titulo} onChange={set('titulo')} placeholder="Instalar albergue temporal en la U.E. central" maxLength={200} /></label>
      <div className="form-grid">
        <label className="field"><span>Institución responsable</span>
          <select className="select" value={f.institucion_id} onChange={set('institucion_id')}>
            <option value="">Seleccione…</option>
            {cat?.instituciones.map((i) => <option key={i.id} value={i.id}>{i.sigla} · {i.nombre}</option>)}
          </select>
        </label>
        <label className="field"><span>Recursos requeridos</span><input className="input" value={f.recursos} onChange={set('recursos')} placeholder="50 carpas · 200 raciones" /></label>
      </div>
      <label className="field"><span>Justificación (opcional)</span><textarea className="textarea" value={f.sustento} onChange={set('sustento')} placeholder="Motivo o evidencia de campo" /></label>
    </Modal>
  );
}

function AsignarRecursos({ ev, onClose, onSaved }) {
  const { data: recursos } = useApi('/coordinacion/recursos');
  const toast = useToast();
  const { busy, run } = useAction(toast);
  const [rid, setRid] = useState('');
  const [cant, setCant] = useState(1);
  const disp = recursos?.filter((r) => r.disponibles > 0) || [];
  const r = disp.find((x) => String(x.id) === rid);
  return (
    <Modal title={`Comprometer recursos en ${ev.codigo}`} onClose={onClose} footer={<>
      <button className="btn sm outline" onClick={onClose}>Cancelar</button>
      <button className="btn sm primary" disabled={busy || !r || cant < 1 || cant > r.disponibles}
        onClick={() => run(() => api.post(`/coordinacion/recursos/${r.id}/asignar`, { evento_id: ev.id, cantidad: cant }), `${cant} ${r.unidad} de ${r.nombre} asignados al evento.`).then((x) => x && onSaved())}>Asignar</button>
    </>}>
      {!recursos ? <Loading /> : !disp.length ? <Empty icon="inventory_2" title="Sin recursos disponibles" text="Registre recursos en Coordinación." /> : (
        <>
          <label className="field"><span>Recurso</span>
            <select className="select" value={rid} onChange={(e) => { setRid(e.target.value); setCant(1); }}>
              <option value="">Seleccione…</option>
              {disp.map((x) => <option key={x.id} value={x.id}>{x.nombre} · {x.institucion} · {num(x.disponibles)} {x.unidad} disponibles</option>)}
            </select>
          </label>
          {r && <label className="field"><span>Cantidad (máx. {num(r.disponibles)} {r.unidad})</span><input className="input" type="number" min={1} max={r.disponibles} value={cant} onChange={(e) => setCant(Number(e.target.value))} /></label>}
        </>
      )}
    </Modal>
  );
}

/* ------------------------------ Ruta de gestión ------------------------------ */

/** Pasos del ciclo del evento y el siguiente paso según el estado y los permisos del usuario. */
function RutaGestion({ ev, can, acciones }) {
  const recs = ev.recomendaciones;
  const pend = recs.filter((r) => r.estado === 'Pendiente').length;
  const tareas = ev.tareas;
  const hechas = tareas.filter((t) => t.estado === 'Completada').length;
  const vencidas = tareas.filter((t) => t.estado === 'Vencida').length;
  const avance = tareas.length ? Math.round(tareas.reduce((s, t) => s + t.avance, 0) / tareas.length) : 0;
  const recAsig = ev.recursos.filter((x) => x.estado === 'Asignado').length;

  const pasos = [
    { t: 'Evento registrado', d: `${fShort(ev.fecha_inicio)}${ev.registrado_por ? ` · ${ev.registrado_por}` : ''}`, ok: !ev.ubicacion_aprox, warn: ev.ubicacion_aprox && 'Ubicación aproximada' },
    { t: 'Decidir cursos de acción', d: recs.length ? `${recs.length - pend} de ${recs.length} decididos` : 'Sin cursos de acción', ok: recs.length > 0 && pend === 0 },
    { t: 'Tareas en ejecución', d: tareas.length ? `${hechas} de ${tareas.length} completadas · ${avance} %` : 'Aún sin tareas', ok: tareas.length > 0 && hechas === tareas.length, warn: vencidas > 0 && `${vencidas} vencida(s)` },
    { t: 'Recursos comprometidos', d: recAsig ? `${recAsig} asignación(es)` : 'Ninguno aún', ok: recAsig > 0, opcional: true },
    { t: 'Cierre del evento', d: ev.estado === 'Cerrado' ? `Cerrado ${fShort(ev.fecha_cierre)}` : 'Libera recursos y genera el informe', ok: ev.estado === 'Cerrado' }
  ];
  const actual = pasos.findIndex((p) => !p.ok && !p.opcional);

  let sig;
  if (ev.estado === 'Cerrado') {
    sig = { icon: 'lock', tone: 'ok', txt: `Evento cerrado el ${fShort(ev.fecha_cierre)}. El informe de cierre en PDF reúne todas las tareas, decisiones y acciones realizadas.`, btn: ['Informe de cierre', 'picture_as_pdf', acciones.informe] };
  } else if (ev.ubicacion_aprox && can('eventos.gestionar')) {
    sig = { icon: 'wrong_location', tone: 'warn', txt: 'El evento está ubicado de forma aproximada en el centro del departamento. Marque el punto exacto para ubicarlo en los mapas y vincular reportes cercanos.', btn: ['Marcar ubicación', 'edit_location_alt', acciones.editar] };
  } else if (!recs.length) {
    sig = { icon: 'lightbulb', txt: 'No hay cursos de acción. Recalcule las recomendaciones o proponga una acción.', btn: can('eventos.gestionar') && ['Proponer acción', 'add', acciones.proponer] };
  } else if (pend && can('recomendaciones.decidir')) {
    sig = { icon: 'gavel', tone: 'warn', txt: `Hay ${pend} curso(s) de acción esperando su decisión. Apruebe, modifique o descarte cada uno: al aprobar se genera la tarea para la institución responsable.`, btn: ['Ir a decidir', 'arrow_downward', acciones.decidir] };
  } else if (pend) {
    sig = { icon: 'hourglass_top', tone: 'warn', txt: `${pend} curso(s) de acción esperan la decisión de un Decisor (p. ej. VIDECI). Mientras tanto puede proponer acciones, asignar tareas directas o comprometer recursos.`, btn: can('eventos.gestionar') && ['Proponer acción', 'add', acciones.proponer] };
  } else if (tareas.length && hechas < tareas.length) {
    sig = { icon: 'monitoring', txt: `Dé seguimiento a las tareas (${avance} % de avance promedio${vencidas ? `, ${vencidas} vencida(s)` : ''}). Las instituciones reportan su avance desde la app móvil o desde Coordinación.`, btn: ['Ver en Coordinación', 'hub', acciones.coordinacion] };
  } else if (tareas.length) {
    sig = { icon: 'task_alt', tone: 'ok', txt: 'Todas las tareas están completadas. Si la situación está controlada, cierre el evento para liberar los recursos.', btn: can('eventos.gestionar') && ['Cerrar evento', 'lock', acciones.cerrar] };
  } else {
    sig = { icon: 'assignment_add', txt: 'Los cursos de acción aprobados no generaron tareas. Asigne tareas directas a las instituciones.', btn: can('coordinacion.gestionar') && ['Asignar tarea', 'assignment_add', acciones.tarea] };
  }

  return (
    <div className="card">
      <div className="card-head" style={{ padding: '14px 20px' }}>
        <b>Ruta de gestión del evento</b>
        <small className="muted">¿Qué sigue?</small>
      </div>
      <ol className="evt-steps">
        {pasos.map((p, i) => (
          <li key={p.t} className={p.ok ? 'done' : i === actual ? 'now' : ''}>
            <span className="evt-dot">{p.ok ? <Icon name="check" size={16} /> : i + 1}</span>
            <b>{p.t}{p.opcional && <small> · opcional</small>}</b>
            <small>{p.d}</small>
            {p.warn && <small className="evt-warn"><Icon name="warning" size={14} />{p.warn}</small>}
          </li>
        ))}
      </ol>
      <div className={`note ${sig.tone || 'info'}`} style={{ margin: '0 20px 16px' }}>
        <Icon name={sig.icon} />
        <span style={{ flex: 1 }}><b>Siguiente paso: </b>{sig.txt}</span>
        {sig.btn && <button className="btn sm outline" style={{ flex: 'none' }} onClick={sig.btn[2]}><Icon name={sig.btn[1]} size={18} />{sig.btn[0]}</button>}
      </div>
    </div>
  );
}

/* ------------------------------ Página ------------------------------ */

export default function Eventos() {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const [vista, setVista] = useState('curso');
  const { data: todos, loading, reload: reloadList } = useApi(vista === 'curso' ? '/eventos' : '/eventos?estado=todos', EV);
  const list = vista === 'curso' ? todos : todos?.filter((e) => e.estado === 'Cerrado');
  const selId = params.get('sel') || list?.[0]?.id;
  const { data: ev, reload } = useApi(selId ? `/eventos/${selId}` : null, EV);
  const { can } = useAuth();
  const toast = useToast();
  const { busy, run } = useAction(toast);
  const { confirmar } = useDialog();
  const [modal, setModal] = useState(null); // 'nuevo' | 'editar' | 'accion' | 'tarea' | 'recursos'
  const [modif, setModif] = useState(null);
  const [texto, setTexto] = useState('');

  const decidir = (rc, decision, extra = {}) => run(async () => (await api.post(`/eventos/recomendaciones/${rc.id}/decidir`, { decision, ...extra })).data, (r) =>
    decision === 'aprobada' ? `Recomendación aprobada. Tarea ${r.tarea} generada y asignada a ${r.institucion}.`
      : decision === 'modificada' ? `Recomendación modificada. Tarea ${r.tarea} generada; se conserva la versión original.`
        : decision === 'descartada' ? 'Recomendación descartada y registrada en bitácora.' : 'Decisión revertida.').then(reload);
  const informe = () => run(() => download(`/eventos/${ev.id}/informe`, null, `informe-${ev.codigo}.pdf`, 'get'), 'Informe PDF descargado.');
  const cerrar = async () => {
    const pendientes = ev.tareas.filter((t) => t.estado !== 'Completada').length;
    const r = await confirmar({
      titulo: `¿Cerrar ${ev.codigo}?`,
      tono: 'peligro',
      confirmar: 'Cerrar y generar informe',
      mensaje: `Se liberarán los recursos asignados y los movilizados por las instituciones, y se generará el informe de cierre en PDF con todas las tareas y acciones realizadas.`,
      detalle: pendientes ? `Atención: ${pendientes} tarea(s) no están completadas; quedarán registradas con su avance actual.` : undefined,
      campo: { label: 'Observación de cierre', opcional: true, placeholder: 'Situación controlada; población retornó a sus viviendas…' }
    });
    if (!r) return;
    const ok = await run(() => api.post(`/eventos/${ev.id}/cerrar`, { observacion: r.valor }), `${ev.codigo} cerrado. Descargando el informe de cierre…`);
    if (!ok) return;
    await run(() => download(`/eventos/${ev.id}/informe`, null, `informe-cierre-${ev.codigo}.pdf`, 'get'));
    reload();
    reloadList();
  };
  const listo = () => { setModal(null); reload(); reloadList(); };

  const decisor = can('recomendaciones.decidir');
  const gestiona = can('eventos.gestionar');
  const recs = ev?.recomendaciones || [];
  const nDec = recs.filter((r) => r.estado !== 'Pendiente').length;
  const acciones = {
    editar: () => setModal('editar'),
    proponer: () => setModal('accion'),
    tarea: () => setModal('tarea'),
    cerrar,
    informe,
    coordinacion: () => nav('/coordinacion'),
    decidir: () => document.getElementById('cursos-accion')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  };

  return (
    <div className="page">
      <PageHead kicker="CU-05 · CU-06 · RF-08 · RF-09" title="Eventos y apoyo a la decisión">
        <Seg value={vista} onChange={(v) => { setVista(v); setParams({}); }} options={[{ value: 'curso', label: 'En curso' }, { value: 'cerrados', label: 'Cerrados' }]} />
        {gestiona && <button className="btn sm outline" onClick={() => setModal('nuevo')}><Icon name="add" />Registrar evento</button>}
      </PageHead>

      {loading && !list ? <Loading /> : (
        <div className="grid-kpi" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {list?.map((e) => (
            <button key={e.id} className={`hazard-card ${String(e.id) === String(selId) ? 'on' : ''}`} onClick={() => setParams({ sel: e.id })}>
              <div className="sb"><span className="mono muted" style={{ fontSize: 12 }}>{e.codigo}</span><LevelBadge nivel={e.nivel} small /></div>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{e.titulo}</span>
              <span className="muted" style={{ fontSize: 13 }}>{e.estado === 'Cerrado' ? `Cerrado ${fShort(e.fecha_cierre)}` : `Desde ${fShort(e.fecha_inicio)}`} · {e.impacto || 'impacto en evaluación'}</span>
              {e.ubicacion_aprox && <span className="evt-warn"><Icon name="wrong_location" size={14} />Ubicación aproximada</span>}
            </button>
          ))}
          {!list?.length && <Empty icon="emergency_home" title={vista === 'curso' ? 'Sin eventos en curso' : 'Sin eventos cerrados'} />}
        </div>
      )}

      {ev && (
        <>
          <div className="card">
            <div className="card-head" style={{ padding: '16px 20px', alignItems: 'flex-start' }}>
              <div className="row" style={{ gap: 14, flexWrap: 'nowrap', minWidth: 0 }}>
                <div className="evt-head-ic" style={{ background: LV[ev.nivel]?.bg, color: LV[ev.nivel]?.fg }}><Icon name={ev.icono || 'emergency_home'} size={26} /></div>
                <div className="stack" style={{ gap: 4, minWidth: 0 }}>
                  <span className="mono muted" style={{ fontSize: 12 }}>{ev.codigo}{ev.alerta_codigo ? ` · desde ${ev.alerta_codigo}` : ''}</span>
                  <b style={{ fontSize: 20 }}>{ev.titulo}</b>
                  <div className="row" style={{ gap: 8 }}>
                    <LevelBadge nivel={ev.nivel} small />
                    <span className="muted" style={{ fontSize: 13 }}><Icon name="location_on" size={15} /> {ev.lugar} · {ev.departamento}{ev.radio_km ? ` · radio ${dec(ev.radio_km, 1)} km` : ''}</span>
                  </div>
                </div>
              </div>
              <div className="row">
                <button className="btn xs outline" disabled={busy} onClick={informe} title={ev.estado === 'En curso' ? 'Informe de situación a la fecha' : 'Informe de cierre'}><Icon name="picture_as_pdf" size={18} />{ev.estado === 'En curso' ? 'Informe PDF' : 'Informe de cierre'}</button>
                {gestiona && ev.estado === 'En curso' && <button className="btn xs outline" onClick={() => setModal('editar')}><Icon name="edit_note" size={18} />Actualizar situación</button>}
                {gestiona && ev.estado === 'En curso' && <button className="btn xs danger" disabled={busy} onClick={cerrar}><Icon name="lock" size={18} />Cerrar evento</button>}
              </div>
            </div>
            <div className="evt-facts">
              <div><span>Amenaza</span><b>{ev.amenaza}</b></div>
              <div><span>Inicio</span><b className="mono">{fShort(ev.fecha_inicio)}</b></div>
              <div><span>Impacto estimado</span><b>{ev.impacto || 'En evaluación'}</b></div>
              <div><span>Registrado por</span><b>{ev.registrado_por || '—'}</b></div>
              {ev.estado === 'Cerrado' && <div><span>Cierre</span><b className="mono">{fShort(ev.fecha_cierre)}</b></div>}
            </div>
          </div>

          <RutaGestion ev={ev} can={can} acciones={acciones} />

          <div className="two-col evt-cols">
            <div className="card" style={{ overflow: 'hidden' }}>
              <div className="card-head" style={{ padding: '14px 20px' }}>
                <b>Mapa del evento</b>
                <small className="muted">{ev.reportes.length} reporte(s) ciudadano(s) vinculados · {new Set(ev.tareas.map((t) => t.institucion_id)).size} institución(es) con tareas</small>
              </div>
              <EventMap evento={ev} reportes={ev.reportes} tareas={ev.tareas} height={400} />
            </div>
            <div className="card">
              <div className="card-head" style={{ padding: '14px 20px' }}>
                <b>Tareas del evento</b>
                {can('coordinacion.gestionar') && ev.estado === 'En curso' && (
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn xs outline" onClick={() => setModal('tarea')}><Icon name="assignment_add" size={18} />Tarea</button>
                    <button className="btn xs outline" onClick={() => setModal('recursos')}><Icon name="inventory_2" size={18} />Recursos</button>
                  </div>
                )}
              </div>
              <div style={{ maxHeight: 400, overflow: 'auto' }}>
                {ev.tareas.length ? ev.tareas.map((t) => (
                  <div key={t.id} className="evt-task">
                    <div className="sb" style={{ gap: 8, alignItems: 'flex-start' }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{t.titulo}</span>
                      <StatusChip estado={t.estado} />
                    </div>
                    <Bar pct={t.avance} color={TAREA_COLOR[t.estado]} thin />
                    <small className="muted"><span className="mono">{t.codigo}</span> · {t.sigla} · {t.avance} % · plazo {fShort(t.plazo)}</small>
                    {t.movilizados?.some((x) => x.estado === 'Movilizado') && (
                      <div className="row" style={{ gap: 4 }}>
                        {t.movilizados.filter((x) => x.estado === 'Movilizado').map((x) => (
                          <span key={x.id} className="chip soft" style={{ height: 22, fontSize: 11 }}><Icon name={MOV_ICON[x.tipo]} size={13} />{x.tipo === 'equipamiento' || x.tipo === 'material' ? `${x.cantidad} ${x.unidad || ''} ` : ''}{x.descripcion}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )) : <Empty icon="assignment" title="Sin tareas aún" text="Se generan al aprobar un curso de acción, o puede asignarlas directamente." />}
              </div>
              {ev.recursos?.length > 0 && (
                <div className="card-body stack" style={{ borderTop: '1px solid var(--borde)', gap: 8 }}>
                  <b style={{ fontSize: 14 }}>Recursos comprometidos</b>
                  <div className="row">
                    {ev.recursos.map((x) => <span key={x.id} className="chip blue" style={{ opacity: x.estado === 'Liberado' ? 0.5 : 1 }}><Icon name="inventory_2" />{x.cantidad} {x.nombre} · {x.sigla}{x.estado === 'Liberado' ? ' (liberado)' : ''}</span>)}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="card" id="cursos-accion">
            <div className="card-head" style={{ padding: '16px 20px' }}>
              <div className="stack" style={{ gap: 2 }}>
                <b style={{ fontSize: 18 }}>Cursos de acción recomendados</b>
                <small>{ev.titulo} · ordenados por prioridad · {ev.usa_protocolo ? 'protocolo normado' : `motor IA${ev.alerta_codigo ? ' · evidencia de ' + ev.alerta_codigo : ''}`}</small>
              </div>
              <div className="row">
                <span className="muted" style={{ fontSize: 13 }}>{nDec} de {recs.length} decididas</span>
                {gestiona && ev.estado === 'En curso' && <button className="btn xs outline" onClick={() => setModal('accion')}><Icon name="add" size={18} />Proponer acción</button>}
                {gestiona && ev.estado === 'En curso' && <button className="btn xs outline" disabled={busy} onClick={() => run(() => api.post(`/eventos/${ev.id}/recomendaciones/generar`), 'Recomendaciones pendientes recalculadas con la evidencia actual.').then(reload)}><Icon name="neurology" size={18} />Recalcular</button>}
              </div>
            </div>
            {ev.usa_protocolo && (
              <div className="note warn" style={{ margin: '16px 20px 0' }}><Icon name="menu_book" />Datos históricos insuficientes para este tipo de evento. Se aplica el protocolo normado (flujo 3.a).</div>
            )}
            {!decisor && recs.some((r) => r.estado === 'Pendiente') && (
              <div className="note info" style={{ margin: '16px 20px 0' }}><Icon name="gavel" />Su rol puede proponer acciones; la aprobación corresponde a un usuario con rol <b>&nbsp;Decisor</b>.</div>
            )}
            {recs.length ? recs.map((r) => {
              const d = DEC[r.estado];
              return (
                <div key={r.id} className="rec" style={{ background: r.estado === 'Descartada' ? '#FAFBFD' : '#fff' }}>
                  <div className="rec-n">{r.orden}</div>
                  <div className="stack" style={{ gap: 8, minWidth: 0 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, textDecoration: r.estado === 'Modificada' ? 'line-through' : 'none', color: r.estado === 'Modificada' ? 'var(--texto3)' : undefined }}>{r.titulo}</span>
                    {r.titulo_modificado && <span style={{ fontSize: 16, fontWeight: 700 }}><Icon name="edit" size={16} color="var(--naranja-700)" /> {r.titulo_modificado}</span>}
                    <span className="muted" style={{ fontSize: 14, lineHeight: 1.55 }}>{r.sustento}</span>
                    <div className="row">
                      <span className="chip blue" style={{ height: 26 }}><Icon name="apartment" />{r.instituciones}</span>
                      {r.recursos && <span className="chip blue" style={{ height: 26 }}><Icon name="inventory_2" />{r.recursos}</span>}
                      <span className="chip soft" style={{ height: 26 }}>confianza {r.confianza != null ? dec(r.confianza) : 'protocolo / COEN'}</span>
                    </div>
                  </div>
                  <div className="stack" style={{ alignItems: 'flex-end', gap: 6 }}>
                    {r.estado === 'Pendiente' && decisor && ev.estado === 'En curso' && (
                      <div className="row" style={{ gap: 6 }}>
                        <button className="btn sm primary" disabled={busy} onClick={() => decidir(r, 'aprobada')}>Aprobar</button>
                        <button className="btn sm outline" disabled={busy} onClick={() => { setModif(r); setTexto(r.titulo); }}>Modificar</button>
                        <button className="btn sm danger icon-only" title="Descartar" disabled={busy} onClick={() => decidir(r, 'descartada')}><Icon name="close" /></button>
                      </div>
                    )}
                    {r.estado === 'Pendiente' && !decisor && <StatusChip estado="Pendiente">Pendiente de decisión</StatusChip>}
                    {d && (
                      <>
                        <div className="row">
                          <span className="chip" style={{ height: 28, background: d[0], color: d[1], fontSize: 13, fontWeight: 700 }}><Icon name={d[2]} />{r.estado}</span>
                          {decisor && ev.estado === 'En curso' && <button className="btn ghost" onClick={() => decidir(r, 'deshacer')}>Deshacer</button>}
                        </div>
                        <span className="muted" style={{ fontSize: 12 }}>{r.tarea_codigo ? `Tarea ${r.tarea_codigo} · ` : ''}{d[3]}</span>
                        {r.decidido_por_nombre && <span className="muted" style={{ fontSize: 12 }}>{r.decidido_por_nombre} · {fShort(r.fecha_decision)}</span>}
                      </>
                    )}
                  </div>
                </div>
              );
            }) : <Empty icon="lightbulb" title="Sin recomendaciones" text="Use “Recalcular” o “Proponer acción”." />}
          </div>
        </>
      )}

      {modal === 'nuevo' && <NuevoEvento onClose={() => setModal(null)} onDone={(r) => { setModal(null); reloadList(); setParams({ sel: r.id }); }} />}
      {modal === 'editar' && ev && <EditarEvento ev={ev} onClose={() => setModal(null)} onSaved={listo} />}
      {modal === 'accion' && ev && <ProponerAccion ev={ev} onClose={() => setModal(null)} onSaved={listo} />}
      {modal === 'tarea' && ev && <NuevaTarea eventoId={ev.id} onClose={() => setModal(null)} onSaved={listo} />}
      {modal === 'recursos' && ev && <AsignarRecursos ev={ev} onClose={() => setModal(null)} onSaved={listo} />}
      {modif && (
        <Modal title="Modificar curso de acción" onClose={() => setModif(null)} footer={<>
          <button className="btn sm outline" onClick={() => setModif(null)}>Cancelar</button>
          <button className="btn sm primary" disabled={busy || !texto.trim()} onClick={() => decidir(modif, 'modificada', { titulo_modificado: texto }).then(() => setModif(null))}>Guardar y generar tarea</button>
        </>}>
          <div className="note info"><Icon name="info" />La recomendación original se conserva en el registro junto con su versión modificada.</div>
          <label className="field"><span>Acción modificada</span><textarea className="textarea" value={texto} onChange={(e) => setTexto(e.target.value)} /></label>
        </Modal>
      )}
    </div>
  );
}
