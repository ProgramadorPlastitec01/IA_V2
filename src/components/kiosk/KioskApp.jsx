import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CompanyLogo from '../CompanyLogo';
import { API_BASE_URL } from '../../utils/apiConfig';
import HomeView from './HomeView';
import ChatView from './ChatView';
import DocumentsView from './DocumentsView';
import FaqView from './FaqView';
import SuggestionsView from './SuggestionsView';
import GuideView from './GuideView';
import AboutRitaModal from './AboutRitaModal.jsx';
import { HandsHelpingIcon, FlaskIcon, SyncAltIcon, HourglassHalfIcon, LockIcon, PenIcon } from './shared.jsx';

// Kiosco compartido: si hay una pregunta/respuesta o un borrador de sugerencia
// en pantalla y nadie interactúa en 5 minutos, se avisa con cuenta regresiva
// antes de reiniciar — así la siguiente persona no hereda la consulta anterior.
const INACTIVITY_WARNING_MS = 5 * 60 * 1000;
const INACTIVITY_COUNTDOWN_S = 10;

const VIEW_TITLES = {
    documents: 'Documentos',
    faqs: 'Preguntas Frecuentes',
    suggestions: 'Buzón de Sugerencias',
    guide: 'Guía de Uso',
    chat: 'Asistente IA',
};

/**
 * KioskApp — shell del rediseño 2026-10-09 (kiosco de autoservicio, tema
 * claro). Reemplaza al ChatShell de 2 paneles como vista principal de la SPA;
 * el panel de administración (?dashboard=true) no cambia.
 * Mantiene toda la funcionalidad real: motor RAG híbrido, voz/TTS, feedback
 * de respuestas y buzón de sugerencias ahora persistidos en SQLite, acceso
 * admin por PIN y auto-reinicio por inactividad. Se quitó el selector
 * Kiosco/Móvil del prototipo (era solo para validar el responsive en diseño).
 */
