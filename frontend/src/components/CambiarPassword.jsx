import { useState } from 'react';
import Icon from './Icon';
import { Modal } from './ui';
import { api, errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

/** Reglas mostradas en vivo; son las mismas que valida el backend (PUT /auth/password). */
const REGLAS = [
  { t: 'Al menos 8 caracteres', ok: (p) => p.length >= 8 },
  { t: 'Letras y números', ok: (p) => /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(p) && /\d/.test(p) },
  { t: 'Distinta de la actual', ok: (p, a) => !!p && p !== a }
];

function fuerza(p) {
  let n = 0;
  if (p.length >= 8) n++;
  if (p.length >= 12) n++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) n++;
  if (/\d/.test(p)) n++;
  if (/[^A-Za-z0-9]/.test(p)) n++;
  const nivel = [
    { label: 'Muy débil', c: 'var(--roja)' }, { label: 'Débil', c: 'var(--roja)' }, { label: 'Aceptable', c: 'var(--naranja-600)' },
    { label: 'Buena', c: '#b89a00' }, { label: 'Fuerte', c: 'var(--verde)' }, { label: 'Muy fuerte', c: 'var(--verde)' }
  ][n];
  return { ...nivel, pct: Math.max(8, (n / 5) * 100) };
}

function Campo({ label, value, onChange, ver, autoComplete, autoFocus }) {
  return (
    <label className="field"><span>{label}</span>
      <input className="input" type={ver ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} autoFocus={autoFocus} maxLength={72} />
    </label>
  );
}

/** Formulario de cambio de la propia contraseña (usado en el modal y en la pantalla obligatoria). */
function PasswordForm({ onDone, onCancel, cancelLabel = 'Cancelar', actualLabel = 'Contraseña actual' }) {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [conf, setConf] = useState('');
  const [ver, setVer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const reglasOk = REGLAS.every((r) => r.ok(nueva, actual));
  const coincide = conf.length > 0 && conf === nueva;
  const listo = actual && reglasOk && coincide && !busy;
  const f = nueva ? fuerza(nueva) : null;

  const guardar = async (e) => {
    e.preventDefault();
    if (!listo) return;
    setBusy(true);
    setErr('');
    try {
      await api.put('/auth/password', { actual, nueva });
      onDone();
    } catch (ex) {
      setErr(errMsg(ex));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={guardar} className="stack" style={{ gap: 14 }}>
      <Campo label={actualLabel} value={actual} onChange={setActual} ver={ver} autoComplete="current-password" autoFocus />
      <Campo label="Nueva contraseña" value={nueva} onChange={setNueva} ver={ver} autoComplete="new-password" />
      {f && (
        <div className="pw-meter" aria-live="polite">
          <div><i style={{ width: `${f.pct}%`, background: f.c }} /></div>
          <small style={{ color: f.c }}>{f.label}</small>
        </div>
      )}
      <ul className="pw-rules">
        {REGLAS.map((r) => {
          const ok = r.ok(nueva, actual);
          return <li key={r.t} className={ok ? 'ok' : ''}><Icon name={ok ? 'check_circle' : 'radio_button_unchecked'} size={16} />{r.t}</li>;
        })}
      </ul>
      <Campo label="Confirmar nueva contraseña" value={conf} onChange={setConf} ver={ver} autoComplete="new-password" />
      {conf && !coincide && <small style={{ color: 'var(--roja)', marginTop: -8 }}>Las contraseñas no coinciden</small>}
      <label className="row" style={{ gap: 8, fontSize: 13, cursor: 'pointer' }}>
        <input type="checkbox" checked={ver} onChange={(e) => setVer(e.target.checked)} />Mostrar contraseñas
      </label>
      {err && <div className="note err"><Icon name="error" />{err}</div>}
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 4 }}>
        <button type="button" className="btn outline" onClick={onCancel}>{cancelLabel}</button>
        <button type="submit" className="btn primary" disabled={!listo}><Icon name="key" size={18} />{busy ? 'Guardando…' : 'Cambiar contraseña'}</button>
      </div>
    </form>
  );
}

/** Cambio voluntario desde la barra superior. */
export default function CambiarPassword({ onClose }) {
  const toast = useToast();
  return (
    <Modal title="Cambiar contraseña" onClose={onClose}>
      <PasswordForm onCancel={onClose} onDone={() => { toast('Contraseña actualizada. Úsela en su próximo inicio de sesión.'); onClose(); }} />
    </Modal>
  );
}

/**
 * Pantalla obligatoria tras iniciar sesión con una contraseña temporal (creada o restablecida por un
 * administrador): hasta cambiarla, el backend rechaza el resto de la API.
 */
export function PasswordObligatoria() {
  const { user, logout, passwordCambiada } = useAuth();
  const toast = useToast();
  return (
    <div className="pw-page">
      <div className="pw-card">
        <div className="pw-card-head">
          <div className="brand-logo"><img src="/assets/buho.png" alt="" /></div>
          <div>
            <span className="mono" style={{ fontSize: 11, letterSpacing: '.12em', color: 'var(--naranja-500)', fontWeight: 700 }}>PRIMER INGRESO · SADE-IA</span>
            <h1>Cree su contraseña personal</h1>
          </div>
        </div>
        <div className="pw-card-body">
          <div className="note info"><Icon name="lock_reset" />
            <span>Hola, <b>{user.nombre}</b>. Su contraseña actual fue asignada por un administrador. Por seguridad, reemplácela por una que solo usted conozca antes de continuar.</span>
          </div>
          <PasswordForm
            actualLabel="Contraseña temporal (la que recibió)"
            cancelLabel="Cerrar sesión"
            onCancel={() => logout()}
            onDone={() => { toast('Contraseña creada. Bienvenido a SADE-IA.'); passwordCambiada(); }}
          />
        </div>
      </div>
    </div>
  );
}
