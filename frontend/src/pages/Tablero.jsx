import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { PageHead, Kpi, Card, LevelBadge, Loading, ErrorNote, Bar, Empty } from '../components/ui';
import { SituationMap } from '../components/MapView';
import { ago, fShort, dec } from '../utils/format';

const EVENTS = ['alerta:nueva', 'alerta:actualizada', 'evento:nuevo', 'evento:actualizado', 'tarea:actualizada', 'recurso:actualizado'];

export default function Tablero() {
  const { data, error, loading, updatedAt } = useApi('/tablero', EVENTS);
  const { can } = useAuth();
  const nav = useNavigate();
  if (loading && !data) return <Loading />;
  if (!data) return <ErrorNote error={error} />;

  const openAlert = (id) => can('alertas.ver') && nav(`/alertas?sel=${id}`);
  const openEvent = (id) => can('eventos.ver') && nav(`/eventos?sel=${id}`);

  return (
    <div className="page">
      <PageHead kicker="CU-09 · RF-12" title="Tablero de situación">
        <span className="row muted" style={{ fontSize: 13 }}><Icon name="sync" size={18} />Actualizado {ago(updatedAt)} · consulta {dec(data.consultaMs / 1000, 1)} s</span>
      </PageHead>

      <div className="grid-kpi">
        {data.kpis.map((k) => <Kpi key={k.label} {...k} />)}
      </div>

      <div className="two-col">
        <Card title="Mapa de amenazas activas" actions={<small className="muted">9 departamentos · Leaflet / OpenStreetMap</small>} style={{ overflow: 'hidden' }}>
          <SituationMap points={data.mapa} onSelect={(p) => openAlert(p.id)} />
        </Card>
        <Card title="Alertas activas" actions={can('alertas.ver') && <button className="btn ghost" onClick={() => nav('/alertas')}>Ver todas</button>}>
          <div style={{ overflow: 'auto', maxHeight: 480 }}>
            {data.alertas.length ? data.alertas.map((a) => (
              <button key={a.id} className="list-row" onClick={() => openAlert(a.id)}>
                <div className="ic"><Icon name={a.icono} /></div>
                <div style={{ minWidth: 0 }}>
                  <b>{a.amenaza} · {a.lugar}</b>
                  <small className="mono">{a.codigo} · {a.horizonte}</small>
                </div>
                <LevelBadge nivel={a.nivel} />
              </button>
            )) : <Empty icon="check_circle" title="Sin alertas activas" />}
          </div>
        </Card>
      </div>

      <div className="auto-col">
        <Card title="Eventos en curso">
          {data.eventos.length ? data.eventos.map((e) => (
            <button key={e.id} className="list-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }} onClick={() => openEvent(e.id)}>
              <div>
                <b>{e.titulo}</b>
                <small><span className="mono">{e.codigo}</span> · desde {fShort(e.fecha_inicio)} · {e.impacto || 'impacto en evaluación'}</small>
              </div>
              <LevelBadge nivel={e.nivel} />
            </button>
          )) : <Empty icon="emergency_home" title="Sin eventos en curso" />}
        </Card>
        <Card title="Avance de tareas por institución" bodyClass="card-body">
          <div className="stack" style={{ gap: 14 }}>
            {data.avanceInstituciones.length ? data.avanceInstituciones.map((p) => (
              <div key={p.sigla} className="stack" style={{ gap: 6 }}>
                <div className="sb" style={{ fontSize: 13 }}>
                  <span style={{ fontWeight: 600 }}>{p.inst}</span>
                  <span className="muted">{p.done} de {p.total} · <span className="mono">{p.pct} %</span></span>
                </div>
                <Bar pct={p.pct} />
              </div>
            )) : <Empty icon="groups" title="Sin tareas asignadas" />}
          </div>
        </Card>
      </div>
    </div>
  );
}
