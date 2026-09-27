import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon';

/**
 * Diálogos del sistema (reemplazan a window.confirm / window.alert): modal con el escudo de la EAEN.
 *
 *   const { confirmar, avisar } = useDialog();
 *   if (await confirmar({ titulo: '¿Cerrar evento?', mensaje: '…', tono: 'peligro', confirmar: 'Cerrar' })) …
 *   const r = await confirmar({ …, campo: { label: 'Observación', opcional: true } });  // r?.valor
 *   await avisar({ titulo: 'Listo', mensaje: '…' });
 *
 * `confirmar` resuelve `null` si se cancela, o `{ valor }` si se acepta (valor = texto del campo, si lo hay).
 */
const Ctx = createContext(null);

const TONOS = {
  peligro: { icon: 'warning', color: 'var(--roja)', btn: 'danger-solid' },
  aviso: { icon: 'info', color: 'var(--azul-600)', btn: 'secondary' },
  exito: { icon: 'task_alt', color: 'var(--verde)', btn: 'secondary' },
  normal: { icon: 'help', color: 'var(--naranja-600)', btn: 'primary' }
};

function Dialogo({ d, onClose }) {
  const [valor, setValor] = useState(d.campo?.valor || '');
  const ok = useRef(null);
  const t = TONOS[d.tono] || TONOS.normal;
  const falta = d.campo && !d.campo.opcional && !valor.trim();
  const aceptar = () => !falta && onClose({ valor: valor.trim() });
  const cancelar = () => onClose(d.soloAceptar ? { valor: '' } : null);

  useEffect(() => {
    const k = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); cancelar(); }
      else if (e.key === 'Enter' && !d.campo && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); aceptar(); }
    };
    window.addEventListener('keydown', k, true);
    if (!d.campo) ok.current?.focus();
    return () => window.removeEventListener('keydown', k, true);
  });

  return (
    <div className="dlg-back" onMouseDown={(e) => e.target === e.currentTarget && cancelar()}>
      <div className="dlg" role="alertdialog" aria-modal="true" aria-labelledby="dlg-titulo" aria-describedby="dlg-msg">
        <div className="dlg-head">
          <img src="/assets/eaen.png" alt="Escuela de Altos Estudios Nacionales" className="dlg-logo" />
          <div className="stack" style={{ gap: 2, minWidth: 0 }}>
            <span className="dlg-kicker">SADE-IA · E.A.E.N.</span>
            <b id="dlg-titulo" className="dlg-titulo"><Icon name={d.icono || t.icon} size={22} color={t.color} />{d.titulo}</b>
          </div>
        </div>
        <div className="dlg-body">
          {d.mensaje && <p id="dlg-msg">{d.mensaje}</p>}
          {d.detalle && <div className="note info" style={{ fontSize: 13 }}><Icon name="info" />{d.detalle}</div>}
          {d.campo && (
            <label className="field"><span>{d.campo.label}{d.campo.opcional ? <small className="muted" style={{ fontWeight: 400 }}> · opcional</small> : ''}</span>
              <textarea className="textarea" autoFocus value={valor} onChange={(e) => setValor(e.target.value)} placeholder={d.campo.placeholder} maxLength={d.campo.max || 1000} />
            </label>
          )}
        </div>
        <div className="dlg-foot">
          {!d.soloAceptar && <button className="btn outline" onClick={cancelar}>{d.cancelar || 'Cancelar'}</button>}
          <button ref={ok} className={`btn ${t.btn}`} disabled={falta} onClick={aceptar}>{d.confirmar || 'Aceptar'}</button>
        </div>
      </div>
    </div>
  );
}

export function DialogProvider({ children }) {
  const [cola, setCola] = useState([]);
  const abrir = useCallback((opts) => new Promise((resolve) => setCola((c) => [...c, { ...opts, resolve, id: Date.now() + Math.random() }])), []);
  const confirmar = useCallback((opts) => abrir(opts), [abrir]);
  const avisar = useCallback((opts) => abrir({ tono: 'aviso', confirmar: 'Entendido', ...opts, soloAceptar: true }), [abrir]);
  const cerrar = (r) => setCola((c) => { c[0]?.resolve(r); return c.slice(1); });
  return (
    <Ctx.Provider value={{ confirmar, avisar }}>
      {children}
      {cola[0] && <Dialogo key={cola[0].id} d={cola[0]} onClose={cerrar} />}
    </Ctx.Provider>
  );
}

export const useDialog = () => useContext(Ctx);
