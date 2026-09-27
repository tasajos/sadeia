import { useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon';
import { api } from '../api/client';
import { useApi, useAction } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { PageHead, PriorityBadge, StatusChip, Loading, Empty, Modal, Seg, Card } from '../components/ui';
import { JurisdictionMap } from '../components/MapView';
import PhotoViewer from '../components/PhotoViewer';
import { IconPicker, UbicacionField, TempPasswordModal } from '../components/Pickers';
import { PR, ICONOS_INSTITUCION, ICONOS_ESPECIALIDAD, TIPOS_VEHICULO, CATEGORIAS_EQUIPAMIENTO } from '../utils/constants';
import { dec, fTime, fDateTime, lastAccess, initials, ago } from '../utils/format';

/**
 * Módulo de la institución de primera respuesta: cada institución ve y gestiona solo lo suyo
 * (emergencias en su jurisdicción, sus unidades, su personal y sus recursos).
 */
const TABS = {
  emergencias: { title: 'Emergencias despachadas', kicker: 'DESPACHOS EN SU JURISDICCIÓN' },
  unidades: { title: 'Unidades de respuesta', kicker: 'RECIBEN DESPACHOS DEL COEN' },
  usuarios: { title: 'Personal de la institución', kicker: 'USUARIOS Y ESPECIALIDADES' },
  vehiculos: { title: 'Vehículos de emergencia', kicker: 'PARQUE AUTOMOTOR' },
  equipamiento: { title: 'Equipamiento', kicker: 'EQUIPOS PARA ATENDER EMERGENCIAS' },
  especialidades: { title: 'Especialidades', kicker: 'CAPACIDADES DE LA INSTITUCIÓN' }
};

const EV_EMERG = ['mision:nueva', 'despacho:actualizado', 'informe:nuevo', 'equipo:ubicacion', 'reporte:actualizado'];
const opciones = (vals) => vals.map((v) => ({ value: v, label: v }));

/* ------------------------------ Emergencias ------------------------------ */
const SIGUIENTE = {
  Despachado: null,
  Aceptada: { label: 'Llegamos al sitio', icon: 'where_to_vote' },
  'En sitio': { label: 'Situación controlada', icon: 'task_alt' }
};

function DetalleEmergencia({ id, onChanged }) {
  const { data: e, reload } = useApi(id ? `/respuesta/emergencias/${id}` : null, EV_EMERG);
  const { can } = useAuth();
  const toast = useToast();
  const { busy, run } = useAction(toast);
  const [visor, setVisor] = useState(null);
  if (!id) return <Empty icon="e911_emergency" title="Seleccione una emergencia" text="Las emergencias despachadas a su institución aparecen primero." />;
  if (!e) return <Loading />;
  const pr = PR[e.prioridad] || PR.BAJA;
  const accion = (d, que, msg) => run(() => api.post(`/respuesta/despachos/${d.id}/${que}`), msg).then(() => { reload(); onChanged(); });
  const atender = can('respuesta.atender');
  return (
    <>
      <div className="sb" style={{ background: pr.bg, color: pr.fg, padding: '16px 22px', flexWrap: 'wrap' }}>
        <div className="row" style={{ gap: 12, flexWrap: 'nowrap' }}>
          <Icon name={e.icono} size={30} />
          <div className="stack" style={{ gap: 0 }}>
            <span style={{ fontWeight: 800, letterSpacing: '.08em', fontSize: 12 }}>PRIORIDAD {pr.label}</span>
            <span style={{ fontSize: 19, fontWeight: 700 }}>{e.titulo}</span>
          </div>
        </div>
        <span className="mono" style={{ fontSize: 14, fontWeight: 600 }}>{e.codigo}</span>
      </div>
      <div className="stack" style={{ padding: '18px 22px', gap: 18 }}>
        {!e.mio && <div className="note info"><Icon name="info" />Emergencia en su jurisdicción atendida por otra institución. Los datos del reportante solo los ve la institución despachada.</div>}
        <div className="stack" style={{ gap: 8 }}>
          <b style={{ fontSize: 15 }}>Despachos</b>
          {e.despachos.length ? e.despachos.map((d) => (
            <div key={d.id} className="sb" style={{ padding: '10px 12px', border: '1px solid var(--borde)', borderRadius: 10, background: d.mio ? '#FFFAF3' : '#fff', flexWrap: 'wrap' }}>
              <div className="stack" style={{ gap: 2 }}>
                <span style={{ fontWeight: 700 }}><span className="mono">{d.equipo}</span> · {d.equipo_nombre} <span className="muted" style={{ fontWeight: 400 }}>({d.institucion})</span></span>
                <span className="muted" style={{ fontSize: 12 }}>Despachado {fTime(d.fecha_despacho)} · {dec(d.distancia_km, 1)} km · ETA {d.eta_min ?? '—'} min</span>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <StatusChip estado={d.estado} />
                {d.mio && atender && d.estado === 'Despachado' && <>
                  <button className="btn xs primary" disabled={busy} onClick={() => accion(d, 'aceptar', `Misión aceptada: ${d.equipo} en camino.`)}><Icon name="check" size={18} />Aceptar</button>
                  <button className="btn xs danger" disabled={busy} onClick={() => window.confirm('¿Rechazar el despacho? El COEN deberá asignar otra unidad.') && accion(d, 'rechazar', 'Despacho rechazado.')}>Rechazar</button>
                </>}
                {d.mio && atender && SIGUIENTE[d.estado] && (
                  <button className="btn xs secondary" disabled={busy} onClick={() => accion(d, 'avanzar', `${d.equipo}: ${SIGUIENTE[d.estado].label.toLowerCase()}.`)}>
                    <Icon name={SIGUIENTE[d.estado].icon} size={18} />{SIGUIENTE[d.estado].label}
                  </button>
                )}
              </div>
            </div>
          )) : <span className="muted">Aún sin despacho del COEN.</span>}
        </div>
        <div className="stack facts" style={{ gap: 10 }}>
          <div><span>Lugar</span><span>{e.lugar || '—'}</span></div>
          <div><span>Coordenadas</span><span className="mono">{Number(e.lat).toFixed(5)}, {Number(e.lng).toFixed(5)}{e.ubicacion_origen === 'Manual' ? ' · marcada en el mapa' : e.precision_m ? ` · GPS ± ${e.precision_m} m` : ''}</span></div>
          <div><span>Recepción</span><span className="mono">{fDateTime(e.created_at)}</span></div>
          {e.mio && <div><span>Reportado por</span><span>{e.reportante}</span></div>}
          {e.mio && <div><span>Teléfono</span><span className="mono">{e.telefono_completo ? <a href={`tel:${e.telefono_completo}`}>{e.telefono_completo}</a> : '—'}</span></div>}
          {e.mio && <div><span>Personas en riesgo</span><span>{e.riesgo_detalle || (e.personas_riesgo ? 'Sí' : 'No reportado')}</span></div>}
        </div>
        {e.descripcion && <span style={{ fontSize: 15, lineHeight: 1.55, padding: '12px 14px', background: 'var(--azul-50)', borderRadius: 8 }}>“{e.descripcion}”</span>}
        {e.fotos?.length > 0 && (
          <div className="photos">
            {e.fotos.slice(0, 3).map((f, i) => <div key={f} className="photo"><button type="button" className="photo-btn" onClick={() => setVisor(i)} aria-label={`Ampliar foto ${i + 1}`}><img src={f} alt={`Foto ${i + 1}`} /></button></div>)}
          </div>
        )}
        {visor !== null && <PhotoViewer fotos={e.fotos} index={visor} titulo={e.titulo} subtitulo={e.codigo} onClose={() => setVisor(null)} />}
        <div className="row" style={{ gap: 10 }}>
          <a className="btn sm outline" href={`https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=%3B${e.lat}%2C${e.lng}`} target="_blank" rel="noreferrer"><Icon name="directions" size={18} />Ruta en OpenStreetMap</a>
        </div>
      </div>
    </>
  );
}

function Emergencias() {
  const { data, reload } = useApi('/respuesta/emergencias', EV_EMERG);
  const [params, setParams] = useSearchParams();
  const [vista, setVista] = useState('todas');
  if (!data) return <Loading />;
  const inst = data.institucion;
  const lista = data.emergencias.filter((e) => vista === 'todas' || (vista === 'mias' ? e.mio : e.despachos.length));
  const selId = params.get('sel') || lista[0]?.id;
  const pendientes = data.emergencias.filter((e) => e.despachos.some((d) => d.mio && d.estado === 'Despachado')).length;
  return (
    <div className="stack" style={{ gap: 16 }}>
      {inst.lat == null && <div className="note warn"><Icon name="wrong_location" />Su institución no tiene ubicación registrada: solo verá las emergencias despachadas a sus unidades. Solicite al administrador que la ubique en el mapa.</div>}
      {pendientes > 0 && <div className="note err"><Icon name="notifications_active" /><b>{pendientes} despacho{pendientes > 1 ? 's' : ''} esperando respuesta de su institución.</b></div>}
      <div className="row">
        <Seg value={vista} onChange={setVista} options={[
          { value: 'todas', label: `En jurisdicción · ${data.emergencias.length}` },
          { value: 'despachadas', label: `Despachadas · ${data.emergencias.filter((e) => e.despachos.length).length}` },
          { value: 'mias', label: `Asignadas a mi institución · ${data.emergencias.filter((e) => e.mio).length}` }
        ]} />
        <div className="spacer" />
        <span className="row muted" style={{ fontSize: 13, gap: 12 }}>
          <span className="row" style={{ gap: 4 }}><i className="pin-report sm mine" style={{ display: 'inline-block' }} />Asignada</span>
          <span className="row" style={{ gap: 4 }}><i className="pin-report sm" style={{ display: 'inline-block' }} />Otra / sin despacho</span>
          <span className="row" style={{ gap: 4 }}><i className="pin-report sm done" style={{ display: 'inline-block' }} />Atendida</span>
        </span>
      </div>
      <Card style={{ overflow: 'hidden' }}>
        <JurisdictionMap institucion={inst} unidades={data.unidades} emergencias={lista} selId={selId} onSelect={(e) => setParams({ sel: e.id })} height={380} />
      </Card>
      <div className="split">
        <div className="card list-pane" style={{ maxWidth: 380 }}>
          {lista.length ? lista.map((e) => {
            const mio = e.despachos.find((d) => d.mio && d.estado !== 'Rechazada');
            return (
              <button key={e.id} className={`sel-row ${String(e.id) === String(selId) ? 'on' : ''}`} onClick={() => setParams({ sel: e.id })}>
                <div className="sb"><span className="mono muted" style={{ fontSize: 12 }}>{fTime(e.created_at)} · {e.codigo}</span><PriorityBadge prioridad={e.prioridad} /></div>
                <div className="row" style={{ flexWrap: 'nowrap' }}><Icon name={e.icono} color="var(--azul-700)" /><span style={{ fontSize: 15, fontWeight: 600 }}>{e.titulo}</span></div>
                <span className="muted" style={{ fontSize: 13 }}>{e.lugar}{e.distancia_km != null ? ` · ${dec(e.distancia_km, 1)} km de la sede` : ''}</span>
                <div className="sb" style={{ flexWrap: 'wrap' }}>
                  {mio ? <span className="chip" style={{ background: 'var(--naranja-50)', color: 'var(--naranja-700)' }}><Icon name="local_shipping" />{mio.equipo} · {mio.estado}</span>
                    : e.despachos.length ? <span className="muted" style={{ fontSize: 12 }}>Atiende {[...new Set(e.despachos.filter((d) => d.estado !== 'Rechazada').map((d) => d.institucion))].join(', ') || '—'}</span>
                      : <span className="muted" style={{ fontSize: 12 }}>Sin despacho</span>}
                  <StatusChip estado={e.estado} />
                </div>
              </button>
            );
          }) : <Empty icon="verified" title="Sin emergencias" text="No hay emergencias en su jurisdicción con este filtro." />}
        </div>
        <div className="card detail-pane">
          <DetalleEmergencia id={lista.some((e) => String(e.id) === String(selId)) ? selId : null} onChanged={reload} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Unidades ------------------------------ */
const ICONOS_UNIDAD = ICONOS_INSTITUCION.filter((o) => o.tipo === 'Primera respuesta').concat([{ icono: 'engineering', label: 'Brigada técnica' }, { icono: 'military_tech', label: 'Unidad militar' }]);

function UnidadModal({ unidad, inst, onClose, onSaved }) {
  const toast = useToast();
  const { busy, run } = useAction(toast);
  const nueva = !unidad;
  const [f, setF] = useState(unidad
    ? { codigo: unidad.codigo, nombre: unidad.nombre, tripulacion: unidad.tripulacion || '', icono: unidad.icono, lat: unidad.lat ?? '', lng: unidad.lng ?? '', estado: unidad.estado }
    : { codigo: '', nombre: '', tripulacion: '', icono: inst.icono, lat: inst.lat ?? '', lng: inst.lng ?? '', estado: 'Disponible' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const guardar = () => {
    const body = { ...f };
    if (unidad?.estado === 'En misión') delete body.estado;
    return run(() => (nueva ? api.post('/respuesta/unidades', body) : api.patch(`/respuesta/unidades/${unidad.id}`, body)), nueva ? 'Unidad registrada.' : 'Unidad actualizada.').then((r) => r && onSaved());
  };
  return (
    <Modal large title={nueva ? 'Nueva unidad de respuesta' : `Editar ${unidad.codigo}`} onClose={onClose} footer={<>
      <button className="btn sm outline" onClick={onClose}>Cancelar</button>
      <button className="btn sm primary" disabled={busy} onClick={guardar}>Guardar</button>
    </>}>
      <div className="form-grid">
        <label className="field"><span>Código</span><input className="input mono" value={f.codigo} onChange={set('codigo')} placeholder="BR-03" /></label>
        <label className="field"><span>Nombre</span><input className="input" value={f.nombre} onChange={set('nombre')} placeholder="Bomberos Trinidad" /></label>
        <label className="field"><span>Tripulación</span><input className="input" value={f.tripulacion} onChange={set('tripulacion')} placeholder="6 efectivos · bote" /></label>
        <label className="field"><span>Estado</span>
          <select className="select" value={f.estado} onChange={set('estado')} disabled={unidad?.estado === 'En misión'}>
            {unidad?.estado === 'En misión' && <option>En misión</option>}<option>Disponible</option><option>Fuera de servicio</option>
          </select>
        </label>
      </div>
      <span className="section-t">ÍCONO</span>
      <IconPicker value={f.icono} onChange={(icono) => setF({ ...f, icono })} options={ICONOS_UNIDAD} />
      <span className="section-t">BASE DE LA UNIDAD</span>
      <UbicacionField lat={f.lat} lng={f.lng} onChange={(p) => setF({ ...f, lat: p.lat, lng: p.lng })} hint="El COEN calcula la distancia y el tiempo de llegada desde esta posición. La app móvil la actualiza con el GPS durante las misiones." />
    </Modal>
  );
}

function Unidades({ resumen }) {
  const { data, reload } = useApi('/respuesta/unidades', ['equipo:ubicacion', 'despacho:actualizado', 'mision:nueva']);
  const { can } = useAuth();
  const [edit, setEdit] = useState(undefined);
  if (!data) return <Loading />;
  const editable = can('respuesta.recursos');
  return (
    <>
      {editable && <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn sm primary" onClick={() => setEdit(null)}><Icon name="add" />Nueva unidad</button></div>}
      <div className="note info"><Icon name="info" />Las unidades disponibles aparecen al COEN como equipos cercanos a cada emergencia y pueden recibir despachos. Asigne su personal a una unidad para que reciba las misiones en la app móvil.</div>
      <div className="card table-wrap">
        {data.length ? (
          <table className="t">
            <thead><tr><th>UNIDAD</th><th>TRIPULACIÓN</th><th>PERSONAL · VEHÍCULOS</th><th>ÚLTIMA POSICIÓN</th><th>ESTADO</th><th /></tr></thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.id}>
                  <td><div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}><div className="inst-marker pr" style={{ flex: 'none' }}><Icon name={u.icono} /></div><div className="stack" style={{ gap: 0 }}><span className="mono" style={{ fontWeight: 700 }}>{u.codigo}</span><span className="muted" style={{ fontSize: 12 }}>{u.nombre}</span></div></div></td>
                  <td>{u.tripulacion || '—'}</td>
                  <td className="mono">{u.personal} · {u.vehiculos}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{u.lat != null ? <><span className="mono">{Number(u.lat).toFixed(4)}, {Number(u.lng).toFixed(4)}</span><br />{ago(u.ubicacion_at)}</> : 'Sin posición'}</td>
                  <td><StatusChip estado={u.estado} /></td>
                  <td>{editable && <button className="icon-btn" title="Editar" onClick={() => setEdit(u)}><Icon name="edit" /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty icon="emergency_share" title="Sin unidades" text="Registre al menos una unidad para recibir despachos." />}
      </div>
      {edit !== undefined && <UnidadModal unidad={edit} inst={resumen.institucion} onClose={() => setEdit(undefined)} onSaved={() => { setEdit(undefined); reload(); }} />}
    </>
  );
}

/* ------------------------------ Personal ------------------------------ */
function UsuarioModal({ user, resumen, onClose, onSaved }) {
  const toast = useToast();
  const { busy, run } = useAction(toast);
  const nuevo = !user;
  const rolPR = resumen.roles.find((r) => r.codigo === 'PRIMERA_RESPUESTA');
  const [f, setF] = useState(user
    ? { nombre: user.nombre, email: user.email, telefono: user.telefono || '', rol_id: user.rol_id, equipo_id: user.equipo_id || '', especialidades: user.especialidades.map((e) => e.id) }
    : { username: '', nombre: '', email: '', telefono: '', rol_id: rolPR?.id || '', equipo_id: resumen.unidades[0]?.id || '', especialidades: [], password: '' });
  const [temp, setTemp] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggleEsp = (id) => setF({ ...f, especialidades: f.especialidades.includes(id) ? f.especialidades.filter((x) => x !== id) : [...f.especialidades, id] });
  const guardar = () => run(async () => (nuevo
    ? (await api.post('/respuesta/usuarios', { ...f, password: f.password || undefined, equipo_id: f.equipo_id || null })).data
    : (await api.patch(`/respuesta/usuarios/${user.id}`, { ...f, equipo_id: f.equipo_id || null })).data), nuevo ? 'Usuario creado.' : 'Usuario actualizado.')
    .then((r) => { if (!r) return; if (r.password_temporal) setTemp({ username: nuevo ? f.username.toLowerCase() : user.username, password: r.password_temporal }); else onSaved(); });
  const reset = () => run(async () => (await api.post(`/respuesta/usuarios/${user.id}/reset-password`)).data, 'Contraseña restablecida.')
    .then((r) => r && setTemp({ username: user.username, password: r.password_temporal }));

  if (temp) return <TempPasswordModal username={temp.username} password={temp.password} onClose={onSaved} />;
  return (
    <Modal title={nuevo ? 'Nuevo integrante' : `Editar ${user.username}`} onClose={onClose} footer={<>
      {!nuevo && <button className="btn sm outline" style={{ marginRight: 'auto' }} disabled={busy} onClick={reset}>Restablecer contraseña</button>}
      <button className="btn sm outline" onClick={onClose}>Cancelar</button>
      <button className="btn sm primary" disabled={busy} onClick={guardar}>Guardar</button>
    </>}>
      <div className="form-grid">
        {nuevo && <label className="field"><span>Usuario</span><input className="input" value={f.username} onChange={set('username')} /></label>}
        <label className="field"><span>Nombre completo</span><input className="input" value={f.nombre} onChange={set('nombre')} /></label>
        <label className="field"><span>Correo</span><input className="input" type="email" value={f.email} onChange={set('email')} /></label>
        <label className="field"><span>Teléfono</span><input className="input" value={f.telefono} onChange={set('telefono')} /></label>
        <label className="field"><span>Rol</span><select className="select" value={f.rol_id} onChange={set('rol_id')}>{resumen.roles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}</select></label>
        <label className="field"><span>Unidad</span><select className="select" value={f.equipo_id} onChange={set('equipo_id')}><option value="">— Sin unidad —</option>{resumen.unidades.map((u) => <option key={u.id} value={u.id}>{u.codigo} · {u.nombre}</option>)}</select></label>
        {nuevo && <label className="field"><span>Contraseña inicial (opcional)</span><input className="input" type="password" value={f.password} onChange={set('password')} placeholder="Se genera una temporal" /></label>}
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Especialidades</span>
        {resumen.especialidades.length ? (
          <div className="check-list">
            {resumen.especialidades.map((s) => (
              <label key={s.id} className={f.especialidades.includes(s.id) ? 'on' : ''}>
                <input type="checkbox" checked={f.especialidades.includes(s.id)} onChange={() => toggleEsp(s.id)} /><Icon name={s.icono} size={16} />{s.nombre}
              </label>
            ))}
          </div>
        ) : <span className="hint">Registre primero las especialidades de su institución.</span>}
      </div>
      <span className="hint">Los integrantes con rol Equipo de primera respuesta y una unidad asignada reciben las misiones en la app móvil.</span>
    </Modal>
  );
}

function Usuarios({ resumen, reloadResumen }) {
  const { data, reload } = useApi('/respuesta/usuarios');
  const { user: yo } = useAuth();
  const toast = useToast();
  const { run } = useAction(toast);
  const [edit, setEdit] = useState(undefined);
  if (!data) return <Loading />;
  const toggle = (u) => run(() => api.patch(`/respuesta/usuarios/${u.id}`, { estado: u.estado === 'Activo' ? 'Bloqueado' : 'Activo' }), `${u.username} ${u.estado === 'Activo' ? 'bloqueado' : 'desbloqueado'}.`).then(reload);
  return (
    <>
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn sm primary" onClick={() => setEdit(null)}><Icon name="person_add" />Nuevo integrante</button></div>
      <div className="card table-wrap">
        <table className="t">
          <thead><tr><th>INTEGRANTE</th><th>ROL</th><th>UNIDAD</th><th>ESPECIALIDADES</th><th>ÚLTIMO ACCESO</th><th>ESTADO</th><th /></tr></thead>
          <tbody>
            {data.map((u) => (
              <tr key={u.id}>
                <td><div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}><div className="avatar sm">{initials(u.nombre)}</div><div className="stack" style={{ gap: 0 }}><span style={{ fontWeight: 600 }}>{u.nombre}</span><span className="mono muted" style={{ fontSize: 12 }}>{u.username}</span></div></div></td>
                <td><span className="chip blue">{u.rol}</span></td>
                <td className="mono">{u.equipo || '—'}</td>
                <td><div className="row" style={{ gap: 4 }}>{u.especialidades.length ? u.especialidades.map((s) => <span key={s.id} className="chip soft" title={s.nombre}><Icon name={s.icono} />{s.nombre}</span>) : <span className="muted">—</span>}</div></td>
                <td className="mono muted" style={{ fontSize: 13 }}>{lastAccess(u.ultimo_acceso)}</td>
                <td>{u.editable && u.id !== yo.id
                  ? <button className="status-dot" style={{ border: 0, background: 'transparent', cursor: 'pointer', color: u.estado === 'Activo' ? 'var(--verde)' : 'var(--roja)' }} title="Bloquear / desbloquear" onClick={() => toggle(u)}><i className="dot" style={{ background: u.estado === 'Activo' ? 'var(--verde)' : 'var(--roja)' }} />{u.estado}</button>
                  : <span className="status-dot" style={{ color: u.estado === 'Activo' ? 'var(--verde)' : 'var(--roja)' }}><i className="dot" style={{ background: u.estado === 'Activo' ? 'var(--verde)' : 'var(--roja)' }} />{u.estado}</span>}</td>
                <td>{u.editable && <button className="icon-btn" title="Editar" onClick={() => setEdit(u)}><Icon name="edit" /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit !== undefined && <UsuarioModal user={edit} resumen={resumen} onClose={() => setEdit(undefined)} onSaved={() => { setEdit(undefined); reload(); reloadResumen(); }} />}
    </>
  );
}

/* ------------------- Recursos: vehículos, equipamiento, especialidades ------------------- */
function RecursoModal({ cfg, item, onClose, onSaved }) {
  const toast = useToast();
  const { busy, run } = useAction(toast);
  const nuevo = !item;
  const [f, setF] = useState(() => Object.fromEntries(cfg.campos.map((c) => [c.k, item ? (item[c.k] ?? '') : (c.def ?? '')])));
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const guardar = () => {
    const body = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === '' ? null : v]));
    return run(() => (nuevo ? api.post(`/respuesta/${cfg.ruta}`, body) : api.patch(`/respuesta/${cfg.ruta}/${item.id}`, body)), nuevo ? `${cfg.singular} registrado.` : `${cfg.singular} actualizado.`).then((r) => r && onSaved());
  };
  return (
    <Modal title={nuevo ? `Nuevo: ${cfg.singular.toLowerCase()}` : `Editar ${cfg.etiqueta(item)}`} onClose={onClose} footer={<>
      <button className="btn sm outline" onClick={onClose}>Cancelar</button>
      <button className="btn sm primary" disabled={busy} onClick={guardar}>Guardar</button>
    </>}>
      <div className="form-grid">
        {cfg.campos.filter((c) => c.type !== 'icon').map((c) => (
          <label key={c.k} className="field" style={c.full ? { gridColumn: '1 / -1' } : undefined}><span>{c.label}</span>
            {c.type === 'select' ? (
              <select className="select" value={f[c.k] ?? ''} onChange={set(c.k)}>
                {c.vacio !== false && <option value="">{c.vacio || '—'}</option>}
                {c.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : c.type === 'textarea' ? <textarea className="textarea" value={f[c.k] ?? ''} onChange={set(c.k)} />
              : <input className={`input ${c.mono ? 'mono' : ''}`} type={c.type || 'text'} value={f[c.k] ?? ''} onChange={set(c.k)} placeholder={c.ph} list={c.list ? `dl-${c.k}` : undefined} />}
            {c.list && <datalist id={`dl-${c.k}`}>{c.list.map((v) => <option key={v} value={v} />)}</datalist>}
          </label>
        ))}
      </div>
      {cfg.campos.filter((c) => c.type === 'icon').map((c) => (
        <div key={c.k} className="stack" style={{ gap: 8 }}><span style={{ fontSize: 13, fontWeight: 600 }}>{c.label}</span>
          <IconPicker value={f[c.k]} onChange={(v) => setF({ ...f, [c.k]: v })} options={c.options} />
        </div>
      ))}
    </Modal>
  );
}

function Recursos({ cfg, reloadResumen }) {
  const { data, reload } = useApi(`/respuesta/${cfg.ruta}`, ['respuesta:recursos']);
  const { can } = useAuth();
  const toast = useToast();
  const { run } = useAction(toast);
  const [edit, setEdit] = useState(undefined);
  if (!data) return <Loading />;
  const editable = can('respuesta.recursos');
  const eliminar = (x) => window.confirm(`¿Eliminar ${cfg.etiqueta(x)}? Quedará registrado en la bitácora.`) &&
    run(() => api.delete(`/respuesta/${cfg.ruta}/${x.id}`), `${cfg.etiqueta(x)} eliminado.`).then(() => { reload(); reloadResumen(); });
  const guardado = () => { setEdit(undefined); reload(); reloadResumen(); };
  return (
    <>
      {editable && <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn sm primary" onClick={() => setEdit(null)}><Icon name="add" />{cfg.nuevo}</button></div>}
      <div className="card table-wrap">
        {data.length ? (
          <table className="t">
            <thead><tr>{cfg.columnas.map((c) => <th key={c.label}>{c.label}</th>)}<th /></tr></thead>
            <tbody>
              {data.map((x) => (
                <tr key={x.id}>
                  {cfg.columnas.map((c) => <td key={c.label}>{c.render(x)}</td>)}
                  <td style={{ whiteSpace: 'nowrap' }}>{editable && <>
                    <button className="icon-btn" title="Editar" onClick={() => setEdit(x)}><Icon name="edit" /></button>
                    <button className="icon-btn" title="Eliminar" onClick={() => eliminar(x)}><Icon name="delete" color="var(--roja)" /></button>
                  </>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty icon={cfg.icono} title={cfg.vacio} text={editable ? `Use “${cfg.nuevo}” para registrarlos.` : undefined} />}
      </div>
      {edit !== undefined && <RecursoModal cfg={cfg} item={edit} onClose={() => setEdit(undefined)} onSaved={guardado} />}
    </>
  );
}

const cfgVehiculos = (res) => ({
  ruta: 'vehiculos', singular: 'Vehículo', nuevo: 'Nuevo vehículo', icono: 'fire_truck', vacio: 'Sin vehículos registrados', etiqueta: (v) => v.codigo,
  campos: [
    { k: 'codigo', label: 'Código / N.° de unidad', mono: true, ph: 'AB-03' },
    { k: 'placa', label: 'Placa', mono: true },
    { k: 'tipo', label: 'Tipo', list: TIPOS_VEHICULO, ph: 'Autobomba' },
    { k: 'marca_modelo', label: 'Marca y modelo' },
    { k: 'anio', label: 'Año', type: 'number' },
    { k: 'capacidad', label: 'Capacidad', ph: '4.000 L · 6 plazas' },
    { k: 'estado', label: 'Estado', type: 'select', vacio: false, def: 'Operativo', options: opciones(['Operativo', 'En mantenimiento', 'Fuera de servicio']) },
    { k: 'equipo_id', label: 'Unidad asignada', type: 'select', vacio: '— Sin asignar —', options: res.unidades.map((u) => ({ value: u.id, label: `${u.codigo} · ${u.nombre}` })) },
    { k: 'observacion', label: 'Observación', type: 'textarea', full: true }
  ],
  columnas: [
    { label: 'VEHÍCULO', render: (v) => <div className="stack" style={{ gap: 0 }}><span className="mono" style={{ fontWeight: 700 }}>{v.codigo}</span><span className="muted" style={{ fontSize: 12 }}>{v.placa || 'Sin placa'}</span></div> },
    { label: 'TIPO', render: (v) => <div className="stack" style={{ gap: 0 }}><span>{v.tipo}</span><span className="muted" style={{ fontSize: 12 }}>{[v.marca_modelo, v.anio].filter(Boolean).join(' · ')}</span></div> },
    { label: 'CAPACIDAD', render: (v) => v.capacidad || '—' },
    { label: 'UNIDAD', render: (v) => <span className="mono">{v.unidad || '—'}</span> },
    { label: 'EQUIPAMIENTO', render: (v) => <span className="mono">{v.equipamiento}</span> },
    { label: 'ESTADO', render: (v) => <StatusChip estado={v.estado} /> }
  ]
});

const cfgEquipamiento = (res) => ({
  ruta: 'equipamiento', singular: 'Equipamiento', nuevo: 'Nuevo equipamiento', icono: 'construction', vacio: 'Sin equipamiento registrado', etiqueta: (x) => x.nombre,
  campos: [
    { k: 'nombre', label: 'Nombre', ph: 'Equipo de respiración autónoma', full: true },
    { k: 'categoria', label: 'Categoría', list: CATEGORIAS_EQUIPAMIENTO, ph: 'Protección personal' },
    { k: 'cantidad', label: 'Cantidad', type: 'number', def: 1 },
    { k: 'unidad', label: 'Unidad de medida', def: 'unidades' },
    { k: 'estado', label: 'Estado', type: 'select', vacio: false, def: 'Operativo', options: opciones(['Operativo', 'En mantenimiento', 'De baja']) },
    { k: 'vehiculo_id', label: 'Vehículo donde se transporta', type: 'select', vacio: '— En base —', options: res.vehiculos.map((v) => ({ value: v.id, label: `${v.codigo} · ${v.tipo}` })) },
    { k: 'observacion', label: 'Observación', type: 'textarea', full: true }
  ],
  columnas: [
    { label: 'EQUIPO', render: (x) => <span style={{ fontWeight: 600 }}>{x.nombre}</span> },
    { label: 'CATEGORÍA', render: (x) => <span className="chip blue">{x.categoria}</span> },
    { label: 'CANTIDAD', render: (x) => <span className="mono">{x.cantidad} {x.unidad}</span> },
    { label: 'UBICACIÓN', render: (x) => (x.vehiculo ? <span className="row" style={{ gap: 4 }}><Icon name="fire_truck" size={16} /><span className="mono">{x.vehiculo}</span></span> : 'En base') },
    { label: 'ESTADO', render: (x) => <StatusChip estado={x.estado} /> }
  ]
});

const cfgEspecialidades = () => ({
  ruta: 'especialidades', singular: 'Especialidad', nuevo: 'Nueva especialidad', icono: 'workspace_premium', vacio: 'Sin especialidades registradas', etiqueta: (x) => x.nombre,
  campos: [
    { k: 'nombre', label: 'Nombre', ph: 'Rescate acuático', full: true },
    { k: 'descripcion', label: 'Descripción', type: 'textarea', full: true },
    { k: 'icono', label: 'Ícono', type: 'icon', def: 'workspace_premium', options: ICONOS_ESPECIALIDAD }
  ],
  columnas: [
    { label: 'ESPECIALIDAD', render: (x) => <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}><Icon name={x.icono} color="var(--azul-700)" /><b style={{ fontWeight: 600 }}>{x.nombre}</b></span> },
    { label: 'DESCRIPCIÓN', render: (x) => <span className="muted">{x.descripcion || '—'}</span> },
    { label: 'PERSONAL', render: (x) => <span className="mono">{x.personal}</span> }
  ]
});

/* ------------------------------ Página ------------------------------ */
export default function Respuesta() {
  const { tab = 'emergencias' } = useParams();
  const { can } = useAuth();
  const { data: res, reload } = useApi('/respuesta/resumen', ['respuesta:recursos']);
  if (!TABS[tab] || (tab === 'usuarios' && !can('respuesta.usuarios'))) return <Navigate to="/respuesta/emergencias" replace />;
  const t = TABS[tab];
  const inst = res?.institucion;
  return (
    <div className="page">
      <PageHead kicker={`PRIMERA RESPUESTA · ${t.kicker}`} title={t.title}>
        {inst && (
          <span className="tag" style={{ height: 36 }}>
            <span className="inst-marker pr" style={{ width: 24, height: 24, borderWidth: 1 }}><Icon name={inst.icono} size={15} /></span>
            {inst.sigla} · {inst.nombre}{inst.lat != null ? <span className="muted" style={{ fontWeight: 400 }}>· jurisdicción {inst.radio_km} km</span> : null}
          </span>
        )}
      </PageHead>
      {!res ? <Loading /> : (
        <>
          {tab === 'emergencias' && <Emergencias />}
          {tab === 'unidades' && <Unidades resumen={res} />}
          {tab === 'usuarios' && <Usuarios resumen={res} reloadResumen={reload} />}
          {tab === 'vehiculos' && <Recursos key="v" cfg={cfgVehiculos(res)} reloadResumen={reload} />}
          {tab === 'equipamiento' && <Recursos key="q" cfg={cfgEquipamiento(res)} reloadResumen={reload} />}
          {tab === 'especialidades' && <Recursos key="s" cfg={cfgEspecialidades(res)} reloadResumen={reload} />}
        </>
      )}
    </div>
  );
}
