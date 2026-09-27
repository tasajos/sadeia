import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';
import { api } from '../api/client';
import { useApi, useAction } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { PageHead, StatusChip, Loading, Empty, Modal, Seg, Bar, LevelBadge } from '../components/ui';
import { LV } from '../utils/constants';
import { fShort, num } from '../utils/format';
import PhotoViewer from '../components/PhotoViewer';

const EV = ['tarea:actualizada', 'tarea:nueva', 'recurso:actualizado', 'evento:nuevo', 'evento:actualizado'];
const NIVEL_ORDEN = { roja: 0, naranja: 1, amarilla: 2, verde: 3 };

function TareaModal({ id, onClose, onSaved }) {
  const { data: t } = useApi(`/coordinacion/tareas/${id}`);
  const { can } = useAuth();
  const toast = useToast();
  const { busy, run } = useAction(toast);
  const [avance, setAvance] = useState(null);
  const [obs, setObs] = useState('');
  const [foto, setFoto] = useState(null);
  const [visor, setVisor] = useState(null);
  if (!t) return <Modal title="Tarea" onClose={onClose}><Loading /></Modal>;
  const val = avance ?? t.avance;
  const puede = can('tareas.reportar', 'coordinacion.gestionar');
  const enviar = () => {
    const fd = new FormData();
    fd.append('avance', val);
    fd.append('observacion', obs);
    if (foto) fd.append('fotos', foto);
    return run(() => api.post(`/coordinacion/tareas/${t.id}/avance`, fd), `Avance de ${t.codigo} (${val} %) registrado.`).then((r) => r && onSaved());
  };
  return (
    <Modal title={`${t.codigo} · ${t.evento_codigo}`} onClose={onClose} footer={puede && t.estado !== 'Completada' && <>
      <button className="btn sm outline" onClick={onClose}>Cerrar</button>
      <button className="btn sm primary" disabled={busy} onClick={enviar}>Enviar avance</button>
    </>}>
      <div className="stack" style={{ gap: 4 }}>
        <b style={{ fontSize: 18 }}>{t.titulo}</b>
        <span className="muted">{t.institucion} · {t.responsable || 'sin responsable'} · plazo {fShort(t.plazo)}</span>
        <div className="row"><StatusChip estado={t.estado} /><span className="mono">{t.avance} %</span></div>
      </div>
      {puede && t.estado !== 'Completada' && (
        <>
          <div className="stack"><span style={{ fontSize: 13, fontWeight: 600 }}>Avance</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {[25, 50, 75, 100].map((p) => (
                <button key={p} className="btn mono" onClick={() => setAvance(p)} style={{ background: p === val ? 'var(--azul-900)' : '#fff', color: p === val ? '#fff' : 'var(--tinta)', borderColor: 'var(--borde)' }}>{p}%</button>
              ))}
            </div>
          </div>
          <label className="field"><span>Observación</span><textarea className="textarea" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="340 familias evacuadas a U.E. Cristo Rey…" /></label>
          <label className="field"><span>Foto (opcional)</span><input type="file" accept="image/*" onChange={(e) => setFoto(e.target.files[0])} /></label>
        </>
      )}
      {t.recursos?.length > 0 && (
        <div className="stack">
          <b>Recursos movilizados por {t.institucion_sigla}</b>
          <div className="row" style={{ gap: 6 }}>
            {t.recursos.map((x) => (
              <span key={x.id} className="chip soft" style={{ opacity: x.estado === 'Retornado' ? 0.55 : 1 }}>
                {x.tipo === 'equipamiento' || x.tipo === 'material' ? `${x.cantidad} ${x.unidad || ''} · ` : ''}{x.descripcion}{x.estado === 'Retornado' ? ' (retornado)' : ''}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="stack">
        <b>Historial de avance</b>
        {t.avances.length ? t.avances.map((a) => (
          <div key={a.id} className="sb" style={{ borderBottom: '1px solid var(--fondo)', paddingBottom: 8, alignItems: 'flex-start' }}>
            <div className="stack" style={{ gap: 2 }}><span style={{ fontWeight: 600 }}>{a.usuario}</span><span className="muted" style={{ fontSize: 13 }}>{a.observacion || '—'}</span>
              {a.foto && <button type="button" className="link-btn" onClick={() => setVisor(a)}><Icon name="photo" size={16} />Ver foto</button>}</div>
            <div className="stack" style={{ alignItems: 'flex-end', gap: 2 }}><span className="mono">{a.avance} %</span><span className="muted mono" style={{ fontSize: 12 }}>{fShort(a.fecha)}</span></div>
          </div>
        )) : <span className="muted">Sin reportes aún.</span>}
      </div>
      {visor && <PhotoViewer fotos={[visor.foto]} titulo={t.titulo} subtitulo={`Avance ${visor.avance} % · ${visor.usuario}`} onClose={() => setVisor(null)} />}
    </Modal>
  );
}

/** Asignación directa de una tarea; con `eventoId` el evento queda fijado (desde la página del evento). */
export function NuevaTarea({ onClose, onSaved, eventoId }) {
  const { data: cat } = useApi('/admin/catalogos');
  const { data: evs } = useApi('/eventos');
  const toast = useToast();
  const { busy, run } = useAction(toast);
  const def = new Date(Date.now() + 12 * 3600e3);
  const [f, setF] = useState({ evento_id: eventoId ? String(eventoId) : '', titulo: '', institucion_id: '', responsable: '', plazo: new Date(def.getTime() - def.getTimezoneOffset() * 60000).toISOString().slice(0, 16) });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title="Asignar tarea (CU-08)" onClose={onClose} footer={<>
      <button className="btn sm outline" onClick={onClose}>Cancelar</button>
      <button className="btn sm primary" disabled={busy || !f.evento_id || !f.titulo || !f.institucion_id} onClick={() => run(async () => (await api.post('/coordinacion/tareas', f)).data, (r) => `Tarea ${r.codigo} asignada.`).then((r) => r && onSaved())}>Asignar</button>
    </>}>
      {!eventoId && <label className="field"><span>Evento</span><select className="select" value={f.evento_id} onChange={set('evento_id')}><option value="">Seleccione…</option>{evs?.map((e) => <option key={e.id} value={e.id}>{e.codigo} · {e.titulo}</option>)}</select></label>}
      <label className="field"><span>Tarea</span><input className="input" value={f.titulo} onChange={set('titulo')} /></label>
      <div className="form-grid">
        <label className="field"><span>Institución responsable</span><select className="select" value={f.institucion_id} onChange={set('institucion_id')}><option value="">Seleccione…</option>{cat?.instituciones.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}</select></label>
        <label className="field"><span>Responsable</span><input className="input" value={f.responsable} onChange={set('responsable')} /></label>
        <label className="field"><span>Plazo</span><input className="input" type="datetime-local" value={f.plazo} onChange={set('plazo')} /></label>
      </div>
    </Modal>
  );
}

function AsignarRecurso({ recurso, onClose, onSaved }) {
  const { data: evs } = useApi('/eventos');
  const toast = useToast();
  const { busy, run } = useAction(toast);
  const [evento, setEvento] = useState('');
  const [cant, setCant] = useState(1);
  return (
    <Modal title={`Asignar ${recurso.nombre}`} onClose={onClose} footer={<>
      <button className="btn sm outline" onClick={onClose}>Cancelar</button>
      <button className="btn sm primary" disabled={busy || !evento} onClick={() => run(() => api.post(`/coordinacion/recursos/${recurso.id}/asignar`, { evento_id: evento, cantidad: cant }), 'Recurso asignado al evento.').then((r) => r && onSaved())}>Asignar</button>
    </>}>
      <span className="muted">Disponibles: <b className="mono">{num(recurso.disponibles)}</b> {recurso.unidad} ({recurso.institucion})</span>
      <label className="field"><span>Evento</span><select className="select" value={evento} onChange={(e) => setEvento(e.target.value)}><option value="">Seleccione…</option>{evs?.map((e) => <option key={e.id} value={e.id}>{e.codigo} · {e.titulo}</option>)}</select></label>
      <label className="field"><span>Cantidad</span><input className="input" type="number" min={1} max={recurso.disponibles} value={cant} onChange={(e) => setCant(e.target.value)} /></label>
    </Modal>
  );
}

export default function Coordinacion() {
  const [filtro, setFiltro] = useState('Todas');
  const { data, loading, reload } = useApi(`/coordinacion/tareas?estado=${encodeURIComponent(filtro)}`, EV);
  const { data: recursos, reload: reloadRec } = useApi('/coordinacion/recursos', EV);
  const { can } = useAuth();
  const [tarea, setTarea] = useState(null);
  const [nueva, setNueva] = useState(false);
  const [asignar, setAsignar] = useState(null);
  const nav = useNavigate();
  const [tipo, setTipo] = useState('todos');
  const [plegados, setPlegados] = useState(() => new Set());
  const gestionar = can('coordinacion.gestionar');
  const c = data?.conteo || {};
  const plegar = (id) => setPlegados((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // Tipos de evento (amenaza) presentes en la vista, para filtrar
  const tipos = Object.values((data?.tareas || []).reduce((m, t) => {
    m[t.amenaza_codigo] ||= { codigo: t.amenaza_codigo, nombre: t.amenaza, icono: t.amenaza_icono, n: 0 };
    m[t.amenaza_codigo].n++;
    return m;
  }, {})).sort((a, b) => b.n - a.n);
  const tipoActivo = tipos.some((x) => x.codigo === tipo) ? tipo : 'todos';

  // Un bloque por evento: los más graves y con más tareas vencidas primero
  const grupos = Object.values((data?.tareas || []).filter((t) => tipoActivo === 'todos' || t.amenaza_codigo === tipoActivo).reduce((m, t) => {
    m[t.evento_id] ||= { id: t.evento_id, codigo: t.evento_codigo, titulo: t.evento_titulo, nivel: t.evento_nivel, amenaza: t.amenaza, icono: t.amenaza_icono, tareas: [] };
    m[t.evento_id].tareas.push(t);
    return m;
  }, {})).sort((a, b) => (NIVEL_ORDEN[a.nivel] - NIVEL_ORDEN[b.nivel])
    || (b.tareas.filter((t) => t.estado === 'Vencida').length - a.tareas.filter((t) => t.estado === 'Vencida').length));

  return (
    <div className="page">
      <PageHead kicker="CU-07 · CU-08 · RF-10 · RF-11" title="Coordinación interinstitucional">
        <Seg value={filtro} onChange={setFiltro} options={['Todas', 'En curso', 'Pendiente', 'Vencida', 'Completada'].map((f) => ({ value: f, label: `${f} · ${c[f] || 0}` }))} />
        {gestionar && <button className="btn sm primary" onClick={() => setNueva(true)}><Icon name="add_task" />Asignar tarea</button>}
      </PageHead>

      <div className="two-col" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(280px,340px)', alignItems: 'start' }}>
        <div className="stack" style={{ gap: 12, minWidth: 0 }}>
          {tipos.length > 1 && (
            <div className="tipo-filtro" role="radiogroup" aria-label="Tipo de evento">
              <span className="muted">Tipo de evento</span>
              {[{ codigo: 'todos', nombre: 'Todos', icono: 'apps', n: data.tareas.length }, ...tipos].map((x) => (
                <button key={x.codigo} type="button" role="radio" aria-checked={tipoActivo === x.codigo} className={tipoActivo === x.codigo ? 'on' : ''} onClick={() => setTipo(x.codigo)}>
                  <Icon name={x.icono} size={16} />{x.nombre}<b>{x.n}</b>
                </button>
              ))}
            </div>
          )}
          {loading && !data ? <div className="card"><Loading /></div> : grupos.length ? grupos.map((g) => {
            const cerrado = plegados.has(g.id);
            const vencidas = g.tareas.filter((t) => t.estado === 'Vencida').length;
            const prom = Math.round(g.tareas.reduce((s, t) => s + t.avance, 0) / g.tareas.length);
            const lv = LV[g.nivel] || LV.verde;
            return (
              <div key={g.id} className="card evt-grupo" style={{ borderLeftColor: lv.bg }}>
                <div className="evt-grupo-head">
                  <button type="button" className="evt-grupo-toggle" onClick={() => plegar(g.id)} aria-expanded={!cerrado}>
                    <span className="evt-grupo-ic" style={{ background: lv.bg, color: lv.fg }}><Icon name={g.icono || 'emergency_home'} size={22} /></span>
                    <span className="stack" style={{ gap: 2, minWidth: 0, textAlign: 'left' }}>
                      <span className="mono muted" style={{ fontSize: 11 }}>{g.amenaza.toUpperCase()} · {g.codigo}</span>
                      <b style={{ fontSize: 16 }}>{g.titulo}</b>
                    </span>
                    <Icon name={cerrado ? 'expand_more' : 'expand_less'} color="var(--texto3)" />
                  </button>
                  <div className="row evt-grupo-stats">
                    <LevelBadge nivel={g.nivel} small />
                    <span className="muted">{g.tareas.length} tarea{g.tareas.length > 1 ? 's' : ''}</span>
                    {vencidas > 0 && <span style={{ color: 'var(--roja)', fontWeight: 700 }}>{vencidas} vencida{vencidas > 1 ? 's' : ''}</span>}
                    <span className="row" style={{ gap: 6, flexWrap: 'nowrap', width: 130 }}><span style={{ flex: 1 }}><Bar pct={prom} thin /></span><span className="mono" style={{ fontSize: 12 }}>{prom}%</span></span>
                    {can('eventos.ver') && <button className="btn xs ghost" onClick={() => nav(`/eventos?sel=${g.id}`)}>Ver evento</button>}
                  </div>
                </div>
                {!cerrado && (
                  <div className="table-wrap">
                    <table className="t" style={{ tableLayout: 'fixed' }}>
                      <colgroup><col style={{ width: 72 }} /><col /><col style={{ width: '22%' }} /><col style={{ width: 110 }} /><col style={{ width: 110 }} /><col style={{ width: 150 }} /></colgroup>
                      <thead><tr><th>CÓDIGO</th><th>TAREA</th><th>INSTITUCIÓN</th><th>PLAZO</th><th>ESTADO</th><th>AVANCE</th></tr></thead>
                      <tbody>
                        {g.tareas.map((t) => (
                          <tr key={t.id} onClick={() => setTarea(t.id)} style={{ cursor: 'pointer' }}>
                            <td className="mono muted" style={{ fontSize: 12 }}>{t.codigo}</td>
                            <td><div className="stack" style={{ gap: 2 }}><span style={{ fontWeight: 600 }}>{t.titulo}</span><span className="muted" style={{ fontSize: 12 }}>{t.responsable || 'Sin responsable'}</span></div></td>
                            <td>{t.institucion}</td>
                            <td className="mono" style={{ fontSize: 13, color: t.estado === 'Vencida' ? 'var(--roja)' : undefined }}>{fShort(t.plazo)}</td>
                            <td><StatusChip estado={t.estado} /></td>
                            <td><div className="row" style={{ flexWrap: 'nowrap' }}><div style={{ flex: 1 }}><Bar pct={t.avance} thin /></div><span className="mono" style={{ fontSize: 12, width: 36, textAlign: 'right' }}>{t.avance}%</span></div></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          }) : <div className="card"><Empty icon="task" title="Sin tareas en esta vista" /></div>}
        </div>

        <div className="card">
          <div className="card-head"><b>Recursos</b><small>asignados / disponibles</small></div>
          <div className="card-body stack" style={{ gap: 16 }}>
            {recursos?.map((r) => (
              <div key={r.id} className="stack" style={{ gap: 6 }}>
                <div className="sb">
                  <div className="stack" style={{ gap: 0 }}><span style={{ fontWeight: 600 }}>{r.nombre}</span><span className="muted" style={{ fontSize: 12 }}>{r.institucion}</span></div>
                  <div className="row" style={{ gap: 4 }}>
                    <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{num(r.usados)} / {num(r.total)}</span>
                    {gestionar && r.disponibles > 0 && <button className="icon-btn" title="Asignar a un evento" onClick={() => setAsignar(r)}><Icon name="add_circle" size={20} /></button>}
                  </div>
                </div>
                <Bar pct={(r.usados / r.total) * 100} color="var(--azul-900)" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {tarea && <TareaModal id={tarea} onClose={() => setTarea(null)} onSaved={() => { setTarea(null); reload(); }} />}
      {nueva && <NuevaTarea onClose={() => setNueva(false)} onSaved={() => { setNueva(false); reload(); }} />}
      {asignar && <AsignarRecurso recurso={asignar} onClose={() => setAsignar(null)} onSaved={() => { setAsignar(null); reloadRec(); }} />}
    </div>
  );
}