const KioskApp = () => {
    const [view, setView] = useState('home');
    const [resetSignal, setResetSignal] = useState(0);
    const [pendingAutoQuery, setPendingAutoQuery] = useState(null);
    const [hasContent, setHasContent] = useState(false);
    const [systemOnline, setSystemOnline] = useState(true);
    const [confirmingReset, setConfirmingReset] = useState(false);
    const [showInactivityModal, setShowInactivityModal] = useState(false);
    const [inactivityCountdown, setInactivityCountdown] = useState(INACTIVITY_COUNTDOWN_S);
    const [showPinModal, setShowPinModal] = useState(false);
    const [isAboutOpen, setIsAboutOpen] = useState(false);

    const confirmResetTimerRef = useRef(null);
    const inactivityCountdownTimerRef = useRef(null);
    const lastInteractionRef = useRef(0);
    const secretClickRef = useRef(0);

    // Date.now() es impuro: se fija en un efecto (post-montaje), no durante el
    // render. Corre antes que el intervalo de chequeo de inactividad (abajo).
    useEffect(() => { lastInteractionRef.current = Date.now(); }, []);

    const navigateTo = useCallback((nextView) => {
        setView(nextView);
        lastInteractionRef.current = Date.now();
    }, []);

    const handlePickFaq = useCallback((question) => {
        setPendingAutoQuery(question);
        setView('chat');
        lastInteractionRef.current = Date.now();
    }, []);

    // ── Reinicio completo (botón "Reiniciar" o inactividad) ───────────────
    const hardReset = useCallback(() => {
        setShowInactivityModal(false);
        clearInterval(inactivityCountdownTimerRef.current);
        setResetSignal(s => s + 1);
        setPendingAutoQuery(null);
        setHasContent(false);
        setView('home');
        lastInteractionRef.current = Date.now();
    }, []);

    const handleResetClick = () => {
        if (confirmingReset) {
            clearTimeout(confirmResetTimerRef.current);
            setConfirmingReset(false);
            hardReset();
            return;
        }
        setConfirmingReset(true);
        confirmResetTimerRef.current = setTimeout(() => setConfirmingReset(false), 3000);
    };

    // ── Estado de conexión con el backend ──────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        const check = () => fetch(`${API_BASE_URL}/api/health`).then(r => r.json())
            .then(d => { if (!cancelled) setSystemOnline(d.status === 'ready'); })
            .catch(() => { if (!cancelled) setSystemOnline(false); });
        check();
        const interval = setInterval(check, 30000);
        return () => { cancelled = true; clearInterval(interval); };
    }, []);

    // ── Seguimiento de interacción global (para el aviso de inactividad) ───
    useEffect(() => {
        const markInteraction = () => { lastInteractionRef.current = Date.now(); };
        window.addEventListener('mousemove', markInteraction, { passive: true });
        window.addEventListener('touchstart', markInteraction, { passive: true });
        window.addEventListener('keydown', markInteraction);
        window.addEventListener('click', markInteraction);
        return () => {
            window.removeEventListener('mousemove', markInteraction);
            window.removeEventListener('touchstart', markInteraction);
            window.removeEventListener('keydown', markInteraction);
            window.removeEventListener('click', markInteraction);
        };
    }, []);

    const startInactivityCountdown = useCallback(() => {
        setShowInactivityModal(true);
        setInactivityCountdown(INACTIVITY_COUNTDOWN_S);
        clearInterval(inactivityCountdownTimerRef.current);
        inactivityCountdownTimerRef.current = setInterval(() => {
            setInactivityCountdown(s => {
                if (s <= 1) { hardReset(); return 0; }
                return s - 1;
            });
        }, 1000);
    }, [hardReset]);

    const dismissInactivityModal = () => {
        clearInterval(inactivityCountdownTimerRef.current);
        setShowInactivityModal(false);
        lastInteractionRef.current = Date.now();
    };

    // Solo advierte si hay contenido real en pantalla que se perdería (una
    // respuesta activa o un borrador de sugerencia sin enviar).
    useEffect(() => {
        const interval = setInterval(() => {
            if (!hasContent || showInactivityModal) return;
            if (Date.now() - lastInteractionRef.current >= INACTIVITY_WARNING_MS) {
                startInactivityCountdown();
            }
        }, 5000);
        return () => clearInterval(interval);
    }, [hasContent, showInactivityModal, startInactivityCountdown]);

    useEffect(() => () => {
        clearTimeout(confirmResetTimerRef.current);
        clearInterval(inactivityCountdownTimerRef.current);
    }, []);

    // ── Acceso admin: 5 clics en el logo → modal PIN ──────────────────────
    const handleSecretClick = () => {
        secretClickRef.current += 1;
        if (navigator.vibrate) navigator.vibrate(20);
        if (secretClickRef.current >= 5) { setShowPinModal(true); secretClickRef.current = 0; }
        if (secretClickRef.current === 1) setTimeout(() => { secretClickRef.current = 0; }, 2500);
    };

    const renderView = () => {
        switch (view) {
            case 'chat':
                return (
                    <ChatView
                        onHome={() => navigateTo('home')}
                        onNavigate={navigateTo}
                        autoQuery={pendingAutoQuery}
                        onAutoQueryConsumed={() => setPendingAutoQuery(null)}
                        onContentChange={setHasContent}
                        resetSignal={resetSignal}
                    />
                );
            case 'documents':
                return <DocumentsView onHome={() => navigateTo('home')} onNavigate={navigateTo} />;
            case 'faqs':
                return <FaqView onHome={() => navigateTo('home')} onPick={handlePickFaq} />;
            case 'suggestions':
                return (
                    <SuggestionsView
                        onHome={() => navigateTo('home')}
                        onContentChange={setHasContent}
                        resetSignal={resetSignal}
                    />
                );
            case 'guide':
                return <GuideView onHome={() => navigateTo('home')} onNavigate={navigateTo} />;
            default:
                return <HomeView onNavigate={navigateTo} />;
        }
    };

    return (
        <div className="h-screen w-full flex flex-col overflow-hidden bg-kiosk-bg text-kiosk-text">
            {/* ── HEADER ─────────────────────────────────────────────────── */}
            <header className="h-16 bg-kiosk-card border-b border-kiosk-border px-4 md:px-6 flex items-center justify-between shrink-0 z-40 shadow-sm">
                <div className="flex items-center space-x-3 md:space-x-4 min-w-0">
                    <div
                        onClick={handleSecretClick}
                        className="flex items-center space-x-3 bg-kiosk-panel px-3 md:px-4 py-2 rounded-xl border border-kiosk-border shadow-sm cursor-pointer active:scale-95 transition-transform shrink-0"
                        title="Plastitec"
                    >
                        <CompanyLogo className="w-7 h-7 md:w-8 md:h-8" size={32} />
                        <div className="hidden sm:block">
                            <h1 className="font-bold text-sm tracking-wide text-kiosk-text leading-none">PLASTITEC</h1>
                            <p className="text-[10px] text-kiosk-muted uppercase tracking-wider font-medium mt-0.5">Asistente de RRHH</p>
                        </div>
                    </div>
                    <span className="hidden md:flex bg-amber-50 text-amber-700 text-xs font-semibold px-3 py-1 rounded-full border border-amber-200 items-center space-x-1.5 shrink-0">
                        <FlaskIcon size={12} /><span>Versión de pruebas</span>
                    </span>
                    {view !== 'home' && (
                        <span className="text-sm font-semibold text-kiosk-muted truncate hidden lg:inline">· {VIEW_TITLES[view]}</span>
                    )}
                </div>

                <div className="flex items-center space-x-2 md:space-x-3 shrink-0">
                    <button
                        onClick={() => setIsAboutOpen(true)}
                        title="¿Qué es RITA?"
                        className="hidden sm:flex items-center space-x-1.5 bg-kiosk-panel hover:bg-kiosk-card-hover px-3 py-1.5 rounded-full border border-kiosk-border text-xs text-brand font-semibold shadow-sm transition-colors"
                    >
                        <HandsHelpingIcon size={14} /><span>¿Qué es RITA?</span>
                    </button>
                    <div className="hidden sm:flex items-center space-x-2 bg-kiosk-panel px-3 py-1.5 rounded-full border border-kiosk-border text-xs text-kiosk-muted shadow-sm">
                        <span className={`w-2.5 h-2.5 rounded-full ${systemOnline ? 'bg-kiosk-accent animate-pulse' : 'bg-rose-400'}`} />
                        <span>{systemOnline ? 'Sistema en Línea' : 'Sin conexión'}</span>
                    </div>
                    <button
                        onClick={handleResetClick}
                        title="Limpiar la sesión actual"
                        className={`flex items-center gap-2 px-3 md:px-4 h-10 rounded-xl text-xs md:text-sm font-medium transition-colors border shadow-sm ${
                            confirmingReset ? 'text-white border-transparent bg-rose-500' : 'bg-kiosk-panel border-kiosk-border text-kiosk-text hover:bg-kiosk-card-hover'
                        }`}
                    >
                        <SyncAltIcon size={14} /><span className="hidden sm:inline">{confirmingReset ? '¿Seguro?' : 'Reiniciar'}</span>
                    </button>
                </div>
            </header>

            {/* ── CONTENIDO ──────────────────────────────────────────────── */}
            <main className="flex-1 overflow-hidden flex flex-col">
                <AnimatePresence mode="wait">
                    <motion.div key={view} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="flex-1 flex flex-col overflow-hidden">
                        {renderView()}
                    </motion.div>
                </AnimatePresence>
            </main>

            {/* ── Modal: aviso de inactividad ────────────────────────────── */}
            <AnimatePresence>
                {showInactivityModal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <motion.div initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 12 }} className="bg-kiosk-card border border-kiosk-border rounded-3xl p-8 max-w-md w-full text-center space-y-6 shadow-2xl">
                            <div className="w-20 h-20 bg-amber-100 text-amber-600 rounded-full mx-auto flex items-center justify-center"><HourglassHalfIcon size={32} /></div>
                            <div className="space-y-2">
                                <h3 className="text-2xl font-bold text-kiosk-text">¿Sigues ahí?</h3>
                                <p className="text-sm text-kiosk-muted">Por seguridad y privacidad, el kiosco se reiniciará automáticamente por inactividad.</p>
                            </div>
                            <div className="text-4xl font-black text-kiosk-accent py-2">{inactivityCountdown}</div>
                            <div className="flex space-x-3">
                                <button onClick={dismissInactivityModal} className="flex-1 bg-kiosk-accent hover:bg-kiosk-accent-hover text-white py-3.5 rounded-xl font-bold text-sm transition-all shadow-md">
                                    Sí, continuar aquí
                                </button>
                                <button onClick={hardReset} className="bg-kiosk-panel hover:bg-kiosk-card-hover border border-kiosk-border text-kiosk-text px-5 py-3.5 rounded-xl font-semibold text-sm transition-all shadow-sm">
                                    Reiniciar ya
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Modal PIN admin ─────────────────────────────────────────── */}
            <AnimatePresence>
                {showPinModal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm" onClick={() => setShowPinModal(false)}>
                        <motion.div initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 12 }}
                            className="bg-kiosk-card border border-kiosk-border rounded-2xl p-7 max-w-sm w-full shadow-2xl text-center" onClick={e => e.stopPropagation()}>
                            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-4 text-kiosk-accent"><LockIcon size={22} /></div>
                            <h2 className="text-base font-medium text-kiosk-text">Acceso Admin</h2>
                            <p className="text-[13px] text-kiosk-muted mt-1 mb-5">Panel de administración protegido</p>
                            <form onSubmit={async (e) => {
                                e.preventDefault();
                                const pin = e.target.pin.value;
                                try {
                                    const res = await fetch(`${API_BASE_URL}/api/verify-pin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) });
                                    const data = await res.json();
                                    if (data.success) { window.open('/?dashboard=true', '_blank'); setShowPinModal(false); }
                                    else { alert('PIN incorrecto.'); e.target.pin.value = ''; }
                                } catch (err) { console.error(err); alert('Error de conexión con el servidor.'); }
                            }}>
                                <input name="pin" type="password" autoFocus inputMode="numeric" maxLength={4} placeholder="••••"
                                    className="w-full bg-kiosk-panel border-[1.5px] border-kiosk-border rounded-xl py-3.5 text-2xl text-center tracking-[0.5em] outline-none focus:border-kiosk-accent transition-colors mb-5 placeholder:text-kiosk-muted text-kiosk-accent" />
                                <div className="grid grid-cols-2 gap-3">
                                    <button type="button" onClick={() => setShowPinModal(false)} className="py-2.5 bg-kiosk-panel hover:bg-kiosk-card-hover rounded-lg text-kiosk-text text-sm font-medium transition-colors">Cancelar</button>
                                    <button type="submit" className="py-2.5 bg-kiosk-accent hover:bg-kiosk-accent-hover rounded-lg text-white text-sm font-medium transition-colors">Entrar</button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Modal: ¿Qué es RITA? ───────────────────────────────────── */}
            <AboutRitaModal isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />

            {/* ── Footer global: aviso de fase de pruebas ────────────────── */}
            <div className="shrink-0 px-6 py-2 border-t border-kiosk-border text-center bg-amber-50">
                <p className="text-xs text-amber-800 flex items-center justify-center gap-1.5">
                    <PenIcon size={11} /><span>Este asistente se encuentra en fase de pruebas. Tu retroalimentación nos ayuda a mejorarlo.</span>
                </p>
            </div>
        </div>
    );
};

export default KioskApp;
