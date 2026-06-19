import ChatShell from './components/ChatShell'
import AnalyticsDashboard from './components/AnalyticsDashboard'
import './index.css'

// La vista principal es ChatShell (layout nuevo + motor real portado).
// VoiceChat.jsx fue archivado en archive/frontend/ tras validar ChatShell
// en vivo (rollback reversible). El acceso admin (?dashboard=true) no cambia.
function App() {
  const isDashboard = window.location.search.includes('dashboard=true');

  if (isDashboard) {
    return <AnalyticsDashboard onClose={() => window.close()} />;
  }

  return <ChatShell />;
}

export default App
