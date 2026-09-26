import { useState } from 'react';
import Icon from '../components/Icon';
import { api } from '../api/client';
import { useApi, useAction } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { PageHead, Loading, StatusChip, LevelBadge, Empty } from '../components/ui';
import { dec, fDate, fShort } from '../utils/format';

const EV = ['modelo:actualizado', 'alerta:nueva', 'alerta:actualizada'];

function Umbrales() {
  const { data, reload } = useApi('/datos/umbrales');
  const { can } = useAuth();
  const toast = useToast();
  const { busy, run } = useAction(toast);
  const [edit, setEdit] = useState({});
  if (!data) return <Loading />;
  const editable = can('modelos.reentrenar');
  return (
    <div className="table-wrap">
      <table className="t">
        <thead><tr><th>AMENAZA</th><th>VARIABLE</th><th>CONDICIÓN</th><th>UMBRAL NORMADO</th><th>PESO</th><th>REGIÓN</th>{editable && <th />}</tr></thead>
        <tbody>
          {data.map((u) => (
            <tr key={u.id}>
              <td style={{ fontWeight: 600 }}>{u.amenaza}</td>
              <td>{u.variable}</td>
              <td className="mono">{u.operador}</td>
              <td>{editable ? (
                <input className="input mono" style={{ height: 34, width: 110 }} value={edit[u.id] ?? u.valor} onChange={(e) => setEdit({ ...edit, [u.id]: e.target.value })} />
              ) : <span className="mono">{u.valor}</span>} <span className="muted">{u.unidad}</span></td>
              <td className="mono">{dec(u.peso, 1)}</td>
              <td className="muted">{u.region || 'Nacional'}</td>
              {editable && <td>{edit[u.id] !== undefined && String(edit[u.id]) !== String(u.valor) && (
                <button className="btn xs primary" disabled={busy} onClick={() => run(() => api.put(`/datos/umbrales/${u.id}`, { valor: Number(String(edit[u.id]).replace(',', '.')) }), 'Umbral actualizado y registrado en bitácora.').then(() => { setEdit({ ...edit, [u.id]: undefined }); reload(); })}>Guardar</button>
              )}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Modelos() {
  const { data: modelos, loading, reload } = useApi('/modelos', EV);
  const [sel, setSel] = useState(null);
  const m = modelos?.find((x) => x.id === sel) || modelos?.[0];
  const { data: versiones, reload: rv } = useApi(m ? `/modelos/${m.id}/versiones` : null, EV);
  const { data: preds } = useApi('/modelos/predicciones/recientes?limit=12', EV);
  const { can } = useAuth();
  const toast = useToast();
  const { busy, run } = useAction(toast);
  const [tab, setTab] = useState('versiones');

  const retrain = () => run(async () => (await api.post(`/modelos/${m.id}/reentrenar`)).data, (r) => `Reentrenamiento de ${r.modelo} ${r.version} iniciado. El modelo en producción sigue operando.`).then(() => { reload(); rv(); });

  if (loading && !modelos) return <Loading />;
  return (
    <div className="page">
      <PageHead kicker="CU-02 · CU-14 · RF-03 · RF-17" title="Análisis predictivo e Inteligencia Artificial" />
      <div className="grid-kpi" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        {modelos?.map((x) => (
          <button key={x.id} className={`hazard-card ${m?.id === x.id ? 'on' : ''}`} style={{ gap: 12 }} onClick={() => setSel(x.id)}>
            <div className="sb"><div className="row" style={{ gap: 8 }}><Icon name={x.icono} size={22} color="var(--azul-700)" /><span style={{ fontSize: 15, fontWeight: 700 }}>{x.hazard}</span></div><span className="mono muted" style={{ fontSize: 12 }}>{x.codigo} {x.version}</span></div>
            <span className="muted" style={{ fontSize: 13 }}>{x.algoritmo}</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {[['F1', x.f1], ['AUC', x.auc], ['Recall', x.recall]].map(([k, v]) => (
                <div key={k} className="metric" style={{ padding: 8, gap: 2 }}><small style={{ fontSize: 11 }}>{k}</small><b style={{ fontSize: 16 }}>{dec(v)}</b></div>
              ))}
            </div>
            <div className="sb" style={{ fontSize: 12 }}>
              <span className="muted">Entrenado {fDate(x.entrenado)}</span>
              <span className="status-dot" style={{ fontSize: 12, color: x.entrenando ? 'var(--naranja-700)' : 'var(--verde)' }}><i className="dot" style={{ background: x.entrenando ? 'var(--naranja-700)' : 'var(--verde)', width: 7, height: 7 }} />{x.entrenando ? 'Entrenando…' : 'Activo'}</span>
            </div>
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-head" style={{ padding: '16px 20px' }}>
          <div className="stack" style={{ gap: 2 }}>
            <b style={{ fontSize: 18 }}>{tab === 'versiones' ? `Historial de versiones · ${m?.hazard}` : tab === 'umbrales' ? 'Umbrales normados configurables (RNF-09)' : 'Inferencias recientes'}</b>
            <small>{tab === 'versiones' ? `${m?.algoritmo} · microservicio de inferencia desacoplado` : tab === 'umbrales' ? 'Ajustables por región sin modificar el código' : 'Cada predicción referencia la versión del modelo que la generó'}</small>
          </div>
          <div className="row">
            <div className="seg">
              {[['versiones', 'Versiones'], ['umbrales', 'Umbrales'], ['predicciones', 'Predicciones']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
            </div>
            {tab === 'versiones' && can('modelos.reentrenar') && <button className="btn primary" disabled={busy || m?.entrenando} onClick={retrain}><Icon name="model_training" />Reentrenar modelo</button>}
          </div>
        </div>
        {tab === 'versiones' && (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>VERSIÓN</th><th>FECHA</th><th>DATOS DE ENTRENAMIENTO</th><th>F1</th><th>AUC</th><th>RECALL</th><th>ESTADO</th></tr></thead>
              <tbody>
                {versiones?.map((v) => (
                  <tr key={v.id}>
                    <td className="mono" style={{ fontWeight: 600 }}>{v.version}</td><td className="mono" style={{ fontSize: 13 }}>{fDate(v.fecha)}</td>
                    <td className="muted" style={{ fontSize: 13 }}>{v.datos_entrenamiento}</td>
                    <td className="mono">{v.f1 != null ? dec(v.f1) : '—'}</td><td className="mono">{v.auc != null ? dec(v.auc) : '—'}</td><td className="mono">{v.recall_m != null ? dec(v.recall_m) : '—'}</td>
                    <td><StatusChip estado={v.estado} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tab === 'umbrales' && <Umbrales />}
        {tab === 'predicciones' && (preds?.length ? preds.map((p) => (
          <div key={p.id} className="list-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto auto', cursor: 'default' }}>
            <div><b>{p.amenaza} · {p.lugar}</b><small className="mono">{p.modelo} · {fShort(p.created_at)} · {p.variables.filter((v) => v.supera).length}/{p.variables.length} variables sobre umbral</small></div>
            <span className="mono" style={{ fontWeight: 600 }}>p = {dec(p.probabilidad)}</span>
            <LevelBadge nivel={p.nivel} small />
          </div>
        )) : <Empty icon="neurology" title="Sin inferencias" />)}
      </div>
    </div>
  );
}
