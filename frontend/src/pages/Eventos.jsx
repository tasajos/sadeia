import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon';
import { api } from '../api/client';
import { useApi, useAction } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { PageHead, LevelBadge, Loading, Empty, Modal, StatusChip } from '../components/ui';
import { DEPARTAMENTOS, LV } from '../utils/constants';
import { dec, fShort } from '../utils/format';

const EV = ['evento:nuevo', 'evento:actualizado', 'tarea:actualizada', 'recurso:actualizado'];
const DEC = {
  Aprobada: ['#E4F4EA', '#1E6B3E', 'task_alt', 'Tarea generada (CU-08)'],
  Modificada: ['#FEF3E7', '#B85A0E', 'edit', 'Original y versión modificada conservadas'],
  Descartada: ['#EEF3F8', '#4A5A6E', 'block', 'Registrada en bitácora']
};

function NuevoEvento({ onClose, onDone }) {
  const { data: cat } = useApi('/admin/catalogos');
  const { data: alertas } = useApi('/alertas?estado=abiertas');
  const toast = useToast();
  const { busy, run } = useAction(toast);
  const [f, setF] = useState({ amenaza_id: '', departamento: 'Beni', lugar: '', nivel: 'amarilla', impacto: '', alerta_id: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const desdeAlerta = (id) => {
    const a = alertas?.find((x) => String(x.id) === id);
    if (!a) return setF({ ...f, alerta_id: '' });
    const am = cat?.amenazas.find((x) => x.codigo === a.amenaza_codigo);
    setF({ ...f, alerta_id: id, amenaza_id: am?.id || '', departamento: a.departamento, lugar: a.lugar, nivel: a.nivel });
  };
  const submit = () => run(async () => (await api.post('/eventos', { ...f, alerta_id: f.alerta_id || null })).data,
    (r) => `Evento ${r.codigo} registrado con ${r.recomendaciones} recomendaciones.`).then((r) => r && onDone(r));

  return (
    <Modal title="Registrar evento (CU-05)" onClose={onClose} footer={<>
      <button className="btn sm outline" onClick={onClose}>Cancelar</button>
      <button className="btn sm primary" disabled={busy || !f.amenaza_id || !f.lugar} onClick={submit}>Registrar evento</button>
    </>}>
      <label className="field"><span>A partir de la alerta (opcional)</span>
        <select className="select" value={f.alerta_id} onChange={(e) => desdeAlerta(e.target.value)}>
          <option value="">— Sin alerta asociada —</option>
          {alertas?.map((a) => <option key={a.id} value={a.id}>{a.codigo} · {a.amenaza} · {a.lugar}</option>)}
        </select>
      </label>
      <div className="form-grid">
        <label className="field"><span>Tipología (amenaza)</span>
          <select className="select" value={f.amenaza_id} onChange={set('amenaza_id')}>
            <option value="">Seleccione…</option>
            {cat?.amenazas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </label>
        <label className="field"><span>Severidad</span>
          <select className="select" value={f.nivel} onChange={set('nivel')}>
            {Object.keys(LV).map((l) => <option key={l} value={l}>{LV[l].label}</option>)}
          </select>
        </label>
        <label className="field"><span>Departamento</span>
          <select className="select" value={f.departamento} onChange={set('departamento')}>
            {DEPARTAMENTOS.map((d) => <option key={d}>{d}</option>)}
          </select>
        </label>
        <label className="field"><span>Ubicación territorial</span><input className="input" value={f.lugar} onChange={set('lugar')} placeholder="Municipio, Departamento" /></label>
      </div>
      <label className="field"><span>Impacto estimado</span><input className="input" value={f.impacto} onChange={set('impacto')} placeholder="≈ 3.400 familias expuestas" /></label>
    </Modal>
  );
}

export default function Eventos() {
  const [params, setParams] = useSearchParams();
  const { data: list, loading, reload: reloadList } = useApi('/eventos', EV);
  const selId = params.get('sel') || list?.[0]?.id;
  const { data: ev, reload } = useApi(selId ? `/eventos/${selId}` : null, EV);
  const { can } = useAuth();
  const toast = useToast();
  const { busy, run } = useAction(toast);
  const [nuevo, setNuevo] = useState(false);
  const [modif, setModif] = useState(null);
  const [texto, setTexto] = useState('');

  const decidir = (rc, decision, extra = {}) => run(async () => (await api.post(`/eventos/recomendaciones/${rc.id}/decidir`, { decision, ...extra })).data, (r) =>
    decision === 'aprobada' ? `Recomendación aprobada. Tarea ${r.tarea} generada y asignada a ${r.institucion}.`
      : decision === 'modificada' ? `Recomendación modificada. Tarea ${r.tarea} generada; se conserva la versión original.`
        : decision === 'descartada' ? 'Recomendación descartada y registrada en bitácora.' : 'Decisión revertida.').then(reload);

  const decisor = can('recomendaciones.decidir');
  const recs = ev?.recomendaciones || [];
  const nDec = recs.filter((r) => r.estado !== 'Pendiente').length;

  return (
    <div className="page">
      <PageHead kicker="CU-05 · CU-06 · RF-08 · RF-09" title="Eventos y apoyo a la decisión">
        {can('eventos.gestionar') && <button className="btn sm outline" onClick={() => setNuevo(true)}><Icon name="add" />Registrar evento</button>}
      </PageHead>

      {loading && !list ? <Loading /> : (
        <div className="grid-kpi" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {list?.map((e) => (
            <button key={e.id} className={`hazard-card ${String(e.id) === String(selId) ? 'on' : ''}`} onClick={() => setParams({ sel: e.id })}>
              <div className="sb"><span className="mono muted" style={{ fontSize: 12 }}>{e.codigo}</span><LevelBadge nivel={e.nivel} small /></div>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{e.titulo}</span>
              <span className="muted" style={{ fontSize: 13 }}>Desde {fShort(e.fecha_inicio)} · {e.impacto || 'impacto en evaluación'}</span>
            </button>
          ))}
          {!list?.length && <Empty icon="emergency_home" title="Sin eventos en curso" />}
        </div>
      )}

      {ev && (
        <div className="card">
          <div className="card-head" style={{ padding: '16px 20px' }}>
            <div className="stack" style={{ gap: 2 }}>
              <b style={{ fontSize: 18 }}>Cursos de acción recomendados</b>
              <small>{ev.titulo} · ordenados por prioridad · {ev.usa_protocolo ? 'protocolo normado' : `motor IA${ev.alerta_codigo ? ' · evidencia de ' + ev.alerta_codigo : ''}`}</small>
            </div>
            <div className="row">
              <span className="muted" style={{ fontSize: 13 }}>{nDec} de {recs.length} decididas</span>
              {can('eventos.gestionar') && <button className="btn xs outline" disabled={busy} onClick={() => run(() => api.post(`/eventos/${ev.id}/recomendaciones/generar`), 'Recomendaciones pendientes recalculadas con la evidencia actual.').then(reload)}><Icon name="neurology" size={18} />Recalcular</button>}
              {can('eventos.gestionar') && <button className="btn xs danger" disabled={busy} onClick={() => window.confirm(`¿Cerrar ${ev.codigo}? Se liberarán los recursos asignados.`) && run(() => api.post(`/eventos/${ev.id}/cerrar`), `${ev.codigo} cerrado.`).then(() => { reloadList(); setParams({}); })}>Cerrar evento</button>}
            </div>
          </div>
          {ev.usa_protocolo && (
            <div className="note warn" style={{ margin: '16px 20px 0' }}><Icon name="menu_book" />Datos históricos insuficientes para este tipo de evento. Se aplica el protocolo normado (flujo 3.a).</div>
          )}
          {recs.length ? recs.map((r) => {
            const d = DEC[r.estado];
            return (
              <div key={r.id} className="rec" style={{ background: r.estado === 'Descartada' ? '#FAFBFD' : '#fff' }}>
                <div className="rec-n">{r.orden}</div>
                <div className="stack" style={{ gap: 8, minWidth: 0 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, textDecoration: r.estado === 'Modificada' ? 'line-through' : 'none', color: r.estado === 'Modificada' ? 'var(--texto3)' : undefined }}>{r.titulo}</span>
                  {r.titulo_modificado && <span style={{ fontSize: 16, fontWeight: 700 }}><Icon name="edit" size={16} color="var(--naranja-700)" /> {r.titulo_modificado}</span>}
                  <span className="muted" style={{ fontSize: 14, lineHeight: 1.55 }}>{r.sustento}</span>
                  <div className="row">
                    <span className="chip blue" style={{ height: 26 }}><Icon name="apartment" />{r.instituciones}</span>
                    {r.recursos && <span className="chip blue" style={{ height: 26 }}><Icon name="inventory_2" />{r.recursos}</span>}
                    <span className="chip soft" style={{ height: 26 }}>confianza {r.confianza != null ? dec(r.confianza) : 'protocolo'}</span>
                  </div>
                </div>
                <div className="stack" style={{ alignItems: 'flex-end', gap: 6 }}>
                  {r.estado === 'Pendiente' && decisor && (
                    <div className="row" style={{ gap: 6 }}>
                      <button className="btn sm primary" disabled={busy} onClick={() => decidir(r, 'aprobada')}>Aprobar</button>
                      <button className="btn sm outline" disabled={busy} onClick={() => { setModif(r); setTexto(r.titulo); }}>Modificar</button>
                      <button className="btn sm danger icon-only" title="Descartar" disabled={busy} onClick={() => decidir(r, 'descartada')}><Icon name="close" /></button>
                    </div>
                  )}
                  {r.estado === 'Pendiente' && !decisor && <StatusChip estado="Pendiente">Pendiente de decisión</StatusChip>}
                  {d && (
                    <>
                      <div className="row">
                        <span className="chip" style={{ height: 28, background: d[0], color: d[1], fontSize: 13, fontWeight: 700 }}><Icon name={d[2]} />{r.estado}</span>
                        {decisor && <button className="btn ghost" onClick={() => decidir(r, 'deshacer')}>Deshacer</button>}
                      </div>
                      <span className="muted" style={{ fontSize: 12 }}>{r.tarea_codigo ? `Tarea ${r.tarea_codigo} · ` : ''}{d[3]}</span>
                      {r.decidido_por_nombre && <span className="muted" style={{ fontSize: 12 }}>{r.decidido_por_nombre} · {fShort(r.fecha_decision)}</span>}
                    </>
                  )}
                </div>
              </div>
            );
          }) : <Empty icon="lightbulb" title="Sin recomendaciones" text="Use “Recalcular” para generarlas con la evidencia disponible." />}
          {ev.recursos?.length > 0 && (
            <div className="card-body stack" style={{ borderTop: '1px solid var(--borde)' }}>
              <b>Recursos comprometidos en el evento</b>
              <div className="row">
                {ev.recursos.map((x) => <span key={x.id} className="chip blue" style={{ opacity: x.estado === 'Liberado' ? 0.5 : 1 }}><Icon name="inventory_2" />{x.cantidad} {x.nombre} · {x.sigla}{x.estado === 'Liberado' ? ' (liberado)' : ''}</span>)}
              </div>
            </div>
          )}
        </div>
      )}

      {nuevo && <NuevoEvento onClose={() => setNuevo(false)} onDone={(r) => { setNuevo(false); reloadList(); setParams({ sel: r.id }); }} />}
      {modif && (
        <Modal title="Modificar curso de acción" onClose={() => setModif(null)} footer={<>
          <button className="btn sm outline" onClick={() => setModif(null)}>Cancelar</button>
          <button className="btn sm primary" disabled={busy || !texto.trim()} onClick={() => decidir(modif, 'modificada', { titulo_modificado: texto }).then(() => setModif(null))}>Guardar y generar tarea</button>
        </>}>
          <div className="note info"><Icon name="info" />La recomendación original se conserva en el registro junto con su versión modificada.</div>
          <label className="field"><span>Acción modificada</span><textarea className="textarea" value={texto} onChange={(e) => setTexto(e.target.value)} /></label>
        </Modal>
      )}
    </div>
  );
}
