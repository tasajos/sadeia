import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import { Loading } from './components/ui';

const Tablero = lazy(() => import('./pages/Tablero'));
const Alertas = lazy(() => import('./pages/Alertas'));
const Eventos = lazy(() => import('./pages/Eventos'));
const Ciudadanos = lazy(() => import('./pages/Ciudadanos'));
const Coordinacion = lazy(() => import('./pages/Coordinacion'));
const Fuentes = lazy(() => import('./pages/Fuentes'));
const Modelos = lazy(() => import('./pages/Modelos'));
const Reportes = lazy(() => import('./pages/Reportes'));
const Admin = lazy(() => import('./pages/Admin'));

/** Protege una ruta por permiso (RNF-04). */
function Guard({ perms, children }) {
  const { can } = useAuth();
  return can(...perms) ? children : <Navigate to="/tablero" replace />;
}

export default function App() {
  const { user, ready } = useAuth();
  if (!ready) return <Loading text="Iniciando SADE-IA…" />;
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/tablero" element={<Guard perms={['tablero.ver']}><Tablero /></Guard>} />
          <Route path="/alertas" element={<Guard perms={['alertas.ver']}><Alertas /></Guard>} />
          <Route path="/eventos" element={<Guard perms={['eventos.ver']}><Eventos /></Guard>} />
          <Route path="/ciudadanos" element={<Guard perms={['ciudadanos.ver']}><Ciudadanos /></Guard>} />
          <Route path="/coordinacion" element={<Guard perms={['coordinacion.ver']}><Coordinacion /></Guard>} />
          <Route path="/fuentes" element={<Guard perms={['fuentes.ver']}><Fuentes /></Guard>} />
          <Route path="/modelos" element={<Guard perms={['modelos.ver']}><Modelos /></Guard>} />
          <Route path="/reportes" element={<Guard perms={['reportes.ver']}><Reportes /></Guard>} />
          <Route path="/admin" element={<Guard perms={['admin.usuarios', 'admin.roles', 'bitacora.ver']}><Admin /></Guard>} />
          <Route path="*" element={<Navigate to="/tablero" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
