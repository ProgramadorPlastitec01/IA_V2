import KioskApp from './components/kiosk/KioskApp'
import AnalyticsDashboard from './components/AnalyticsDashboard'
import './index.css'

// La vista principal es KioskApp (rediseño 2026-10-09: pantalla de inicio +
// vistas de Chat/Documentos/FAQ/Guía/Buzón, tema claro, kiosco táctil).
// El ChatShell de 2 paneles (chat-first) queda respaldado y sin referencias
// en backups/ui_2026-10-09/ChatShell_2panel_qa.jsx. El acceso admin
// (?dashboard=true) no cambia.
function App() {
  const isDashboard = window.location.search.includes('dashboard=true');

  if (isDashboard) {
    return <AnalyticsDashboard onClose={() => window.close()} />;
  }

  return <KioskApp />;
}

export default App
