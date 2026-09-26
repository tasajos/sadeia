import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import { errMsg } from '../api/client';

// Accesos de demostración (desactivar en producción con VITE_DEMO_LOGIN=false)
const DEMO = import.meta.env.VITE_DEMO_LOGIN !== 'false';
const DEMO_ROLES = [
  { inst: 'COEN', role: 'Operador', user: 'jmamani' },
  { inst: 'SENAMHI', role: 'Analista técnico', user: 'arojas' },
  { inst: 'VIDECI', role: 'Decisor', user: 'marce' },
  { inst: 'FF.AA.', role: 'Enlace', user: 'rsuarez' },
  { inst: 'UTI', role: 'Administrador', user: 'dchoque' },
  { inst: 'Bomberos', role: 'Equipo de rescate', user: 'lmendez' }
];

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState(DEMO ? 'marce' : '');
  const [password, setPassword] = useState(DEMO ? 'Sadeia2026!' : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(username, password);
      nav('/tablero', { replace: true });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-hero">
        <div className="row" style={{ gap: 18, flexWrap: 'nowrap' }}>
          <img src="/assets/eaen.png" alt="Escudo de la Escuela de Altos Estudios Nacionales" style={{ height: 96, flex: 'none' }} />
          <div className="stack" style={{ gap: 4 }}>
            <span className="mono" style={{ fontSize: 12, letterSpacing: '.12em', color: 'var(--naranja-500)', fontWeight: 600 }}>TESIS DE MAESTRÍA</span>
            <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>Maestría en Seguridad, Defensa y Desarrollo</span>
            <span style={{ fontSize: 13, color: 'var(--azul-200)', lineHeight: 1.4 }}>E.A.E.N. “Cnl. Eduardo Avaroa” · Universidad Militar “Mcal. Bernardino Bilbao Rioja” · 2026</span>
          </div>
        </div>
        <div className="stack" style={{ gap: 18, maxWidth: 460 }}>
          <h1 style={{ fontSize: 40, lineHeight: 1.1, fontWeight: 800, letterSpacing: '-.02em' }}>Sistema de Apoyo a la Decisión para Emergencias</h1>
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: 'var(--azul-100)' }}>
            Anticipación y coordinación de la respuesta ante inundaciones, sequías, deslizamientos, heladas, granizadas e incendios forestales.
          </p>
        </div>
        <div className="sb" style={{ flexWrap: 'wrap', gap: 16 }}>
          <div className="row" style={{ gap: 12 }}>
            <div className="brand-logo" style={{ width: 48, height: 48, borderRadius: 11 }}><img src="/assets/buho.png" alt="" style={{ height: 36 }} /></div>
            <span style={{ fontWeight: 800, fontSize: 22, letterSpacing: '.02em' }}>SADE-IA</span>
            <div className="stack" style={{ gap: 3, fontSize: 12, color: 'var(--azul-200)', lineHeight: 1.4 }}>
              <span>Autor: Dhc. Ing. Carlos Andres Azcarraga Esquivel</span>
              <span>Tutor: Gral. Div. Vladimir Hinojosa Luizaga</span>
            </div>
          </div>
          <img src="/assets/logo-chakuy-blanco.png" alt="CHAKUY" style={{ height: 44 }} />
        </div>
      </div>

      <div className="login-form">
        <form onSubmit={submit} className="stack" style={{ width: '100%', maxWidth: 420, gap: 22 }}>
          <div className="stack" style={{ gap: 6 }}>
            <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--azul-900)' }}>Iniciar sesión</h2>
            <span className="muted" style={{ fontSize: 15 }}>Ingrese con sus credenciales institucionales.</span>
          </div>
          {DEMO && (
            <div className="stack">
              <span style={{ fontSize: 13, fontWeight: 600 }}>Acceso de demostración · institución y rol</span>
              <div className="role-grid">
                {DEMO_ROLES.map((r) => (
                  <button type="button" key={r.user} className={`role-btn ${username === r.user ? 'on' : ''}`} onClick={() => { setUsername(r.user); setPassword('Sadeia2026!'); }}>
                    <b>{r.inst}</b><small>{r.role}</small>
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className="field"><span>Usuario o correo</span>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
          </label>
          <label className="field"><span>Contraseña</span>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </label>
          {error && <div className="note err"><Icon name="error" />{error}</div>}
          <button className="btn primary" style={{ height: 48, fontSize: 16 }} disabled={busy}>
            {busy ? 'Verificando…' : 'Ingresar'}<Icon name="arrow_forward" />
          </button>
          <div className="note info" style={{ alignItems: 'flex-start' }}>
            <Icon name="lock" color="var(--azul-700)" />
            <span style={{ fontSize: 13 }}>Conexión cifrada (HTTPS). La sesión expira a las 8 horas. Todo acceso queda registrado en la bitácora de auditoría.</span>
          </div>
        </form>
      </div>
    </div>
  );
}
