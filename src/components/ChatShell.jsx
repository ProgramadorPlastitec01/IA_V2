import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue } from 'framer-motion';
import aiClient from '../utils/aiClient';
import { API_BASE_URL } from '../utils/apiConfig';
import NexusCore from './NexusCore';
import CompanyLogo from './CompanyLogo';
import TypewriterText from './TypewriterText';
import HelpGuide from './HelpGuide';

/**
 * ChatShell — Fase 3 del rediseño.
 * Chat de 2 paneles con el MOTOR REAL del kiosco portado desde VoiceChat.jsx:
 * aiClient.query (texto+voz), conversationId, QuickCache, IntentEngine, mutex,
 * timeouts adaptativos, errores diferenciados, TTS, sub-estados, NexusCore.
 * VoiceChat.jsx permanece intacto como rollback.
 */

// ── Categorías FAQ → color del diseño (vía CSS vars de @theme) ──────────────
const CAT = {
    teal:   { fill: 'var(--color-cat-teal-fill)',   color: 'var(--color-cat-teal)' },
    coral:  { fill: 'var(--color-cat-coral-fill)',  color: 'var(--color-cat-coral)' },
    amber:  { fill: 'var(--color-cat-amber-fill)',  color: 'var(--color-cat-amber)' },
    green:  { fill: 'var(--color-cat-green-fill)',  color: 'var(--color-cat-green)' },
    purple: { fill: 'var(--color-cat-purple-fill)', color: 'var(--color-cat-purple)' },
};

const ICONS = {
    calendar: <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />,
    alert:    <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>,
    clock:    <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
    phone:    <><rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12.01" y2="18" /></>,
};

// ── FAQ (contenido DEFINITIVO; al tocar dispara handleQuery real) ───────────
const FAQS = [
    { theme: 'teal',   icon: 'calendar', cat: 'Vacaciones y licencias', q: '¿Cuántos días de permiso por luto tengo?', freq: 8 },
    { theme: 'coral',  icon: 'alert',    cat: 'Accidentes',             q: '¿Cómo reporto un accidente laboral?',      freq: 6 },
    { theme: 'amber',  icon: 'clock',    cat: 'Horarios',               q: '¿Cuál es el horario de trabajo?',          freq: 4 },
    { theme: 'purple', icon: 'phone',    cat: 'Normas internas',        q: '¿Puedo usar mi celular en la planta?',     freq: 4 },
    { theme: 'teal',   icon: 'calendar', cat: 'Vacaciones y licencias', q: '¿Cómo solicito vacaciones?',              freq: 2 },
];

// Mensaje de bienvenida (no hay store de config en el frontend; constante).
const WELCOME = '¡Hola! 👋 Soy tu asistente de RRHH. Pregúntame sobre el Reglamento Interno, BPM, vacaciones, permisos, horarios y más.';

// Auto-cierre 25s: DESACTIVADO en modo chat (los mensajes persisten en el hilo).
// Código conservado abajo (ver useEffect guardado) — no se borra.
const CHAT_AUTOCLOSE_ENABLED = false;

// Límite de longitud de consulta (espejo del MAX_QUERY_LENGTH del backend).
// El contador discreto aparece a partir de COUNTER_THRESHOLD.
const MAX_QUERY_LENGTH = 200;
const COUNTER_THRESHOLD = 160;

const MicIcon = () => (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
    </svg>
);
const StopIcon = () => (<svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>);
const SendIcon = () => (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
);
const SpeakerIcon = () => (
    <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
);

let msgSeq = 0;
const newId = () => `m${++msgSeq}`;

