import ChatShell from './components/ChatShell'
import AnalyticsDashboard from './components/AnalyticsDashboard'
import './index.css'

// Fase 2: la vista principal es ChatShell (layout nuevo, datos mock).
// VoiceChat.jsx se conserva intacto con el motor; su lógica se porta a
// ChatShell en Fase 3. El acceso admin (?dashboard=true) no cambia.
function App() {
  const isDashboard = window.location.search.includes('dashboard=true');

  if (isDashboard) {
    return <AnalyticsDashboard onClose={() => window.close()} />;
  }

  return <ChatShell />;
}

export default App
