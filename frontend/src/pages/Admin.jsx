import { useState } from 'react';
import Icon from '../components/Icon';
import { api } from '../api/client';
import { useApi, useAction } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useDialog } from '../context/DialogContext';
import { PageHead, Loading, Modal, Seg, StatusChip } from '../components/ui';
import { IconPicker, UbicacionField, TempPasswordModal } from '../components/Pickers';
import { instIcon } from '../components/MapView';
import { fDate, fTime, lastAccess, initials } from '../utils/format';
import { DEPARTAMENTOS, ICONOS_INSTITUCION, TIPOS_INSTITUCION } from '../utils/constants';

const RADIO_DEFECTO = { 'Primera respuesta': 50, Municipal: 40, Departamental: 400, Nacional: 1500, 'Técnica': 1500, Otra: 50 };

function InstitucionModal({ inst, todas, onClose, onSaved }) {
  const toast = useToast();
  const { busy, run } = useAction(toast);
  const nuevo = !inst;
  const [f, setF] = useState(inst
    ? { sigla: inst.sigla, nombre: inst.nombre, tipo: inst.tipo, departamento: inst.departamento || '', municipio: inst.municipio || '', sede: inst.sede || '',
      telefono: inst.telefono || '', icono: inst.icono, lat: inst.lat ?? '', lng: inst.lng ?? '', radio_km: inst.radio_km, webhook_url: inst.webhook_url || '' }
    : { sigla: '', nombre: '', tipo: 'Primera respuesta', departamento: '', municipio: '', sede: '', telefono: '', icono: 'local_fire_department', lat: '', lng: '', radio_km: 50, webhook_url: '' });
  const [unidad, setUnidad] = useState({ crear: true, codigo: '', tripulacion: '' });
  const [acceso, setAcceso] = useState({ crear: true, username: '', nombre: '', email: '' });
  const [creada, setCreada] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setTipo = (e) => {
    const tipo = e.target.value;
    const sugerido = ICONOS_INSTITUCION.find((o) => o.tipo === tipo)?.icono;
    const iconoDelTipo = ICONOS_INSTITUCION.find((o) => o.icono === f.icono)?.tipo === tipo;
    setF({ ...f, tipo, icono: iconoDelTipo ? f.icono : sugerido || f.icono, radio_km: nuevo ? RADIO_DEFECTO[tipo] : f.radio_km });
  };
  const esPR = f.tipo === 'Primera respuesta';

  const guardar = () => {
    if (f.lat === '' || f.lng === '') { toast('Marque la ubicación de la institución en el mapa.', 'err'); return; }
    const body = { ...f, radio_km: Number(f.radio_km) || 50 };
    if (nuevo && esPR && unidad.crear) Object.assign(body, { crear_unidad: true, unidad_codigo: unidad.codigo || undefined, unidad_tripulacion: unidad.tripulacion || undefined });
    if (nuevo && acceso.crear) body.acceso = { username: acceso.username, nombre: acceso.nombre, email: acceso.email };
    return run(async () => (nuevo ? (await api.post('/admin/instituciones', body)).data : (await api.patch(`/admin/instituciones/${inst.id}`, body)).data),
      nuevo ? `Institución ${f.sigla.toUpperCase()} registrada.` : 'Institución actualizada.')
      .then((r) => { if (!r) return; if (r.usuario?.password_temporal) setCreada(r); else onSaved(); });
  };

  if (creada) {
    return (
      <TempPasswordModal username={creada.usuario.username} password={creada.usuario.password_temporal} onClose={onSaved}>
        <div className="note ok"><Icon name="check_circle" />
          <span><b>{f.sigla.toUpperCase()}</b> ya aparece en los mapas{creada.unidad ? <> y su unidad <b className="mono">{creada.unidad.codigo}</b> puede recibir despachos del COEN</> : ''}. Su equipo de primera respuesta puede ingresar con:</span>
        </div>
      </TempPasswordModal>
    );
  }

  const otras = todas.filter((i) => i.id !== inst?.id && i.activa);
  return (
    <Modal large title={nuevo ? 'Nueva institución' : `Editar ${inst.sigla}`} onClose={onClose} footer={<>
      <button className="btn sm outline" onClick={onClose}>Cancelar</button>
      <button className="btn sm primary" disabled={busy} onClick={guardar}>{nuevo ? 'Registrar institución' : 'Guardar'}</button>
    </>}>
      <span className="section-t">DATOS DE LA INSTITUCIÓN</span>
      <div className="form-grid">
        <label className="field"><span>Sigla</span><input className="input" value={f.sigla} onChange={set('sigla')} placeholder="BOM-TDD" /></label>
        <label className="field" style={{ gridColumn: 'span 2' }}><span>Nombre</span><input className="input" value={f.nombre} onChange={set('nombre')} placeholder="Bomberos Voluntarios Trinidad" /></label>
        <label className="field"><span>Tipo</span><select className="select" value={f.tipo} onChange={setTipo}>{TIPOS_INSTITUCION.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label className="field"><span>Departamento</span><select className="select" value={f.departamento} onChange={set('departamento')}><option value="">—</option>{DEPARTAMENTOS.map((d) => <option key={d}>{d}</option>)}</select></label>
        <label className="field"><span>Municipio</span><input className="input" value={f.municipio} onChange={set('municipio')} /></label>
        <label className="field"><span>Teléfono</span><input className="input" value={f.telefono} onChange={set('telefono')} /></label>
      </div>

      <span className="section-t">ÍCONO EN EL MAPA</span>
      <IconPicker value={f.icono} onChange={(icono) => setF({ ...f, icono })} options={ICONOS_INSTITUCION} sugeridos={(o) => o.tipo === f.tipo} />

      <span className="section-t">UBICACIÓN Y JURISDICCIÓN</span>
      <div className="form-grid">
        <label className="field" style={{ gridColumn: 'span 2' }}><span>Lugar, sede o compañía</span><input className="input" value={f.sede} onChange={set('sede')} placeholder="Compañía N.° 1, Av. 6 de Agosto" /></label>
        <label className="field"><span>Radio de jurisdicción (km)</span><input className="input" type="number" min="1" max="3000" value={f.radio_km} onChange={set('radio_km')} /></label>
      </div>
      <UbicacionField lat={f.lat} lng={f.lng} onChange={(p) => setF({ ...f, lat: p.lat, lng: p.lng })} icon={instIcon(f, true)} radiusKm={Number(f.radio_km)} others={otras}
        hint="Haga clic en el mapa o arrastre el ícono para ubicar la sede. El círculo muestra la jurisdicción: la institución verá las emergencias despachadas dentro de ese radio." />

      {nuevo && (
        <>
          <span className="section-t">ACCESO AL SISTEMA Y DESPACHOS</span>
          {esPR && (
            <div className="box">
              <label className="row" style={{ gap: 8, cursor: 'pointer' }}><input type="checkbox" checked={unidad.crear} onChange={(e) => setUnidad({ ...unidad, crear: e.target.checked })} /><b>Crear su primera unidad de respuesta</b></label>
              <span className="hint">La unidad se ubica en la sede y aparece al COEN para recibir despachos. La institución puede registrar más unidades después.</span>
              {unidad.crear && (
                <div className="form-grid">
                  <label className="field"><span>Código de la unidad</span><input className="input mono" value={unidad.codigo} onChange={(e) => setUnidad({ ...unidad, codigo: e.target.value })} placeholder={`${(f.sigla || 'SIGLA').toUpperCase()}-01`} /></label>
                  <label className="field"><span>Tripulación</span><input className="input" value={unidad.tripulacion} onChange={(e) => setUnidad({ ...unidad, tripulacion: e.target.value })} placeholder="6 bomberos · autobomba" /></label>
                </div>
              )}
            </div>
          )}
          <div className="box">
            <label className="row" style={{ gap: 8, cursor: 'pointer' }}><input type="checkbox" checked={acceso.crear} onChange={(e) => setAcceso({ ...acceso, crear: e.target.checked })} /><b>Crear el usuario del equipo de primera respuesta</b></label>
            <span className="hint">Con este usuario la institución ingresa al sistema, atiende despachos y registra su personal, vehículos, equipamiento y especialidades.</span>
            {acceso.crear && (
              <div className="form-grid">
                <label className="field"><span>Usuario</span><input className="input" value={acceso.username} onChange={(e) => setAcceso({ ...acceso, username: e.target.value })} /></label>
                <label className="field"><span>Nombre del responsable</span><input className="input" value={acceso.nombre} onChange={(e) => setAcceso({ ...acceso, nombre: e.target.value })} /></label>
                <label className="field"><span>Correo</span><input className="input" type="email" value={acceso.email} onChange={(e) => setAcceso({ ...acceso, email: e.target.value })} /></label>
              </div>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}

function Instituciones() {
  const { data, reload } = useApi('/admin/instituciones', ['institucion:actualizada']);
  const toast = useToast();
  const { run } = useAction(toast);
  const [edit, setEdit] = useState(undefined);
  const [filtro, setFiltro] = useState('');
  const { confirmar } = useDialog();
  if (!data) return <Loading />;
  const toggle = async (i) => (!i.activa || await confirmar({
    titulo: `¿Desactivar ${i.sigla}?`, tono: 'peligro', confirmar: 'Desactivar',
    mensaje: 'Sus usuarios no podrán ingresar y sus unidades dejarán de recibir despachos.'
  })) &&
    run(() => api.patch(`/admin/instituciones/${i.id}`, { activa: !i.activa }), `${i.sigla} ${i.activa ? 'desactivada' : 'activada'}.`).then(reload);
  const t = filtro.trim().toLowerCase();
  const filas = data.filter((i) => !t || `${i.sigla} ${i.nombre} ${i.tipo} ${i.departamento || ''} ${i.municipio || ''}`.toLowerCase().includes(t));
  return (
    <>
      <div className="row">
        <input className="input" style={{ maxWidth: 280, height: 38 }} placeholder="Filtrar instituciones…" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        <span className="muted" style={{ fontSize: 13 }}>{filas.length} instituciones</span>
        <div className="spacer" />
        <button className="btn sm primary" onClick={() => setEdit(null)}><Icon name="add_business" />Nueva institución</button>
      </div>
      <div className="card table-wrap">
        <table className="t">
          <thead><tr><th>INSTITUCIÓN</th><th>TIPO</th><th>UBICACIÓN</th><th>JURISDICCIÓN</th><th>USUARIOS · UNIDADES</th><th>ESTADO</th><th /></tr></thead>
          <tbody>
            {filas.map((i) => (
              <tr key={i.id} style={{ opacity: i.activa ? 1 : 0.6 }}>
                <td><div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
                  <div className={`inst-marker ${i.tipo === 'Primera respuesta' ? 'pr' : ''}`} style={{ flex: 'none' }}><Icon name={i.icono} /></div>
                  <div className="stack" style={{ gap: 0 }}><span style={{ fontWeight: 600 }}>{i.nombre}</span><span className="mono muted" style={{ fontSize: 12 }}>{i.sigla}</span></div>
                </div></td>
                <td>{i.tipo}</td>
                <td>{i.lat != null
                  ? <div className="stack" style={{ gap: 0 }}><span>{i.sede || i.municipio || '—'}</span><span className="mono muted" style={{ fontSize: 12 }}>{Number(i.lat).toFixed(4)}, {Number(i.lng).toFixed(4)}</span></div>
                  : <span className="chip" style={{ background: 'var(--naranja-50)', color: 'var(--naranja-700)' }}><Icon name="wrong_location" />Sin ubicación</span>}</td>
                <td className="mono">{i.radio_km} km</td>
                <td className="mono">{i.usuarios} · {i.unidades}</td>
                <td><button className="status-dot" style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: 0 }} title="Activar / desactivar" onClick={() => toggle(i)}><StatusChip estado={i.activa ? 'Activa' : 'Inactiva'} /></button></td>
                <td><button className="icon-btn" title="Editar" onClick={() => setEdit(i)}><Icon name="edit" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit !== undefined && <InstitucionModal inst={edit} todas={data} onClose={() => setEdit(undefined)} onSaved={() => { setEdit(undefined); reload(); }} />}
    </>
  );
}

function UsuarioModal({ user, onClose, onSaved }) {
  const { data: cat } = useApi('/admin/catalogos');
  const toast = useToast();
  const { busy, run } = useAction(toast);
  const nuevo = !user;
  const [f, setF] = useState(user ? { nombre: user.nombre, email: user.email, rol_id: user.rol_id, institucion_id: user.institucion_id, equipo_id: user.equipo_id || '', telefono: user.telefono || '' }
    : { username: '', nombre: '', email: '', rol_id: '', institucion_id: '', equipo_id: '', telefono: '', password: '' });
  const [temp, setTemp] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const esRespuesta = cat?.roles.find((r) => String(r.id) === String(f.rol_id))?.codigo === 'PRIMERA_RESPUESTA';
  const unidades = cat?.equipos.filter((e) => String(e.institucion_id) === String(f.institucion_id)) || [];
  const guardar = () => run(async () => (nuevo ? (await api.post('/admin/usuarios', { ...f, password: f.password || undefined })).data : (await api.patch(`/admin/usuarios/${user.id}`, f)).data),
    nuevo ? 'Usuario creado.' : 'Usuario actualizado.').then((r) => { if (!r) return; if (r.password_temporal) setTemp(r.password_temporal); else onSaved(); });
  const reset = () => run(async () => (await api.post(`/admin/usuarios/${user.id}/reset-password`)).data, 'Contraseña restablecida.').then((r) => r && setTemp(r.password_temporal));

  if (temp) {
    return (
      <Modal title="Contraseña temporal" onClose={onSaved} footer={<button className="btn sm primary" onClick={onSaved}>Listo</button>}>
        <div className="note warn"><Icon name="key" />Entregue esta contraseña por un canal seguro. No se volverá a mostrar y el usuario deberá cambiarla en su primer ingreso.</div>
        <input className="input mono" readOnly value={temp} onFocus={(e) => e.target.select()} />
      </Modal>
    );
  }
  return (
    <Modal title={nuevo ? 'Nuevo usuario' : `Editar ${user.username}`} onClose={onClose} footer={<>
      {!nuevo && <button className="btn sm outline" style={{ marginRight: 'auto' }} disabled={busy} onClick={reset}>Restablecer contraseña</button>}
      <button className="btn sm outline" onClick={onClose}>Cancelar</button>
      <button className="btn sm primary" disabled={busy} onClick={guardar}>Guardar</button>
    </>}>
      <div className="form-grid">
        {nuevo && <label className="field"><span>Usuario</span><input className="input" value={f.username} onChange={set('username')} /></label>}
        <label className="field"><span>Nombre completo</span><input className="input" value={f.nombre} onChange={set('nombre')} /></label>
        <label className="field"><span>Correo institucional</span><input className="input" type="email" value={f.email} onChange={set('email')} /></label>
        <label className="field"><span>Teléfono</span><input className="input" value={f.telefono} onChange={set('telefono')} /></label>
        <label className="field"><span>Institución</span><select className="select" value={f.institucion_id} onChange={set('institucion_id')}><option value="">Seleccione…</option>{cat?.instituciones.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}</select></label>
        <label className="field"><span>Rol</span><select className="select" value={f.rol_id} onChange={set('rol_id')}><option value="">Seleccione…</option>{cat?.roles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}</select></label>
        {esRespuesta && <label className="field"><span>Unidad de primera respuesta</span><select className="select" value={f.equipo_id} onChange={set('equipo_id')}><option value="">—</option>{unidades.map((e) => <option key={e.id} value={e.id}>{e.codigo} · {e.nombre}</option>)}</select></label>}
        {nuevo && <label className="field"><span>Contraseña inicial (opcional)</span><input className="input" type="password" value={f.password} onChange={set('password')} placeholder="Se genera una temporal" /></label>}
      </div>
    </Modal>
  );
}

function Usuarios() {
  const { data, reload } = useApi('/admin/usuarios');
  const toast = useToast();
  const { run } = useAction(toast);
  const [edit, setEdit] = useState(undefined);
  if (!data) return <Loading />;
  const toggle = (u) => run(() => api.patch(`/admin/usuarios/${u.id}`, { estado: u.estado === 'Activo' ? 'Bloqueado' : 'Activo' }), `${u.username} ${u.estado === 'Activo' ? 'bloqueado' : 'desbloqueado'}.`).then(reload);
  return (
    <>
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn sm primary" onClick={() => setEdit(null)}><Icon name="person_add" />Nuevo usuario</button></div>
      <div className="card table-wrap">
        <table className="t">
          <thead><tr><th>USUARIO</th><th>INSTITUCIÓN</th><th>ROL</th><th>ÚLTIMO ACCESO</th><th>ESTADO</th><th /></tr></thead>
          <tbody>
            {data.map((u) => (
              <tr key={u.id}>
                <td><div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}><div className="avatar sm">{initials(u.nombre)}</div><div className="stack" style={{ gap: 0 }}><span style={{ fontWeight: 600 }}>{u.nombre}</span><span className="mono muted" style={{ fontSize: 12 }}>{u.username}{u.equipo ? ` · ${u.equipo}` : ''}</span></div></div></td>
                <td>{u.institucion}</td>
                <td><span className="chip blue">{u.rol}</span></td>
                <td className="mono muted" style={{ fontSize: 13 }}>{lastAccess(u.ultimo_acceso)}</td>
                <td><button className="status-dot" style={{ border: 0, background: 'transparent', cursor: 'pointer', color: u.estado === 'Activo' ? 'var(--verde)' : 'var(--roja)' }} title="Bloquear / desbloquear" onClick={() => toggle(u)}><i className="dot" style={{ background: u.estado === 'Activo' ? 'var(--verde)' : 'var(--roja)' }} />{u.estado}</button></td>
                <td><button className="icon-btn" title="Editar" onClick={() => setEdit(u)}><Icon name="edit" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit !== undefined && <UsuarioModal user={edit} onClose={() => setEdit(undefined)} onSaved={() => { setEdit(undefined); reload(); }} />}
    </>
  );
}

function Roles() {
  const { data, reload } = useApi('/admin/roles');
  const { can } = useAuth();
  const toast = useToast();
  const { busy, run } = useAction(toast);
  if (!data) return <Loading />;
  const editable = can('admin.roles');
  const toggle = (rol, perm) => {
    const actuales = data.permisos.filter((p) => p.roles.includes(rol.id)).map((p) => p.id);
    const next = actuales.includes(perm.id) ? actuales.filter((x) => x !== perm.id) : [...actuales, perm.id];
    return run(() => api.put(`/admin/roles/${rol.id}/permisos`, { permisos: next }), `Permisos de ${rol.nombre} actualizados.`).then(reload);
  };
  let mod = null;
  return (
    <div className="card table-wrap">
      <table className="t">
        <thead><tr><th>MÓDULO / PERMISO</th>{data.roles.map((r) => <th key={r.id} style={{ textAlign: 'center' }}>{r.nombre}</th>)}</tr></thead>
        <tbody>
          {data.permisos.map((p) => {
            const head = p.modulo !== mod; mod = p.modulo;
            return [
              head && <tr key={`h-${p.modulo}`}><td colSpan={data.roles.length + 1} className="mono" style={{ fontSize: 11, letterSpacing: '.1em', color: 'var(--azul-700)', background: 'var(--azul-50)', padding: '8px 18px' }}>{p.modulo.toUpperCase()}</td></tr>,
              <tr key={p.id}>
                <td><div className="stack" style={{ gap: 0 }}><span style={{ fontWeight: 600 }}>{p.nombre}</span><span className="mono muted" style={{ fontSize: 11 }}>{p.codigo}</span></div></td>
                {data.roles.map((r) => {
                  const on = p.roles.includes(r.id);
                  return (
                    <td key={r.id} className="perm-cell">
                      <button disabled={!editable || busy} onClick={() => toggle(r, p)} title={on ? 'Quitar permiso' : 'Otorgar permiso'}>
                        <Icon name={on ? 'check' : 'remove'} color={on ? 'var(--azul-600)' : 'var(--borde)'} />
                      </button>
                    </td>
                  );
                })}
              </tr>
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

function Bitacora() {
  const [filtro, setFiltro] = useState('');
  const [offset, setOffset] = useState(0);
  const { data } = useApi(`/admin/bitacora?limit=50&offset=${offset}${filtro ? `&usuario=${encodeURIComponent(filtro)}` : ''}`, ['bitacora:nueva']);
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="note dark"><Icon name="lock" />Registro inalterable: la aplicación no permite editar ni eliminar entradas; la base de datos lo impide con triggers (RNF-10 · D.S. N.° 1793).</div>
      <div className="row">
        <input className="input" style={{ maxWidth: 260, height: 38 }} placeholder="Filtrar por usuario…" value={filtro} onChange={(e) => { setFiltro(e.target.value); setOffset(0); }} />
        <span className="muted" style={{ fontSize: 13 }}>{data ? `${data.total} registros` : ''}</span>
        <div className="spacer" />
        <button className="btn xs outline" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 50))}>Anterior</button>
        <button className="btn xs outline" disabled={!data || offset + 50 >= data.total} onClick={() => setOffset(offset + 50)}>Siguiente</button>
      </div>
      <div className="card table-wrap">
        {!data ? <Loading /> : (
          <table className="t mono-rows">
            <thead><tr><th>FECHA</th><th>HORA</th><th>USUARIO</th><th>OPERACIÓN</th><th>IP ORIGEN</th></tr></thead>
            <tbody>
              {data.filas.map((l) => (
                <tr key={l.id}>
                  <td className="muted">{fDate(l.fecha_hora)}</td><td>{fTime(l.fecha_hora, true)}</td>
                  <td style={{ color: 'var(--azul-700)' }}>{l.usuario}</td>
                  <td><b style={{ fontWeight: 600 }}>{l.operacion}</b> <span className="muted">{l.objeto}</span></td>
                  <td className="muted">{l.ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function Admin() {
  const { can } = useAuth();
  const tabs = [
    can('admin.usuarios') && { value: 'usuarios', label: 'Usuarios' },
    can('admin.instituciones') && { value: 'instituciones', label: 'Instituciones' },
    can('admin.roles', 'admin.usuarios') && { value: 'roles', label: 'Roles y permisos' },
    can('bitacora.ver') && { value: 'bitacora', label: 'Bitácora' }
  ].filter(Boolean);
  const [tab, setTab] = useState(tabs[0]?.value);
  return (
    <div className="page">
      <PageHead kicker="CU-11 · CU-12 · CU-13 · RF-14 A RF-16" title="Seguridad, administración y auditoría">
        <Seg value={tab} onChange={setTab} options={tabs} />
      </PageHead>
      {tab === 'usuarios' && <Usuarios />}
      {tab === 'instituciones' && <Instituciones />}
      {tab === 'roles' && <Roles />}
      {tab === 'bitacora' && <Bitacora />}
    </div>
  );
}
