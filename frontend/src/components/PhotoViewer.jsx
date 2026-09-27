import { useCallback, useEffect, useState } from 'react';
import Icon from './Icon';

/**
 * Visor de fotos a pantalla completa (reportes ciudadanos, emergencias, avances de tareas).
 * ← → cambian de foto, Esc cierra, clic en la imagen alterna ajuste / tamaño real.
 */
export default function PhotoViewer({ fotos, index = 0, titulo, subtitulo, onClose }) {
  const [i, setI] = useState(index);
  const [zoom, setZoom] = useState(false);
  const [cargadas, setCargadas] = useState({}); // src → 'ok' | 'error'
  const n = fotos.length;
  const src = fotos[i];
  const estado = cargadas[src] || 'cargando';
  const marcar = (v) => setCargadas((c) => ({ ...c, [src]: v }));

  const ir = useCallback((d) => { setI((x) => (x + d + n) % n); setZoom(false); }, [n]);

  useEffect(() => {
    const k = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); } // no cierra también el modal que lo contiene
      else if (e.key === 'ArrowRight' && n > 1) ir(1);
      else if (e.key === 'ArrowLeft' && n > 1) ir(-1);
    };
    window.addEventListener('keydown', k, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k, true); document.body.style.overflow = prev; };
  }, [ir, n, onClose]);

  return (
    <div className="pv-back" role="dialog" aria-modal="true" aria-label={titulo || 'Visor de fotos'} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <header className="pv-head">
        <div style={{ minWidth: 0 }}>
          {titulo && <b>{titulo}</b>}
          <small className="mono">{subtitulo ? `${subtitulo} · ` : ''}Foto {i + 1} de {n}</small>
        </div>
        <div className="pv-tools">
          <button className="pv-btn" onClick={() => setZoom((z) => !z)} title={zoom ? 'Ajustar a la pantalla' : 'Tamaño real'} aria-label={zoom ? 'Ajustar a la pantalla' : 'Tamaño real'}>
            <Icon name={zoom ? 'zoom_out' : 'zoom_in'} />
          </button>
          <a className="pv-btn" href={src} download target="_blank" rel="noreferrer" title="Descargar" aria-label="Descargar"><Icon name="download" /></a>
          <button className="pv-btn" onClick={onClose} title="Cerrar (Esc)" aria-label="Cerrar"><Icon name="close" /></button>
        </div>
      </header>

      <div className={`pv-stage ${zoom ? 'zoom' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        {estado === 'cargando' && <div className="pv-msg"><span className="pv-spin" />Cargando foto…</div>}
        {estado === 'error' && <div className="pv-msg"><Icon name="broken_image" size={40} />No se pudo cargar la foto</div>}
        <img
          key={src}
          src={src}
          alt={`Foto ${i + 1} de ${n}`}
          className={estado === 'ok' ? 'on' : ''}
          onLoad={() => marcar('ok')}
          onError={() => marcar('error')}
          onClick={() => setZoom((z) => !z)}
          draggable={false}
        />
        {n > 1 && (
          <>
            <button className="pv-nav prev" onClick={() => ir(-1)} aria-label="Foto anterior"><Icon name="chevron_left" size={34} /></button>
            <button className="pv-nav next" onClick={() => ir(1)} aria-label="Foto siguiente"><Icon name="chevron_right" size={34} /></button>
          </>
        )}
      </div>

      {n > 1 && (
        <div className="pv-thumbs">
          {fotos.map((f, j) => (
            <button key={f} className={j === i ? 'on' : ''} onClick={() => { setI(j); setZoom(false); }} aria-label={`Ver foto ${j + 1}`}>
              <img src={f} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
