import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icon';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../hooks/useApi';
import { api } from '../api/client';
import { getSocket } from '../api/socket';
import { NAV, LV } from '../utils/constants';
import IncomingAlert from './IncomingAlert';
import CambiarPassword from './CambiarPassword';

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t); }, []);
  const p = (n) => String(n).padStart(2, '0');
  return <span className="clock">{`${p(now.getDate())}/${p(now.getMonth() + 1)}/${now.getFullYear()} ${p(now.getHours())}:${p(now.getMinutes())} BOT`}</span>;
}

function Search() {
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const box = useRef(null);
  useEffect(() => {
    if (q.trim().length < 2) { setRes([]); return undefined; }
    const t = setTimeout(() => api.get('/tablero/buscar', { params: { q } }).then((r) => setRes(r.data)).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const h = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div className="search" ref={box}>
      <Icon name="search" />
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder="Buscar alerta, evento, municipio…" aria-label="Buscar" />
      {open && q.trim().length >= 2 && (
        <div className="search-results">
          {res.length ? res.map((r) => (
            <button key={`${r.tipo}-${r.id}`} onClick={() => { nav(r.ruta); setOpen(false); setQ(''); }}>
              <Icon name={r.icon} color="var(--azul-700)" />
              <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block', fontSize: 14 }}>{r.titulo}</b><small className="mono muted">{r.codigo}</small></span>
              {r.nivel && <i className="dot" style={{ background: LV[r.nivel]?.hex }} />}
            </button>
          )) : <div className="muted" style={{ padding: 12 }}>Sin resultados</div>}
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, logout, can } = useAuth();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();
  const { data: cnt } = useApi('/tablero/contadores', ['alerta:nueva', 'alerta:actualizada', 'reporte:nuevo', 'reporte:actualizado', 'tarea:actualizada', 'mision:nueva', 'despacho:actualizado']);

  useEffect(() => setOpen(false), [loc.pathname]);

  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => can(...i.perms)) })).filter((g) => g.items.length);

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-logo"><img src="/assets/buho.png" alt="" /></div>
          <div><b>SADE-IA</b><small>Gestión de Riesgos</small></div>
        </div>
        <nav className="nav" aria-label="Navegación principal">
          {groups.map((g) => (
            <div className="nav-group" key={g.label}>
              <span className="nav-label">{g.label}</span>
              {g.items.map((it) => {
                const badge = it.badge && cnt ? cnt[it.badge] : 0;
                return (
                  <NavLink key={it.to} to={it.to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <Icon name={it.icon} /><span className="lbl">{it.label}</span>
                    {badge > 0 && <span className="badge">{badge}</span>}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="side-foot"><i className="dot" style={{ background: getSocket()?.connected !== false ? 'var(--verde)' : 'var(--naranja)' }} />Servicios operativos · tiempo real</div>
      </aside>
      {open && <div style={{ position: 'fixed', inset: 0, zIndex: 30 }} onClick={() => setOpen(false)} />}

      <div className="main-col">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Abrir menú"><Icon name="menu" /></button>
          <Search />
          <div className="spacer" />
          {cnt?.alertaRoja && (
            <button className="pill-red" onClick={() => nav(can('alertas.ver') ? `/alertas?sel=${cnt.alertaRoja.id}` : '/tablero')}>
              <Icon name="crisis_alert" size={18} />{cnt.rojas} alerta{cnt.rojas > 1 ? 's' : ''} roja{cnt.rojas > 1 ? 's' : ''} · {cnt.alertaRoja.departamento}
            </button>
          )}
          <Clock />
          <div className="me">
            <div className="avatar">{user.iniciales}</div>
            <div className="me-txt"><b>{user.nombre}</b><small>{user.rol_nombre} · {user.institucion}</small></div>
            <button className="icon-btn" title="Cambiar contraseña" onClick={() => setPw(true)} aria-label="Cambiar contraseña"><Icon name="key" /></button>
            <button className="icon-btn" title="Cerrar sesión" onClick={() => logout()} aria-label="Cerrar sesión"><Icon name="logout" /></button>
          </div>
        </header>
        <main className="content"><Outlet /></main>
      </div>
      <IncomingAlert />
      {pw && <CambiarPassword onClose={() => setPw(false)} />}
    </div>
  );
}