const ChatShell = () => {
    // ── Estado de chat con historial ──────────────────────────────────────
    const [messages, setMessages] = useState([{ id: newId(), role: 'bot', text: WELCOME }]);
    const [appState, setAppState] = useState('IDLE'); // IDLE, LISTENING, PROCESSING, RESPONDING, ERROR
    const [processingStep, setProcessingStep] = useState(0); // 1 Recibiendo, 2 Analizando, 3 Generando
    const [inputValue, setInputValue] = useState('');
    const [error, setError] = useState(null);
    const [isGuideOpen, setIsGuideOpen] = useState(false);
    const [showPinModal, setShowPinModal] = useState(false);
    const [isSupported, setIsSupported] = useState(true);

    // Métricas en cliente (NO tocan aiClient) — arrancan en 0
    const [metrics, setMetrics] = useState({ consultas: 0, resueltas: 0 });

    const volume = useMotionValue(0);

    // ── Refs del motor (portados de VoiceChat) ────────────────────────────
    const recognitionRef = useRef(null);
    const synthRef = useRef(typeof window !== 'undefined' ? window.speechSynthesis : null);
    const streamRef = useRef(null);
    const ttsInProgressRef = useRef(false);
    const abortControllerRef = useRef(null);
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const animationFrameRef = useRef(null);
    const currentUtteranceRef = useRef(null);
    const isActivatedRef = useRef(false);
    const secretClickRef = useRef(0);

    const stateRef = useRef(appState);
    useEffect(() => { stateRef.current = appState; }, [appState]);
    const mountedRef = useRef(true);
    const isLocked = useRef(false);
    const messagesEndRef = useRef(null);

    const isMobileDevice = useRef((() => {
        const ua = navigator.userAgent;
        return /iPhone|iPad|iPod|Android|webOS/i.test(ua) || window.innerWidth <= 768;
    })());
    const isTabletOrKiosk = useRef((() => {
        return navigator.maxTouchPoints > 0 && window.innerWidth >= 768;
    })());

    // ── Montaje: init backend + soporte de voz ────────────────────────────
    useEffect(() => {
        mountedRef.current = true;
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            setIsSupported(false);
            console.warn('[ChatShell] Navegador sin Web Speech API — modo teclado');
        }
        aiClient.initialize();
        aiClient.resetConversation();
        return () => {
            mountedRef.current = false;
            if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') audioContextRef.current.close();
        };
    }, []);

    // Auto-scroll al último mensaje
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, processingStep, appState]);

    // ── Auto-cierre 25s — CONSERVADO pero DESACTIVADO en chat ─────────────
    // En un chat con historial, borrar mensajes contradice el paradigma.
    // El flag CHAT_AUTOCLOSE_ENABLED=false mantiene el efecto inerte.
    useEffect(() => {
        if (!CHAT_AUTOCLOSE_ENABLED) return; // ← desactivado por decisión de producto
        // (Código original de auto-cierre conservado intencionalmente; si se
        //  reactivara, aquí iría el setInterval que limpiaba la respuesta a los 25s.)
    }, [messages, appState]);

    // ── TTS ───────────────────────────────────────────────────────────────
    const speakText = (text) => {
        if (!synthRef.current) return;
        synthRef.current.cancel();
        const cleanText = text
            .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
            .replace(/[#*`_~|]/g, '').replace(/[-•]/g, ' ').replace(/\s+/g, ' ').trim();

        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = 'es-MX';
        utterance.rate = 1.05; utterance.pitch = 1.0; utterance.volume = 1.0;
        utterance.onstart = () => { ttsInProgressRef.current = true; setAppState('RESPONDING'); };
        utterance.onend = () => { ttsInProgressRef.current = false; setAppState(prev => prev === 'RESPONDING' ? 'IDLE' : prev); };
        utterance.onerror = () => { ttsInProgressRef.current = false; setAppState(prev => prev === 'RESPONDING' ? 'IDLE' : prev); };

        const voices = synthRef.current.getVoices();
        const preferred = voices.find(v => v.lang.includes('es-MX') && v.name.includes('Google'))
            || voices.find(v => v.lang.includes('es')) || voices[0];
        if (preferred) utterance.voice = preferred;
        currentUtteranceRef.current = utterance;
        synthRef.current.speak(utterance);
    };

    // ── Reporte de errores al backend ─────────────────────────────────────
    const reportError = async (type, module, message, stack = null, details = {}) => {
        try {
            await fetch(`${API_BASE_URL}/api/report-error`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type, module, message, stack,
                    details: {
                        userAgent: navigator.userAgent, isSecure: window.isSecureContext,
                        screen: `${window.screen.width}x${window.screen.height}`,
                        language: navigator.language, state: stateRef.current, ...details,
                    },
                }),
            });
        } catch (e) { console.warn('No se pudo reportar error:', e.message); }
    };

    // ── Consulta (texto o voz) ────────────────────────────────────────────
    const handleQuery = async (rawQueryText) => {
        // Truncado defensivo a 200 (cubre la entrada por VOZ, que puede sobrepasar
        // el límite por dictado continuo). El input de texto ya está topado por
        // maxLength. Preservamos el inicio: lo más relevante suele ir primero.
        const queryText = (rawQueryText || '').slice(0, MAX_QUERY_LENGTH);
        if (!queryText || queryText.trim().length < 2) return;
        if (isLocked.current) { console.warn('[ChatShell] Query concurrente ignorada'); return; }
        isLocked.current = true;

        const qStart = performance.now();
        setMessages(prev => [...prev, { id: newId(), role: 'user', text: queryText.trim() }]);
        setMetrics(m => ({ ...m, consultas: m.consultas + 1 }));
        setAppState('PROCESSING');
        setProcessingStep(1);
        setError(null);

        const step2 = setTimeout(() => setProcessingStep(2), 800);
        const step3 = setTimeout(() => setProcessingStep(3), 3500);

        try {
            abortControllerRef.current = new AbortController();
            const result = await aiClient.query(queryText, { signal: abortControllerRef.current.signal });
            if (!mountedRef.current) return;

            let finalResult = (result || '').trim();
            // Anti-char-removal (portado de VoiceChat)
            if (finalResult.toLowerCase() === 'sy') finalResult = 'Soy';
            if (finalResult.toLowerCase().startsWith('sy ')) finalResult = 'Soy ' + finalResult.substring(3);
            if (finalResult.toLowerCase() === 'ete') finalResult = 'Este';
            if (finalResult.toLowerCase().startsWith('te ')) finalResult = 'Este ' + finalResult.substring(3);

            setMessages(prev => [...prev, { id: newId(), role: 'bot', text: finalResult, fresh: true }]);
            setMetrics(m => ({ ...m, resueltas: m.resueltas + 1 }));
            // Salir de PROCESSING al instante (quita la burbuja en progreso) y leer.
            if (synthRef.current) { setAppState('RESPONDING'); speakText(finalResult); }
            else setAppState('IDLE');
            console.log(`[ChatShell] ✅ Respuesta en ${(performance.now() - qStart).toFixed(0)}ms`);
        } catch (err) {
            if (err.name === 'AbortError') { setAppState('IDLE'); return; }
            reportError('IA', 'handleQuery', err.message, err.stack, { query: queryText });
            setError(err.message || 'Error al procesar la solicitud');
            setAppState('IDLE');
        } finally {
            clearTimeout(step2); clearTimeout(step3);
            setProcessingStep(0);
            isLocked.current = false;
        }
    };

    const submitInput = () => {
        const v = inputValue.trim();
        if (!v) return;
        setInputValue('');
        handleQuery(v);
    };

    // ── Visualizador de volumen (alimenta NexusCore) ──────────────────────
    const startVolumeLoop = () => {
        if (!analyserRef.current || !streamRef.current) return;
        const buf = new Uint8Array(analyserRef.current.frequencyBinCount);
        const tick = () => {
            if (analyserRef.current && stateRef.current === 'LISTENING' && streamRef.current) {
                analyserRef.current.getByteFrequencyData(buf);
                let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i];
                volume.set((sum / buf.length) * 1.5);
                animationFrameRef.current = requestAnimationFrame(tick);
            }
        };
        tick();
    };
    const stopAnims = () => {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        volume.set(0);
    };

    // ── Reconocimiento de voz ─────────────────────────────────────────────
    const startListening = (isRetry = false) => {
        if (!isSupported) return;
        if (isLocked.current && !isRetry) return;
        if (synthRef.current) synthRef.current.cancel();
        setError(null);
        setInputValue('');
        setAppState('LISTENING');

        if (isMobileDevice.current && streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null;
        }
        startVolumeLoop();

        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) { setError('Tu navegador no soporta reconocimiento de voz.'); setAppState('IDLE'); return; }

        if (recognitionRef.current) {
            try { recognitionRef.current.onresult = null; recognitionRef.current.onend = null; recognitionRef.current.onerror = null; recognitionRef.current.abort(); } catch (e) { /* ignore */ }
        }
        recognitionRef.current = new SR();
        recognitionRef.current.lang = 'es-MX';
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.maxAlternatives = 1;

        recognitionRef.current.onresult = (e) => {
            const last = e.results.length - 1;
            const text = e.results[last][0].transcript;
            if (e.results[last].isFinal) { recognitionRef.current.stop(); setInputValue(''); handleQuery(text); }
            else setInputValue(text);
        };
        recognitionRef.current.onerror = async (e) => {
            if (!mountedRef.current) return;
            if ((e.error === 'audio-capture' || e.error === 'no-speech') && !isRetry) {
                recognitionRef.current.stop();
                await new Promise(r => setTimeout(r, 300));
                startListening(true); return;
            }
            if (e.error !== 'no-speech') {
                setError(`Reconocimiento: ${e.error}`);
                reportError('Mic', 'NativeSpeech', e.error, null, { isRetry });
            }
            setAppState('IDLE'); stopAnims();
        };
        recognitionRef.current.onend = () => {
            if (stateRef.current === 'LISTENING' && !isLocked.current && mountedRef.current) {
                setAppState('IDLE'); stopAnims();
            }
        };
        try { recognitionRef.current.start(); }
        catch (e) { if (!isRetry) startListening(true); else setAppState('IDLE'); }
    };

    const stopListening = () => {
        if (recognitionRef.current) recognitionRef.current.stop();
        stopAnims();
        if (abortControllerRef.current) abortControllerRef.current.abort();
        setAppState('IDLE');
    };

    // ── Activación de micrófono (primer click, sin splash) ────────────────
    const activateApp = async (thenListen = true) => {
        try {
            if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
                const isHTTP = window.location.protocol === 'http:';
                const isNonLocalhost = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
                reportError('Mic', 'activateApp', 'mediaDevices not available', null, { protocol: window.location.protocol, hostname: window.location.hostname });
                setError(isHTTP && isNonLocalhost
                    ? '⚠️ Micrófono requiere HTTPS. Usando modo teclado.'
                    : 'Micrófono no disponible en este navegador. Usando modo teclado.');
                return;
            }
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
            if (!stream || stream.getAudioTracks().length === 0) throw new Error('No se detectaron pistas de audio');
            await new Promise(r => setTimeout(r, 100));
            if (stream.getAudioTracks()[0].readyState !== 'live') throw new Error('Hardware inconsistente');

            streamRef.current = stream;
            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            analyserRef.current = audioContextRef.current.createAnalyser();
            audioContextRef.current.createMediaStreamSource(stream).connect(analyserRef.current);
            analyserRef.current.fftSize = 128;
            isActivatedRef.current = true;

            if (thenListen || isTabletOrKiosk.current) startListening();
        } catch (e) {
            reportError('Mic', 'activateApp', e.message, e.stack, { errorName: e.name });
            if (e.name === 'NotAllowedError') setError('Permiso de micrófono denegado. Habilítalo en el navegador.');
            else if (e.name === 'NotFoundError') setError('No se encontró micrófono. Usando modo teclado.');
            else setError('No pudimos activar el micrófono. Usando modo teclado.');
            setAppState('IDLE');
        }
    };

    const micButtonClick = () => {
        if (appState === 'LISTENING') return stopListening();
        if (!isActivatedRef.current) return activateApp(true);
        startListening();
    };

    // ── Acceso admin: 5 clicks en el logo → modal PIN ─────────────────────
    const handleSecretClick = (e) => {
        if (e) e.stopPropagation();
        secretClickRef.current += 1;
        if (navigator.vibrate) navigator.vibrate(20);
        if (secretClickRef.current >= 5) { setShowPinModal(true); secretClickRef.current = 0; }
        if (secretClickRef.current === 1) setTimeout(() => { secretClickRef.current = 0; }, 2500);
    };

    // ── Sub-estado en la burbuja en progreso ──────────────────────────────
    const subStateText = processingStep === 1 ? 'Recibiendo solicitud…'
        : processingStep === 2 ? 'Analizando información…'
        : processingStep === 3 ? 'Generando respuesta…' : 'Procesando…';

    const pendientes = Math.max(0, metrics.consultas - metrics.resueltas);

    return (
        <div className="h-screen w-full flex flex-col overflow-hidden bg-bg-page text-ink">

            {/* ── HEADER ─────────────────────────────────────────────── */}
            <motion.header
                initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut' }}
                className="flex items-center justify-between px-6 h-16 bg-bg-panel border-b border-line shrink-0 z-10"
            >
                <div className="flex items-center gap-3">
                    <div onClick={handleSecretClick} className="cursor-pointer active:scale-95 transition-transform" title="Plastitec">
                        <CompanyLogo className="w-9 h-9" size={36} />
                    </div>
                    <span className="text-[15px] font-medium text-ink">Tu <span className="text-brand font-medium">Asistente</span> de RRHH</span>
                    {/* NexusCore compacto (54px) reflejando el appState real */}
                    <div className="relative w-[54px] h-[54px] rounded-full overflow-hidden flex items-center justify-center bg-surface border border-line shrink-0 ml-1" title={`Estado: ${appState.toLowerCase()}`}>
                        <div className="absolute" style={{ width: 320, height: 320, transform: 'scale(0.22)' }}>
                            <NexusCore status={appState.toLowerCase()} volume={volume} />
                        </div>
                    </div>
                </div>
                <button
                    onClick={() => setIsGuideOpen(true)}
                    className="flex items-center gap-2 px-3.5 h-9 bg-surface border border-line rounded-lg text-[13px] font-medium text-ink hover:bg-brand-light hover:border-brand hover:text-brand transition-colors"
                >
                    <span>💡</span><span className="hidden sm:inline">¿Cómo preguntar?</span>
                </button>
            </motion.header>

            {/* ── CUERPO: 2 paneles ──────────────────────────────────── */}
            <div className="flex flex-1 overflow-hidden max-[880px]:flex-col max-[880px]:overflow-y-auto">

                {/* PANEL IZQUIERDO — CHAT (56%) */}
                <motion.section
                    initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.06, ease: 'easeOut' }}
                    className="w-[56%] flex flex-col bg-bg-panel border-r border-line max-[880px]:w-full max-[880px]:h-[58vh] max-[880px]:border-r-0 max-[880px]:border-b"
                >
                    <div className="px-5 py-3 border-b border-line shrink-0">
                        <h2 className="text-[13px] font-medium text-muted uppercase tracking-wider">Conversación</h2>
                    </div>

                    {/* Mensajes */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4 flex flex-col gap-2.5">
                        {messages.map((m) => (
                            <motion.div
                                key={m.id}
                                initial={{ opacity: 0, y: 8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.25, ease: 'easeOut' }}
                                className={m.role === 'user' ? 'self-end max-w-[82%]' : 'self-start max-w-[82%]'}
                            >
                                <div className={`text-[11px] text-muted mb-0.5 ${m.role === 'user' ? 'text-right pr-1' : 'pl-1'}`}>
                                    {m.role === 'user' ? 'Tú' : 'Asistente'}
                                </div>
                                <div className={m.role === 'user'
                                    ? 'px-3.5 py-2.5 rounded-2xl rounded-br-sm bg-brand text-white leading-relaxed'
                                    : 'px-3.5 py-2.5 rounded-2xl rounded-bl-sm bg-surface text-ink leading-relaxed'}>
                                    {m.role === 'bot'
                                        ? (m.fresh ? <TypewriterText text={m.text} speed={16} /> : m.text)
                                        : m.text}
                                </div>
                                {/* Botón 🔊 repetir lectura (solo burbuja bot) */}
                                {m.role === 'bot' && (
                                    <button
                                        onClick={() => speakText(m.text)}
                                        className="mt-1 ml-1 inline-flex items-center gap-1 text-[10px] text-muted hover:text-brand transition-colors"
                                        title="Escuchar de nuevo"
                                    >
                                        <SpeakerIcon /> Escuchar
                                    </button>
                                )}
                            </motion.div>
                        ))}

                        {/* Burbuja en progreso con sub-estado (reemplaza el typing de 3 puntos) */}
                        {appState === 'PROCESSING' && (
                            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="self-start max-w-[82%]">
                                <div className="text-[11px] text-muted mb-0.5 pl-1">Asistente</div>
                                <div className="px-3.5 py-2.5 rounded-2xl rounded-bl-sm bg-surface text-muted leading-relaxed flex items-center gap-2">
                                    <span className="flex items-end gap-[3px] h-3">
                                        <span className="w-[5px] h-3 rounded-sm bg-brand-light origin-bottom animate-typing1" />
                                        <span className="w-[5px] h-3 rounded-sm bg-brand-light origin-bottom animate-typing2" />
                                        <span className="w-[5px] h-3 rounded-sm bg-brand-light origin-bottom animate-typing3" />
                                    </span>
                                    <span className="text-[13px]">{subStateText}</span>
                                </div>
                            </motion.div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Zona de voz */}
                    <div className="px-5 py-2 border-t border-line flex items-center gap-2.5 bg-bg-panel shrink-0">
                        <button
                            onClick={micButtonClick}
                            disabled={appState === 'PROCESSING' || !isSupported}
                            className={`w-9 h-9 rounded-full border-2 flex items-center justify-center transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${appState === 'LISTENING' ? 'border-brand bg-brand text-white' : 'border-line bg-bg-panel text-ink hover:border-brand hover:bg-brand-light'}`}
                            title={isSupported ? 'Activar micrófono' : 'Voz no disponible — modo teclado'}
                        >
                            {appState === 'LISTENING' ? <StopIcon /> : <MicIcon />}
                        </button>
                        <div className={`flex items-end gap-[3px] h-[22px] transition-opacity ${appState === 'LISTENING' ? 'opacity-100' : 'opacity-0'}`}>
                            {[
                                { c: 'animate-wave1', h: 14 }, { c: 'animate-wave2', h: 20 }, { c: 'animate-wave3', h: 10 },
                                { c: 'animate-wave4', h: 22 }, { c: 'animate-wave5', h: 12 }, { c: 'animate-wave6', h: 18 },
                                { c: 'animate-wave7', h: 8 },
                            ].map((bar, i) => (
                                <div key={i} className={`w-[3px] rounded-sm bg-brand-light origin-bottom ${bar.c}`} style={{ height: bar.h }} />
                            ))}
                        </div>
                        <span className={`text-xs transition-colors ${appState === 'LISTENING' ? 'text-brand font-medium' : 'text-muted'}`}>
                            {!isSupported ? 'Modo teclado' : appState === 'LISTENING' ? 'Escuchando…' : 'Micrófono listo'}
                        </span>
                    </div>

                    {/* Input */}
                    <div className="px-5 pt-3 pb-2 flex items-center gap-2 bg-bg-panel shrink-0">
                        <div className="flex-1 relative">
                            <input
                                type="text" placeholder="Escribe tu pregunta..." autoComplete="off"
                                value={inputValue}
                                maxLength={MAX_QUERY_LENGTH}
                                onChange={e => setInputValue(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitInput(); } }}
                                disabled={appState === 'LISTENING' || appState === 'PROCESSING'}
                                className="w-full px-3.5 py-2.5 border-[1.5px] border-line rounded-[10px] text-sm bg-surface text-ink outline-none transition-colors focus:border-brand focus:bg-bg-panel placeholder:text-muted disabled:opacity-50"
                            />
                            {inputValue.length >= COUNTER_THRESHOLD && (
                                <span className="absolute right-3 bottom-[-16px] text-[10px] text-muted tabular-nums">
                                    {inputValue.length}/{MAX_QUERY_LENGTH}
                                </span>
                            )}
                        </div>
                        <button
                            onClick={submitInput}
                            disabled={appState === 'PROCESSING'}
                            className="w-10 h-10 rounded-[10px] bg-brand hover:bg-brand-hover text-white flex items-center justify-center transition-colors shrink-0 disabled:opacity-50"
                        >
                            <SendIcon />
                        </button>
                    </div>

                    {/* Disclaimer FIJO, persistente en todos los estados (item 18) */}
                    <div className="px-5 pb-2 shrink-0">
                        <p className="text-[11px] text-muted text-center">
                            Asistente IA RRHH puede cometer errores. Por favor, verificar las respuestas.
                        </p>
                    </div>
                </motion.section>

                {/* PANEL DERECHO — MÉTRICAS + FAQ (44%) */}
                <motion.aside
                    initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.12, ease: 'easeOut' }}
                    className="w-[44%] flex flex-col bg-bg-page overflow-y-auto custom-scrollbar p-5 gap-5 max-[880px]:w-full"
                >
                    <div className="grid grid-cols-3 gap-3">
                        {[
                            { label: 'Consultas hoy', value: metrics.consultas, dot: 'var(--color-brand-light)' },
                            { label: 'Resueltas',     value: metrics.resueltas, dot: 'var(--color-cat-teal-fill)' },
                            { label: 'Pendientes',    value: pendientes,        dot: 'var(--color-cat-amber-fill)' },
                        ].map((m, i) => (
                            <div key={i} className="bg-bg-panel border border-line rounded-xl p-4 flex flex-col gap-1">
                                <span className="text-[11px] font-medium text-muted uppercase tracking-wider">{m.label}</span>
                                <motion.span key={m.value} initial={{ opacity: 0.4, y: 3 }} animate={{ opacity: 1, y: 0 }} className="text-[28px] font-medium text-ink leading-none">{m.value}</motion.span>
                                <div className="w-2 h-2 rounded-full mt-1.5" style={{ background: m.dot }} />
                            </div>
                        ))}
                    </div>

                    <div className="flex items-baseline gap-2">
                        <h2 className="text-sm font-medium text-ink">Preguntas frecuentes</h2>
                        <p className="text-xs text-muted">Toca para enviar al chat</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 max-[640px]:grid-cols-1">
                        {FAQS.map((faq, i) => {
                            const c = CAT[faq.theme];
                            const featured = i === 0;
                            return (
                                <button
                                    key={i}
                                    onClick={() => handleQuery(faq.q)}
                                    disabled={appState === 'PROCESSING'}
                                    className={`group relative overflow-hidden bg-bg-panel border border-line rounded-2xl p-4 flex items-start gap-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] disabled:opacity-60 disabled:pointer-events-none ${featured ? 'col-span-2 max-[640px]:col-span-1' : ''}`}
                                    style={{ borderLeft: `3px solid ${c.color}` }}
                                >
                                    <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-transform group-hover:rotate-6 group-hover:scale-105" style={{ background: c.fill, color: c.color }}>
                                        <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">{ICONS[faq.icon]}</svg>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: c.color }}>{faq.cat}</div>
                                        <div className="text-[13px] text-ink leading-snug mb-2">{faq.q}</div>
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-surface text-muted">
                                            <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                                            {faq.freq} consultas
                                        </span>
                                    </div>
                                    {featured && <span className="absolute top-3 right-3 bg-brand text-white text-[10px] font-medium px-2 py-0.5 rounded-full tracking-wide">⭐ Popular</span>}
                                </button>
                            );
                        })}
                    </div>
                </motion.aside>
            </div>

            {/* ── Toast de error (re-skin claro) ─────────────────────── */}
            <AnimatePresence>
                {error && (
                    <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} className="fixed bottom-8 left-0 w-full flex justify-center z-[100] px-6">
                        <div className="bg-bg-panel border border-cat-coral/30 text-ink px-6 py-3 rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] flex items-center gap-3 max-w-lg">
                            <span className="text-lg">⚠️</span>
                            <span className="text-sm font-medium flex-1" style={{ color: 'var(--color-cat-coral)' }}>{error}</span>
                            <button onClick={() => setError(null)} className="text-muted hover:text-ink transition-colors px-2">✕</button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Modal PIN admin (re-skin claro) ────────────────────── */}
            <AnimatePresence>
                {showPinModal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm" onClick={() => setShowPinModal(false)}>
                        <motion.div initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 12 }}
                            className="bg-bg-panel border border-line rounded-2xl p-7 max-w-sm w-full shadow-2xl text-center" onClick={e => e.stopPropagation()}>
                            <div className="w-12 h-12 bg-brand-light rounded-xl flex items-center justify-center text-2xl mx-auto mb-4" style={{ color: 'var(--color-brand)' }}>🔐</div>
                            <h2 className="text-base font-medium text-ink">Acceso Admin</h2>
                            <p className="text-[13px] text-muted mt-1 mb-5">Panel de administración protegido</p>
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
                                    className="w-full bg-surface border-[1.5px] border-line rounded-xl py-3.5 text-2xl text-center tracking-[0.5em] outline-none focus:border-brand transition-colors mb-5 placeholder:text-muted" style={{ color: 'var(--color-brand)' }} />
                                <div className="grid grid-cols-2 gap-3">
                                    <button type="button" onClick={() => setShowPinModal(false)} className="py-2.5 bg-surface hover:bg-line rounded-lg text-ink text-sm font-medium transition-colors">Cancelar</button>
                                    <button type="submit" className="py-2.5 bg-brand hover:bg-brand-hover rounded-lg text-white text-sm font-medium transition-colors">Entrar</button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Guía de uso */}
            <AnimatePresence>
                {isGuideOpen && <HelpGuide isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />}
            </AnimatePresence>
        </div>
    );
};

export default ChatShell;
