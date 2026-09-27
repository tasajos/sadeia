import { useEffect } from 'react';
import Icon from './Icon';
import { LV, ST, PR } from '../utils/constants';
import { valUnit } from '../utils/format';

export function LevelBadge({ nivel, small }) {
  const l = LV[nivel] || LV.verde;
  return (
    <span className="level" style={{ background: l.bg, color: l.fg, height: small ? 22 : 24 }}>
      <Icon name={l.icon} size={small ? 14 : 15} />
      {l.label}
    </span>
  );
}

export function StatusChip({ estado, children }) {
  const s = ST[estado] || { bg: '#EEF3F8', fg: '#4A5A6E' };
  return <span className="chip" style={{ background: s.bg, color: s.fg }}>{children || estado}</span>;
}

export function PriorityBadge({ prioridad }) {
  const p = PR[prioridad] || PR.BAJA;
  return <span className="level" style={{ background: p.bg, color: p.fg, height: 22, padding: '0 8px' }}>{p.label}</span>;
}

export function PageHead({ kicker, title, sub, children }) {
  return (
    <div className="page-head">
      <div className="stack" style={{ gap: 4 }}>
        {kicker && <span className="kicker">{kicker}</span>}
        <h1>{title}</h1>
        {sub && <span className="sub">{sub}</span>}
      </div>
      {children && <div className="row">{children}</div>}
    </div>
  );
}

export function Kpi({ label, value, icon, note, tone, mono, dark }) {
  return (
    <div className={`kpi ${dark ? 'dark' : ''}`}>
      <div className="kpi-top"><span>{label}</span>{icon && <Icon name={icon} />}</div>
      <span className={`kpi-val ${mono ? 'mono' : ''}`}>{value}</span>
      {note && <span className={`kpi-note ${tone || ''}`}>{note}</span>}
    </div>
  );
}

export function Card({ title, sub, actions, children, style, bodyClass }) {
  return (
    <div className="card" style={style}>
      {(title || actions) && (
        <div className="card-head">
          <div className="stack" style={{ gap: 2 }}>
            {title && <b>{title}</b>}
            {sub && <small>{sub}</small>}
          </div>
          {actions}
        </div>
      )}
      <div className={bodyClass}>{children}</div>
    </div>
  );
}

export function Empty({ icon = 'inbox', title, text }) {
  return (
    <div className="empty">
      <Icon name={icon} />
      {title && <b style={{ color: 'var(--tinta)', fontSize: 16 }}>{title}</b>}
      {text && <span style={{ fontSize: 13, lineHeight: 1.5 }}>{text}</span>}
    </div>
  );
}

export const Loading = ({ text = 'Cargando…' }) => <div className="loading">{text}</div>;

export function ErrorNote({ error }) {
  if (!error) return null;
  return <div className="note err"><Icon name="error" />{error}</div>;
}

export function Bar({ pct, color, thin }) {
  return <div className={`bar ${thin ? 'thin' : ''}`}><i style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} /></div>;
}

/** Explicabilidad (RNF-05): valor observado frente a umbral normado. */
export function Explanation({ vars = [], color = 'var(--azul-600)' }) {
  if (!vars.length) return <span className="muted">Sin variables registradas.</span>;
  return (
    <div className="stack" style={{ gap: 12 }}>
      {vars.map((v) => (
        <div key={v.codigo || v.name} className="stack" style={{ gap: 5 }}>
          <div className="sb" style={{ fontSize: 14 }}>
            <span>{v.name}</span>
            <span className="mono" style={{ fontWeight: 600 }}>
              {valUnit(v.val, v.unidad)} <span style={{ color: 'var(--texto3)', fontWeight: 400 }}>/ umbral {v.operador === '<=' ? '≤ ' : ''}{valUnit(v.thr, v.unidad)}</span>
            </span>
          </div>
          <div className="bar explain">
            <i style={{ width: `${v.pct}%`, background: color }} />
            <span className="thr" style={{ left: `${v.thrPct}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children, footer, large }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${large ? 'lg' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head"><b>{title}</b><button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Seg({ options, value, onChange }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}
