import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './styles.css';
import { AuthProvider, useAuth } from './auth';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { ImportPage } from './pages/Import';
import { ImportDetailPage } from './pages/ImportDetail';
import { HistoryPage } from './pages/History';
import { ReconciliationPage } from './pages/Reconciliation';
import { DivergencesPage } from './pages/Divergences';
import { ContractPage } from './pages/Contract';
import { LayoutsPage } from './pages/Layouts';
import { AuditPage } from './pages/Audit';
import { UsersPage } from './pages/Users';
import { SettingsPage } from './pages/Settings';

function App() {
  const { user } = useAuth();
  if (!user) return <LoginPage />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="importacao" element={<ImportPage />} />
        <Route path="importacao/:id" element={<ImportDetailPage />} />
        <Route path="historico" element={<HistoryPage />} />
        <Route path="batimentos" element={<ReconciliationPage />} />
        <Route path="pendencias" element={<DivergencesPage />} />
        <Route path="contratos" element={<ContractPage />} />
        <Route path="contratos/:key" element={<ContractPage />} />
        <Route path="layouts" element={<LayoutsPage />} />
        <Route path="auditoria" element={<AuditPage />} />
        <Route path="usuarios" element={<UsersPage />} />
        <Route path="configuracoes" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
