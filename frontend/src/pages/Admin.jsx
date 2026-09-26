import { useState } from 'react';
import Icon from '../components/Icon';
import { api } from '../api/client';
import { useApi, useAction } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { PageHead, Loading, Modal, Seg } from '../components/ui';
import { fDate, fTime, lastAccess, initials } from '../utils/format';

function UsuarioModal({ user, onClose, onSaved }) {
  const { data: cat } = useApi('/admin/catalogos');
  const toast = useToast();
  const { busy, run } = useAction(toast);
  const nuevo = !user;
  const [f, setF] = useState(user ? { nombre: user.nombre, email: user.email, rol_id: user.rol_id, institucion_id: user.institucion_id, equipo_id: user.equipo_id || '', telefono: user.telefono || '' }
    : { username: '', nombre: '', email: '', rol_id: '', institucion_id: '', equipo_id: '', telefono: '', password: '' });
  const [temp, setTemp] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const esRescate = cat?.roles.find((r) => String(r.id) === String(f.rol_id))?.codigo === 'RESCATE';
  const guardar = () => run(async () => (nuevo ? (await api.post('/admin/usuarios', { ...f, password: f.password || undefined })).data : (await api.patch(`/admin/usuarios/${user.id}`, f)).data),
    nuevo ? 'Usuario creado.' : 'Usuario actualizado.').then((r) => { if (!r) return; if (r.password_temporal) setTemp(r.password_temporal); else onSaved(); });
  const reset = () => run(async () => (await api.post(`/admin/usuarios/${user.id}/reset-password`)).data, 'Contraseña restablecida.').then((r) => r && setTemp(r.password_temporal));

  if (temp) {
    return (
      <Modal title="Contraseña temporal" onClose={onSaved} footer={<button className="btn sm primary" onClick={onSaved}>Listo</button>}>
        <div className="note warn"><Icon name="key" />Entregue esta contraseña por un canal seguro. No se volverá a mostrar.</div>
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
        {esRescate && <label className="field"><span>Equipo de rescate</span><select className="select" value={f.equipo_id} onChange={set('equipo_id')}><option value="">—</option>{cat?.equipos.map((e) => <option key={e.id} value={e.id}>{e.codigo} · {e.nombre}</option>)}</select></label>}
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
      {tab === 'roles' && <Roles />}
      {tab === 'bitacora' && <Bitacora />}
    </div>
  );
}
