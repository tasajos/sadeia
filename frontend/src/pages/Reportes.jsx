import { Bar as BarChart } from 'react-chartjs-2';
import { Chart as ChartJS, BarElement, LinearScale, CategoryScale, Tooltip, Legend } from 'chart.js';
import Icon from '../components/Icon';
import { download } from '../api/client';
import { useApi, useAction } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { PageHead, Kpi, Loading, Empty } from '../components/ui';
import { LV } from '../utils/constants';
import { fDateTime } from '../utils/format';

ChartJS.register(BarElement, LinearScale, CategoryScale, Tooltip, Legend);

export default function Reportes() {
  const { data: kpis } = useApi('/reportes/indicadores', ['alerta:actualizada', 'tarea:actualizada']);
  const { data: meses } = useApi('/reportes/alertas-mes', ['alerta:nueva']);
  const { data: gen, reload } = useApi('/reportes/generados');
  const { can } = useAuth();
  const toast = useToast();
  const { busy, run } = useAction(toast);
  const exp = (f) => run(() => download('/reportes/exportar', { formato: f }, `consolidado.${f.toLowerCase()}`), `Reporte consolidado exportado en ${f}.`).then(reload);

  return (
    <div className="page">
      <PageHead kicker="CU-10 · RF-13" title="Reportes e indicadores">
        {can('reportes.exportar') && <>
          <button className="btn primary" disabled={busy} onClick={() => exp('PDF')}><Icon name="download" />Exportar PDF</button>
          <button className="btn outline" disabled={busy} onClick={() => exp('XLSX')}>XLSX</button>
          <button className="btn outline" disabled={busy} onClick={() => exp('CSV')}>CSV</button>
        </>}
      </PageHead>
      <div className="grid-kpi" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {kpis ? kpis.map((k, i) => <Kpi key={k.clave} label={k.label} value={k.value} note={k.note} mono dark={i === 0} />) : <Loading />}
      </div>
      <div className="card">
        <div className="card-head"><b>Alertas emitidas por mes · {new Date().getFullYear()}</b><small>Por nivel del D.S. N.° 2342</small></div>
        <div className="card-body">
          {meses ? (
            <div className="chart-box">
              <BarChart
                data={{
                  labels: meses.map((m) => m.name),
                  datasets: ['roja', 'naranja', 'amarilla'].map((l) => ({ label: l[0].toUpperCase() + l.slice(1), data: meses.map((m) => m[l]), backgroundColor: LV[l].hex, borderRadius: 3, maxBarThickness: 56 }))
                }}
                options={{ maintainAspectRatio: false, plugins: { legend: { position: 'top', align: 'end', labels: { boxWidth: 10, font: { family: 'Public Sans' } } } }, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { precision: 0, font: { family: 'IBM Plex Mono' } } } } }}
              />
            </div>
          ) : <Loading />}
        </div>
      </div>
      <div className="card">
        <div className="card-head"><b>Reportes generados</b></div>
        {gen?.length ? gen.map((r) => (
          <div key={r.id} className="list-row" style={{ cursor: r.archivo ? 'pointer' : 'default' }} onClick={() => r.archivo && run(() => download(`/reportes/generados/${r.id}/archivo`, null, r.archivo, 'get'))}>
            <Icon name="description" size={24} color="var(--azul-700)" />
            <div><b>{r.nombre}</b><small>Generado {fDateTime(r.created_at)} · {r.generado_por}</small></div>
            <span className="chip blue mono">{r.formato}</span>
          </div>
        )) : <Empty icon="description" title="Aún no se generaron reportes" />}
      </div>
    </div>
  );
}
