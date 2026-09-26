import { useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon';
import { api } from '../api/client';
import { useApi, useAction } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { PageHead, PriorityBadge, StatusChip, Loading, Empty } from '../components/ui';
import { ReportMap } from '../components/MapView';
import { PR } from '../utils/constants';
import { dec, fTime, fDateTime } from '../utils/format';

const EV = ['reporte:nuevo', 'reporte:actualizado', 'despacho:actualizado', 'informe:nuevo', 'equipo:ubicacion'];

export default function Ciudadanos() {
  const [params, setParams] = useSearchParams();
  const { data: list, loading } = useApi('/reportes-ciudadanos', EV);
  const selId = params.get('sel') || list?.[0]?.id;
  const { data: rep, reload } = useApi(selId ? `/reportes-ciudadanos/${selId}` : null, EV);
  const { can } = useAuth();
  const toast = useToast();
  const { busy, run } = useAction(toast);
  const canAct = can('ciudadanos.gestionar');

  const despachar = (t) => run(async () => (await api.post(`/reportes-ciudadanos/${rep.id}/despachar`, { equipo_id: t.id })).data,
    (r) => `${t.codigo} despachado a ${rep.codigo}. Llegada estimada en ${r.eta_min} min.`).then(reload);
  const vincular = () => run(() => api.post(`/reportes-ciudadanos/${rep.id}/vincular`), `${rep.codigo} vinculado a ${rep.evento_codigo}.`).then(reload);
  const falso = () => window.confirm(`¿Marcar ${rep.codigo} como falso? Quedará registrado en bitácora.`) &&
    run(() => api.post(`/reportes-ciudadanos/${rep.id}/falso`), `${rep.codigo} marcado como falso. Queda en bitácora.`).then(reload);

  const counts = [['Nuevo', '#C62828'], ['En revisión', '#E0741A'], ['Equipo despachado', '#1170B8']].map(([l, hex]) => ({ l, hex, n: (list || []).filter((r) => r.estado === l).length }));
  const pr = rep ? PR[rep.prioridad] : null;

  return (
    <div className="page">
      <PageHead kicker="COEN · RECEPCIÓN DE REPORTES CIUDADANOS" title="Reportes ciudadanos y despacho">
        {counts.map((c) => <span key={c.l} className="tag"><i className="dot" style={{ background: c.hex, width: 10, height: 10 }} />{c.l} · {c.n}</span>)}
      </PageHead>

      <div className="split">
        <div className="card list-pane" style={{ maxWidth: 360 }}>
          {loading && !list ? <Loading /> : list?.length ? list.map((r) => (
            <button key={r.id} className={`sel-row ${String(r.id) === String(selId) ? 'on' : ''}`} onClick={() => setParams({ sel: r.id })}>
              <div className="sb"><span className="mono muted" style={{ fontSize: 12 }}>{fTime(r.created_at)} · {r.codigo}</span><PriorityBadge prioridad={r.prioridad} /></div>
              <div className="row" style={{ flexWrap: 'nowrap' }}><Icon name={r.icono} color="var(--azul-700)" /><span style={{ fontSize: 15, fontWeight: 600 }}>{r.titulo}</span></div>
              <span className="muted" style={{ fontSize: 13 }}>{r.lugar}</span>
              <div className="sb"><span className="row muted" style={{ fontSize: 12, gap: 4 }}><Icon name="photo_library" size={16} />{r.fotos} fotos</span><StatusChip estado={r.estado} /></div>
            </button>
          )) : <Empty icon="inbox" title="Bandeja vacía" text="Los reportes de la App ciudadana aparecerán aquí en tiempo real." />}
        </div>

        <div className="card detail-pane">
          {!rep ? <Empty icon="record_voice_over" title="Seleccione un reporte" /> : (
            <>
              <div className="sb" style={{ background: pr.bg, color: pr.fg, padding: '18px 24px', flexWrap: 'wrap' }}>
                <div className="row" style={{ gap: 12, flexWrap: 'nowrap' }}>
                  <Icon name={rep.icono} size={34} />
                  <div className="stack" style={{ gap: 0 }}>
                    <span style={{ fontWeight: 800, letterSpacing: '.08em', fontSize: 13 }}>PRIORIDAD {pr.label}</span>
                    <span style={{ fontSize: 21, fontWeight: 700 }}>{rep.titulo}</span>
                  </div>
                </div>
                <span className="mono" style={{ fontSize: 14, fontWeight: 600 }}>{rep.codigo}</span>
              </div>
              <div className="stack" style={{ padding: '20px 24px', gap: 22 }}>
                <div className="photos">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="photo">
                      {rep.fotos[i] ? <a href={rep.fotos[i]} target="_blank" rel="noreferrer" style={{ width: '100%', height: '100%' }}><img src={rep.fotos[i]} alt={`Foto ${i + 1} del ciudadano`} /></a> : 'Sin foto'}
                    </div>
                  ))}
                </div>
                <div className="auto-col" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
                  <div className="stack facts" style={{ gap: 10 }}>
                    <div><span>Reportado por</span><span>{rep.reportante}</span></div>
                    <div><span>Teléfono</span><span className="mono">{rep.telefono ? <a href={`tel:${rep.telefono_completo}`}>{rep.telefono}</a> : '—'}</span></div>
                    <div><span>Recepción</span><span className="mono">{fDateTime(rep.created_at)}</span></div>
                    <div><span>Personas en riesgo</span><span>{rep.riesgo_detalle}</span></div>
                    <div><span>Canal</span><span>{rep.canal}</span></div>
                    {rep.descripcion && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, border: 0 }}>
                        <span className="muted" style={{ fontSize: 13 }}>Descripción del ciudadano</span>
                        <span style={{ fontSize: 15, lineHeight: 1.55, padding: '12px 14px', background: 'var(--azul-50)', borderRadius: 8, fontWeight: 400 }}>“{rep.descripcion}”</span>
                      </div>
                    )}
                  </div>
                  <div className="ai-box">
                    <div className="row"><Icon name="neurology" /><b style={{ fontSize: 14 }}>Triaje automático · Motor IA</b></div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div className="cell"><small>Clasificación</small><b style={{ fontSize: 15 }}>{rep.ia_tipo}</b></div>
                      <div className="cell"><small>Confianza</small><b className="mono" style={{ fontSize: 15 }}>{dec(rep.ia_confianza)}</b></div>
                    </div>
                    <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--azul-100)' }}>{rep.ia_nota}</span>
                    <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--azul-200)' }}>Duplicados: {rep.duplicados}</span>
                  </div>
                </div>

                <div className="stack" style={{ gap: 10 }}>
                  <div className="sb" style={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <b style={{ fontSize: 16 }}>Ubicación y equipos cercanos</b>
                    <span className="mono muted" style={{ fontSize: 12 }}>{Number(rep.lat).toFixed(4)}, {Number(rep.lng).toFixed(4)}{rep.precision_m ? ` · ± ${rep.precision_m} m` : ''}</span>
                  </div>
                  <ReportMap point={rep} teams={rep.equipos} />
                </div>

                <div style={{ border: '1px solid var(--borde)', borderRadius: 10, overflow: 'hidden' }}>
                  {rep.equipos.length ? rep.equipos.map((t) => (
                    <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '40px minmax(0,1fr) auto auto', gap: 12, alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid var(--fondo)', background: t.despachado ? '#FFFAF3' : '#fff' }}>
                      <div className="ic" style={{ width: 40, height: 40, borderRadius: 9, background: 'var(--azul-100)', color: 'var(--azul-700)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={t.icono} size={22} /></div>
                      <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                        <span style={{ fontSize: 14, fontWeight: 700 }}><span className="mono">{t.codigo}</span> · {t.nombre}</span>
                        <span className="muted" style={{ fontSize: 12 }}>{t.institucion} · {t.tripulacion}</span>
                      </div>
                      <div className="stack" style={{ alignItems: 'flex-end', gap: 2 }}>
                        <span className="mono" style={{ fontSize: 14, fontWeight: 600 }}>ETA {t.eta_min} min</span>
                        <span className="muted" style={{ fontSize: 12 }}>{dec(t.distancia_km, 1)} km</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', minWidth: 140 }}>
                        {t.despachado ? <span className="chip" style={{ height: 28, background: 'var(--naranja-50)', color: 'var(--naranja-700)', fontSize: 13, fontWeight: 700 }}><Icon name="local_shipping" />{t.despacho_estado === 'Despachado' ? `Despachado ${t.despacho_hora}` : t.despacho_estado}</span>
                          : t.ocupado ? <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--texto3)' }}>En otra misión</span>
                            : canAct && !['Atendido', 'Falso / descartado'].includes(rep.estado) ? (
                              <button className={`btn sm ${t.sugerido ? 'primary' : 'outline'}`} disabled={busy} onClick={() => despachar(t)}><Icon name="send" size={18} />{t.sugerido ? 'Despachar · sugerido' : 'Despachar'}</button>
                            ) : null}
                      </div>
                    </div>
                  )) : <Empty icon="fire_truck" title="Sin equipos en un radio de 80 km" />}
                </div>

                {canAct && !['Atendido', 'Falso / descartado'].includes(rep.estado) && (
                  <div className="row" style={{ gap: 10 }}>
                    {rep.evento_codigo && <button className="btn outline" disabled={busy} onClick={vincular}>Vincular a {rep.evento_codigo}</button>}
                    <button className="btn danger" disabled={busy} onClick={falso}>Marcar como falso</button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
