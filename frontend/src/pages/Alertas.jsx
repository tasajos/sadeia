import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon';
import { api } from '../api/client';
import { useApi, useAction } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { PageHead, LevelBadge, StatusChip, Explanation, Loading, Empty, Seg, ErrorNote } from '../components/ui';
import { LV } from '../utils/constants';
import { dec, fShort } from '../utils/format';

const EV = ['alerta:nueva', 'alerta:actualizada'];
const NOTIF_ICON = { Confirmada: ['task_alt', 'var(--verde)'], Enviada: ['mark_email_read', 'var(--azul-700)'], Fallida: ['sync_problem', 'var(--roja)'], Pendiente: ['schedule', 'var(--texto3)'] };

export default function Alertas() {
  const [params, setParams] = useSearchParams();
  const [filtro, setFiltro] = useState('abiertas');
  const { data: list, loading, error } = useApi(`/alertas?estado=${filtro}`, EV);
  const selId = params.get('sel') || list?.[0]?.id;
  const { data: sel, reload } = useApi(selId ? `/alertas/${selId}` : null, EV);
  const { can, user } = useAuth();
  const toast = useToast();
  const { busy, run } = useAction(toast);
  const [mode, setMode] = useState(null); // 'nivel' | 'descartar'
  const [just, setJust] = useState('');

  useEffect(() => { setMode(null); setJust(''); }, [selId]);

  const canAct = can('alertas.gestionar', 'alertas.validar');
  const esDecisor = can('alertas.validar');
  const pendiente = sel && ['Pendiente de validación', 'Modificada · pendiente', 'Emitida no notificada'].includes(sel.estado);

  const validar = () => run(async () => (await api.post(`/alertas/${sel.id}/validar`)).data,
    (r) => r.fallidas ? `${sel.codigo}: ${r.fallidas} institución(es) sin confirmar entrega. Reintento automático en curso.` : `${sel.codigo} notificada de forma simultánea a ${r.instituciones} instituciones.`).then(reload);
  const cambiarNivel = (nivel) => run(() => api.post(`/alertas/${sel.id}/nivel`, { nivel }), `Nivel cambiado a ${LV[nivel].label}. Se conserva la propuesta original.`).then(() => { setMode(null); reload(); });
  const descartar = () => {
    if (just.trim().length < 5) return toast('La justificación es obligatoria (RF-07).', 'err');
    return run(() => api.post(`/alertas/${sel.id}/descartar`, { justificacion: just }), `${sel.codigo} descartada. Justificación registrada.`).then(() => { setMode(null); reload(); });
  };

  const counts = ['roja', 'naranja', 'amarilla'].map((l) => ({ l, n: (list || []).filter((a) => a.nivel === l && a.estado !== 'Descartada').length }));

  return (
    <div className="page">
      <PageHead kicker="CU-03 · CU-04 · RF-05 A RF-07" title="Alertas tempranas">
        {counts.map((c) => (
          <span key={c.l} className="tag"><i className="dot" style={{ background: LV[c.l].hex, width: 10, height: 10 }} />{c.l[0].toUpperCase() + c.l.slice(1)} · {c.n}</span>
        ))}
        <Seg value={filtro} onChange={setFiltro} options={[{ value: 'abiertas', label: 'Vigentes' }, { value: 'descartadas', label: 'Descartadas' }, { value: 'todas', label: 'Todas' }]} />
      </PageHead>
      <ErrorNote error={error} />

      <div className="split">
        <div className="card list-pane">
          {loading && !list ? <Loading /> : list?.length ? list.map((a) => (
            <button key={a.id} className={`sel-row ${String(a.id) === String(selId) ? 'on' : ''}`} onClick={() => setParams({ sel: a.id })}>
              <div className="sb"><span className="mono muted" style={{ fontSize: 12 }}>{a.codigo}</span><LevelBadge nivel={a.nivel} small /></div>
              <div className="row" style={{ flexWrap: 'nowrap' }}><Icon name={a.icono} color="var(--azul-700)" /><span style={{ fontSize: 15, fontWeight: 600 }}>{a.amenaza} · {a.lugar}</span></div>
              <StatusChip estado={a.estado} />
            </button>
          )) : <Empty icon="notifications_off" title="Sin alertas en esta vista" />}
        </div>

        <div className="card detail-pane">
          {!sel ? <Empty icon="campaign" title="Seleccione una alerta" /> : (
            <>
              <div style={{ background: LV[sel.nivel].bg, color: LV[sel.nivel].fg, padding: '20px 24px' }} className="sb">
                <div className="row" style={{ gap: 12, flexWrap: 'nowrap' }}>
                  <Icon name={LV[sel.nivel].icon} size={36} />
                  <div className="stack" style={{ gap: 0 }}>
                    <span style={{ fontWeight: 800, letterSpacing: '.08em', fontSize: 13 }}>ALERTA {LV[sel.nivel].label}</span>
                    <span style={{ fontSize: 22, fontWeight: 700 }}>{sel.amenaza} · {sel.lugar}</span>
                  </div>
                </div>
                <span className="mono" style={{ fontSize: 14, fontWeight: 600 }}>{sel.codigo}</span>
              </div>
              <div className="stack" style={{ padding: '20px 24px', gap: 22 }}>
                <div className="metrics">
                  <div className="metric"><small>Probabilidad</small><b>{dec(sel.probabilidad)}</b></div>
                  <div className="metric"><small>Horizonte</small><b>{sel.horizonte}</b></div>
                  <div className="metric"><small>Modelo</small><b className="sm">{sel.modelo || 'Manual'}</b></div>
                  <div className="metric"><small>Estado</small><StatusChip estado={sel.estado} /></div>
                </div>
                {sel.nivel !== sel.nivel_propuesto && (
                  <div className="note warn"><Icon name="history" />Nivel propuesto por el modelo: <b>{LV[sel.nivel_propuesto].label}</b>. Modificado por la autoridad; se conserva la propuesta original.</div>
                )}

                <div className="stack" style={{ gap: 12 }}>
                  <div className="sb" style={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <b style={{ fontSize: 16 }}>Sustento técnico</b>
                    <small className="muted">Valor observado frente a umbral normado · RNF-05</small>
                  </div>
                  <Explanation vars={sel.sustento} color={LV[sel.nivel].bg} />
                </div>

                <div className="stack" style={{ gap: 10 }}>
                  <b style={{ fontSize: 16 }}>Notificación simultánea a</b>
                  <div className="row">
                    {sel.instituciones.map((i) => {
                      const [ic, col] = NOTIF_ICON[i.estado] || NOTIF_ICON.Pendiente;
                      return (
                        <span key={i.id} className="chip blue" style={{ height: 32, padding: '0 12px', fontSize: 13 }} title={`${i.nombre} · ${i.estado}${i.fecha_confirmacion ? ' ' + fShort(i.fecha_confirmacion) : ''}`}>
                          <Icon name={i.icono} size={18} />{i.nombre}<Icon name={ic} size={16} color={col} />
                        </span>
                      );
                    })}
                  </div>
                </div>

                {sel.estado === 'Emitida no notificada' && (
                  <div className="note err"><Icon name="sync_problem" />Falla del servicio de notificación en una o más instituciones. Reintento automático en curso (flujo 7.a · intento {sel.reintentos}).</div>
                )}
                {sel.estado === 'Descartada' && sel.justificacion && (
                  <div className="note info"><Icon name="block" />Descartada por {sel.validado_por} el {fShort(sel.fecha_validacion)}: “{sel.justificacion}”</div>
                )}
                {sel.validado_por && sel.estado !== 'Descartada' && (
                  <div className="note ok"><Icon name="verified" />{sel.estado === 'Notificada' ? 'Emitida' : 'Validada'} por {sel.validado_por} el {fShort(sel.fecha_validacion)}.</div>
                )}

                {mode === 'nivel' && (
                  <div className="box">
                    <span style={{ fontSize: 14, fontWeight: 600 }}>Seleccione el nuevo nivel</span>
                    <div className="row">
                      {['verde', 'amarilla', 'naranja', 'roja'].map((l) => (
                        <button key={l} className="level" disabled={busy} onClick={() => cambiarNivel(l)} style={{ background: LV[l].bg, color: LV[l].fg, height: 36, padding: '0 14px 0 10px', border: 0, cursor: 'pointer', fontSize: 12 }}>
                          <Icon name={LV[l].icon} size={16} />{LV[l].label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {mode === 'descartar' && (
                  <div className="box red">
                    <span style={{ fontSize: 14, fontWeight: 600 }}>Justificación del descarte <span style={{ color: 'var(--roja)' }}>*</span></span>
                    <textarea className="textarea" value={just} onChange={(e) => setJust(e.target.value)} placeholder="Registre el sustento de su decisión…" />
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn sm outline" onClick={() => setMode(null)}>Cancelar</button>
                      <button className="btn sm danger-solid" disabled={busy} onClick={descartar}>Confirmar descarte</button>
                    </div>
                  </div>
                )}

                {canAct && pendiente && (
                  <div className="row" style={{ gap: 10, paddingTop: 16, borderTop: '1px solid var(--fondo)' }}>
                    <button className="btn primary" disabled={busy} onClick={validar}><Icon name="campaign" />{esDecisor ? 'Validar y notificar' : 'Confirmar emisión'}</button>
                    <button className="btn outline" onClick={() => setMode(mode === 'nivel' ? null : 'nivel')}>Modificar nivel</button>
                    <button className="btn danger" onClick={() => setMode(mode === 'descartar' ? null : 'descartar')}>Descartar</button>
                  </div>
                )}
                {!canAct && (
                  <div className="note info"><Icon name="visibility" />Solo lectura para el rol {user.rol_nombre} (RNF-04).</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
