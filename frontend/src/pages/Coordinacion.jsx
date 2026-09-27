import { useState } from 'react';
import Icon from '../components/Icon';
import { api } from '../api/client';
import { useApi, useAction } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { PageHead, StatusChip, Loading, Empty, Modal, Seg, Bar } from '../components/ui';
import { fShort, num } from '../utils/format';
import PhotoViewer from '../components/PhotoViewer';

const EV = ['tarea:actualizada', 'tarea:nueva', 'recurso:actualizado', 'evento:nuevo'];

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
  const gestionar = can('coordinacion.gestionar');
  const c = data?.conteo || {};

  return (
    <div className="page">
      <PageHead kicker="CU-07 · CU-08 · RF-10 · RF-11" title="Coordinación interinstitucional">
        <Seg value={filtro} onChange={setFiltro} options={['Todas', 'En curso', 'Pendiente', 'Vencida', 'Completada'].map((f) => ({ value: f, label: `${f} · ${c[f] || 0}` }))} />
        {gestionar && <button className="btn sm primary" onClick={() => setNueva(true)}><Icon name="add_task" />Asignar tarea</button>}
      </PageHead>

      <div className="two-col" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(280px,340px)', alignItems: 'start' }}>
        <div className="card table-wrap">
          {loading && !data ? <Loading /> : data?.tareas.length ? (
            <table className="t">
              <thead><tr><th>CÓDIGO</th><th>TAREA</th><th>INSTITUCIÓN</th><th>PLAZO</th><th>ESTADO</th><th style={{ width: 150 }}>AVANCE</th></tr></thead>
              <tbody>
                {data.tareas.map((t) => (
                  <tr key={t.id} onClick={() => setTarea(t.id)} style={{ cursor: 'pointer' }}>
                    <td className="mono muted" style={{ fontSize: 12 }}>{t.codigo}</td>
                    <td><div className="stack" style={{ gap: 2 }}><span style={{ fontWeight: 600 }}>{t.titulo}</span><span className="muted" style={{ fontSize: 12 }}>{t.responsable || 'Sin responsable'} · {t.evento_codigo}</span></div></td>
                    <td>{t.institucion}</td>
                    <td className="mono" style={{ fontSize: 13, color: t.estado === 'Vencida' ? 'var(--roja)' : undefined }}>{fShort(t.plazo)}</td>
                    <td><StatusChip estado={t.estado} /></td>
                    <td><div className="row" style={{ flexWrap: 'nowrap' }}><div style={{ flex: 1 }}><Bar pct={t.avance} thin /></div><span className="mono" style={{ fontSize: 12, width: 36, textAlign: 'right' }}>{t.avance}%</span></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty icon="task" title="Sin tareas en esta vista" />}
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
