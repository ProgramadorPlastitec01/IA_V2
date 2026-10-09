import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue } from 'framer-motion';
import aiClient from '../utils/aiClient';
import { API_BASE_URL } from '../utils/apiConfig';
import NexusCore from './NexusCore';
import CompanyLogo from './CompanyLogo';
import HelpGuide from './HelpGuide';
import DocumentsGuide from './DocumentsGuide';

// 5 minutos sin interacción → se limpia la pregunta/respuesta (kiosko compartido).
const INACTIVITY_RESET_MS = 5 * 60 * 1000;

/**
 * ChatShell — Rediseño 2026-10-09: modo PREGUNTA → RESPUESTA (no conversación).
 * En las pruebas de TI los usuarios asumieron que era un chat con memoria y
 * hacían repreguntas ("¿y si es mi hijo?"). El backend responde cada pregunta
 * de forma independiente, así que la UI ahora muestra UNA pregunta y UNA
 * respuesta con sus fuentes, feedback y copiar. Cada consulta reemplaza la anterior.
 * El motor (aiClient, voz, TTS, mutex, timeouts, PIN admin) es el mismo de antes.
 * Respaldo de la versión chat: backups/ui_2026-10-09/ChatShell.jsx
 */

// ── Categorías FAQ → color del diseño (vía CSS vars de @theme) ──────────────
const CAT = {
    teal: { fill: 'var(--color-cat-teal-fill)', color: 'var(--color-cat-teal)' },
    coral: { fill: 'var(--color-cat-coral-fill)', color: 'var(--color-cat-coral)' },
    amber: { fill: 'var(--color-cat-amber-fill)', color: 'var(--color-cat-amber)' },
    green: { fill: 'var(--color-cat-green-fill)', color: 'var(--color-cat-green)' },
    purple: { fill: 'var(--color-cat-purple-fill)', color: 'var(--color-cat-purple)' },
};

const ICONS = {
    calendar: <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />,
    alert: <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>,
    clock: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
    phone: <><rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12.01" y2="18" /></>,
    drop: <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />,
};

// ── FAQ (al hacer clic se usa como pregunta y se consulta) ──────────────────
const FAQS = [
    { theme: 'teal', icon: 'calendar', cat: 'Vacaciones y licencias', q: '¿Cuántos días de permiso por luto tengo?', freq: 8 },
    { theme: 'coral', icon: 'alert', cat: 'Accidentes', q: '¿Cómo reporto un accidente laboral?', freq: 6 },
    { theme: 'amber', icon: 'clock', cat: 'Horarios', q: '¿Cuál es el horario de trabajo?', freq: 4 },
    { theme: 'purple', icon: 'phone', cat: 'Normas internas', q: '¿Puedo usar mi celular en la planta?', freq: 4 },
    { theme: 'teal', icon: 'calendar', cat: 'Vacaciones y licencias', q: '¿Cómo solicito vacaciones?', freq: 2 },
    // Solo en "Ver todas" (validadas contra el backend el 2026-10-09; sin contador de uso real).
    { theme: 'teal', icon: 'calendar', cat: 'Vacaciones y licencias', q: '¿Cuántos días de vacaciones tengo al año?' },
    { theme: 'amber', icon: 'clock', cat: 'Horarios', q: '¿Cuántas horas tiene la jornada laboral semanal?' },
    { theme: 'green', icon: 'drop', cat: 'Higiene y BPM', q: '¿Cuál es el procedimiento de lavado de manos?' },
    { theme: 'purple', icon: 'phone', cat: 'Normas internas', q: '¿Puedo ingresar alimentos a la planta?' },
];
// Cuántas tarjetas se muestran antes de "Ver todas".
const FAQ_VISIBLE = 5;

// Límite de longitud de consulta (espejo del MAX_QUERY_LENGTH del backend).
// El contador discreto aparece a partir de COUNTER_THRESHOLD.
const MAX_QUERY_LENGTH = 200;
const COUNTER_THRESHOLD = 160;

// Separador que el backend pone antes del bloque de fuentes:
// "...respuesta\n\n---\n📎 *Información extraída de:*\n- Doc A\n- Doc B"
const SOURCES_SPLIT_RE = /\n\s*-{3,}\s*\n/;

/** Separa el cuerpo de la respuesta y la lista de fuentes que agrega el backend. */
const splitAnswer = (raw) => {
    const text = (raw || '').trim();
    const parts = text.split(SOURCES_SPLIT_RE);
    if (parts.length < 2) return { body: text, sources: [] };
    const tail = parts.pop();
    if (!/informaci[oó]n extra[ií]da de/i.test(tail)) return { body: text, sources: [] };
    const sources = tail.split('\n')
        .map(l => l.trim())
        .filter(l => /^[-•*]\s+/.test(l))
        .map(l => l.replace(/^[-•*]\s+/, '').replace(/\*/g, '').trim())
        .filter(Boolean);
    return { body: parts.join('\n\n---\n').trim(), sources };
};

/** Negritas/cursivas inline (**x**, *x*) → elementos React, sin innerHTML. */
const renderInline = (line, keyPrefix) => {
    const out = [];
    const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g;
    let last = 0, m, i = 0;
    while ((m = re.exec(line)) !== null) {
        if (m.index > last) out.push(line.slice(last, m.index));
        const tok = m[0];
        if (tok.startsWith('**')) out.push(<strong key={`${keyPrefix}-${i++}`} className="font-semibold">{tok.slice(2, -2)}</strong>);
        else out.push(<em key={`${keyPrefix}-${i++}`}>{tok.slice(1, -1)}</em>);
        last = m.index + tok.length;
    }
    if (last < line.length) out.push(line.slice(last));
    return out;
};

/** Markdown mínimo de las respuestas: párrafos, viñetas y listas numeradas. */
const AnswerBody = ({ text }) => {
    const blocks = [];
    let list = null;
    // "...es el siguiente: 1. Paso uno\n2. Paso dos" → el paso 1 pasa a su propia línea.
    const normalized = /\n\s*2[.)]\s/.test(text) ? text.replace(/:\s+1([.)])\s+/, ':\n1$1 ') : text;
    normalized.split('\n').forEach((raw) => {
        const line = raw.trim();
        const bullet = line.match(/^(?:[-•*]|\d+[.)])\s+(.*)$/);
        if (bullet) {
            const ordered = /^\d/.test(line);
            if (!list || list.ordered !== ordered) { list = { type: 'list', ordered, items: [] }; blocks.push(list); }
            list.items.push(bullet[1]);
            return;
        }
        list = null;
        if (!line || /^-{3,}$/.test(line)) return;
        blocks.push({ type: 'p', text: line.replace(/^#+\s*/, '') });
    });

    return (
        <div className="flex flex-col gap-3 text-[15px] leading-relaxed text-ink">
            {blocks.map((b, i) => {
                if (b.type === 'p') return <p key={i}>{renderInline(b.text, `p${i}`)}</p>;
                const Tag = b.ordered ? 'ol' : 'ul';
                return (
                    <Tag key={i} className={`${b.ordered ? 'list-decimal' : 'list-disc'} pl-5 flex flex-col gap-1`}>
                        {b.items.map((it, j) => <li key={j}>{renderInline(it, `l${i}-${j}`)}</li>)}
                    </Tag>
                );
            })}
        </div>
    );
};

const MicIcon = () => (
    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
    </svg>
);
const StopIcon = () => (<svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>);
const SendIcon = () => (
    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
);
const SpeakerIcon = () => (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
);
const ChatBubbleIcon = () => (
    <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        <line x1="8" y1="10" x2="16" y2="10" /><line x1="8" y1="14" x2="13" y2="14" />
    </svg>
);
const DocIcon = () => (
    <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="14" y2="17" />
    </svg>
);
const InfoIcon = () => (
    <svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
    </svg>
);
const ClipIcon = () => (
    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
);
const ThumbUpIcon = () => (
    <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </svg>
);
const ThumbDownIcon = () => (
    <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
    </svg>
);
const CopyIcon = () => (
    <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
);

/** Tarjeta de pregunta frecuente (panel derecho y modal "Ver todas"). */
const FaqCard = ({ faq, featured, onPick, disabled }) => {
    const c = CAT[faq.theme];
    return (
        <button
            onClick={() => onPick(faq.q)}
            disabled={disabled}
            className="group relative bg-bg-panel border border-line rounded-2xl p-4 flex items-start gap-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] disabled:opacity-60 disabled:pointer-events-none"
        >
            <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-transform group-hover:rotate-6 group-hover:scale-105" style={{ background: c.fill, color: c.color }}>
                <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">{ICONS[faq.icon]}</svg>
            </div>
            <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium uppercase tracking-wider mb-1 pr-16" style={{ color: c.color }}>{faq.cat}</div>
                <div className="text-[14px] text-ink leading-snug mb-2.5">{faq.q}</div>
                {faq.freq > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-surface text-muted">
                        <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                        {faq.freq} consultas
                    </span>
                )}
            </div>
            {featured && <span className="absolute top-3 right-3 bg-brand text-white text-[10px] font-medium px-2 py-0.5 rounded-full tracking-wide">⭐ Popular</span>}
        </button>
    );
};

/** Copia al portapapeles; en kiosco por HTTP (sin clipboard API) usa execCommand. */
const copyToClipboard = async (text) => {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch { /* fallback abajo */ }
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
    } catch { return false; }
};

const ChatShell = () => {
    // ── Estado: UNA pregunta y UNA respuesta ──────────────────────────────
    // answer = { question, body, sources, raw } | null
    const [answer, setAnswer] = useState(null);
    const [pendingQuestion, setPendingQuestion] = useState('');
    const [feedback, setFeedback] = useState(null); // null | 'up' | 'down'
    const [copied, setCopied] = useState(false);
    const [appState, setAppState] = useState('IDLE'); // IDLE, LISTENING, PROCESSING, RESPONDING, ERROR
    const [processingStep, setProcessingStep] = useState(0); // 1 Recibiendo, 2 Analizando, 3 Generando
    const [inputValue, setInputValue] = useState('');
    const [error, setError] = useState(null);
    const [isGuideOpen, setIsGuideOpen] = useState(false);
    const [isDocsOpen, setIsDocsOpen] = useState(false);
    const [isFaqOpen, setIsFaqOpen] = useState(false);
    const [showPinModal, setShowPinModal] = useState(false);
    const [isSupported, setIsSupported] = useState(true);

    // Reinicio (manual con confirmación + auto por inactividad)
    const [confirmingReset, setConfirmingReset] = useState(false);
    const confirmResetTimerRef = useRef(null);
    const lastInteractionRef = useRef(Date.now());
    const copiedTimerRef = useRef(null);

    // Métricas en cliente (NO tocan aiClient) — arrancan en 0
    const [metrics, setMetrics] = useState({ consultas: 0, resueltas: 0 });

    const volume = useMotionValue(0);

    // ── Refs del motor ────────────────────────────────────────────────────
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
    const inputRef = useRef(null);
    const answerRef = useRef(null);

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

    // En pantallas angostas la respuesta queda debajo: llevarla a la vista.
    useEffect(() => {
        if (answer || appState === 'PROCESSING') {
            answerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [answer, appState]);

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

    // ── Reinicio ───────────────────────────────────────────────────────────
    // Limpia la pregunta/respuesta en pantalla. Cada pregunta ya quedó registrada
    // en analytics.jsonl al hacerse; el reset no pierde datos.
    const handleFullReset = useCallback(() => {
        if (synthRef.current) synthRef.current.cancel();
        if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch { /* noop */ } }
        if (abortControllerRef.current) abortControllerRef.current.abort();
        aiClient.resetConversation();
        isLocked.current = false;
        setConfirmingReset(false);
        setError(null);
        setInputValue('');
        setPendingQuestion('');
        setProcessingStep(0);
        setAppState('IDLE');
        setMetrics({ consultas: 0, resueltas: 0 });
        setAnswer(null);
        setFeedback(null);
        setCopied(false);
    }, []);

    // Doble-tap para confirmar (evita que un toque accidental borre la respuesta).
    const handleResetClick = () => {
        if (confirmingReset) {
            clearTimeout(confirmResetTimerRef.current);
            handleFullReset();
            return;
        }
        setConfirmingReset(true);
        confirmResetTimerRef.current = setTimeout(() => setConfirmingReset(false), 3000);
    };

    // Auto-reinicio tras 5 minutos sin interacción: la siguiente persona en el
    // kiosko empieza de cero, sin quedar expuesta la consulta anterior.
    useEffect(() => {
        const markInteraction = () => { lastInteractionRef.current = Date.now(); };
        window.addEventListener('mousemove', markInteraction);
        window.addEventListener('touchstart', markInteraction);
        window.addEventListener('keydown', markInteraction);
        return () => {
            window.removeEventListener('mousemove', markInteraction);
            window.removeEventListener('touchstart', markInteraction);
            window.removeEventListener('keydown', markInteraction);
        };
    }, []);

    const hasContent = Boolean(answer) || metrics.consultas > 0;
    useEffect(() => {
        const interval = setInterval(() => {
            if (!hasContent) return; // ya está "en reposo"
            if (Date.now() - lastInteractionRef.current >= INACTIVITY_RESET_MS) {
                handleFullReset();
            }
        }, 10000);
        return () => clearInterval(interval);
    }, [handleFullReset, hasContent]);

    useEffect(() => {
        return () => { clearTimeout(confirmResetTimerRef.current); clearTimeout(copiedTimerRef.current); };
    }, []);

    // ── Consulta (texto o voz) ────────────────────────────────────────────
    const handleQuery = async (rawQueryText) => {
        // Truncado defensivo a 200 (cubre la entrada por VOZ). El input de texto
        // ya está topado por maxLength. Preservamos el inicio.
        const queryText = (rawQueryText || '').slice(0, MAX_QUERY_LENGTH).trim();
        if (!queryText || queryText.length < 2) return;
        if (isLocked.current) { console.warn('[ChatShell] Query concurrente ignorada'); return; }
        isLocked.current = true;

        if (synthRef.current) synthRef.current.cancel();
        const qStart = performance.now();
        setInputValue(queryText); // la pregunta queda visible en el campo, como en el diseño
        setPendingQuestion(queryText);
        setAnswer(null);
        setFeedback(null);
        setCopied(false);
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

            const { body, sources } = splitAnswer(finalResult);
            setAnswer({ question: queryText, body, sources, raw: finalResult });
            setMetrics(m => ({ ...m, resueltas: m.resueltas + 1 }));
            // Se lee solo el cuerpo (no la lista de fuentes).
            if (synthRef.current) { setAppState('RESPONDING'); speakText(body); }
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
            setPendingQuestion('');
            isLocked.current = false;
        }
    };

    const submitInput = () => {
        const v = inputValue.trim();
        if (!v) { inputRef.current?.focus(); return; }
        handleQuery(v);
    };

    const pickFaq = (q) => {
        setIsFaqOpen(false);
        handleQuery(q);
    };

    // ── Feedback y copiar ─────────────────────────────────────────────────
    const sendFeedback = (value) => {
        if (!answer || feedback) return;
        setFeedback(value);
        aiClient.logAnalytics('AnswerFeedback', {
            useful: value === 'up',
            query: answer.question,
            answer: answer.body.slice(0, 500),
            sources: answer.sources,
            conversationId: aiClient.conversationId,
        });
    };

    const handleCopy = async () => {
        if (!answer) return;
        const text = answer.sources.length
            ? `${answer.body}\n\nInformación extraída de:\n${answer.sources.map(s => `- ${s}`).join('\n')}`
            : answer.body;
        const ok = await copyToClipboard(text);
        if (!ok) { setError('No se pudo copiar la respuesta.'); return; }
        setCopied(true);
        clearTimeout(copiedTimerRef.current);
        copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
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
            try { recognitionRef.current.onresult = null; recognitionRef.current.onend = null; recognitionRef.current.onerror = null; recognitionRef.current.abort(); } catch { /* ignore */ }
        }
        recognitionRef.current = new SR();
        recognitionRef.current.lang = 'es-MX';
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.maxAlternatives = 1;

        recognitionRef.current.onresult = (e) => {
            const last = e.results.length - 1;
            const text = e.results[last][0].transcript;
            if (e.results[last].isFinal) { recognitionRef.current.stop(); handleQuery(text); }
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
        catch { if (!isRetry) startListening(true); else setAppState('IDLE'); }
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

    const subStateText = processingStep === 1 ? 'Recibiendo tu pregunta…'
        : processingStep === 2 ? 'Buscando en los documentos de la empresa…'
            : processingStep === 3 ? 'Redactando la respuesta…' : 'Procesando…';

    const pendientes = Math.max(0, metrics.consultas - metrics.resueltas);
    const isBusy = appState === 'PROCESSING';

    return (
        <div className="h-screen w-full flex flex-col overflow-hidden bg-bg-page text-ink">

            {/* ── HEADER ─────────────────────────────────────────────── */}
            <motion.header
                initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut' }}
                className="flex items-center justify-between gap-2 px-6 max-[520px]:px-3 h-16 bg-bg-panel border-b border-line shrink-0 z-10"
            >
                <div className="flex items-center gap-3 min-w-0">
                    <div onClick={handleSecretClick} className="cursor-pointer active:scale-95 transition-transform" title="Plastitec">
                        <CompanyLogo className="w-9 h-9" size={36} />
                    </div>
                    <span className="text-[17px] max-[520px]:text-[15px] whitespace-nowrap font-medium text-ink">Tu <span className="text-brand font-medium">Asistente</span> de RRHH</span>
                    {/* NexusCore compacto (54px) reflejando el appState real */}
                    <div className="relative w-[54px] h-[54px] rounded-full overflow-hidden flex items-center justify-center bg-surface border border-line shrink-0 ml-1 max-[520px]:hidden" title={`Estado: ${appState.toLowerCase()}`}>
                        <div className="absolute" style={{ width: 320, height: 320, transform: 'scale(0.22)' }}>
                            <NexusCore status={appState.toLowerCase()} volume={volume} />
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsDocsOpen(true)}
                        title="¿Qué documentos conozco?"
                        className="flex items-center gap-2 px-4 h-10 bg-surface border border-line rounded-lg text-[14px] font-medium text-ink hover:bg-brand-light hover:border-brand hover:text-brand transition-colors"
                    >
                        <span>📄</span><span className="hidden sm:inline">Documentos</span>
                    </button>
                    <button
                        onClick={() => setIsGuideOpen(true)}
                        className="flex items-center gap-2 px-4 h-10 bg-surface border border-line rounded-lg text-[14px] font-medium text-ink hover:bg-brand-light hover:border-brand hover:text-brand transition-colors"
                    >
                        <span>💡</span><span className="hidden sm:inline">¿Cómo preguntar?</span>
                    </button>
                    <button
                        onClick={handleResetClick}
                        title="Limpiar la pregunta y la respuesta"
                        className={`flex items-center gap-2 px-4 h-10 rounded-lg text-[14px] font-medium transition-colors border ${confirmingReset
                            ? 'text-white border-transparent'
                            : 'bg-surface border-line text-ink hover:bg-brand-light hover:border-brand hover:text-brand'
                            }`}
                        style={confirmingReset ? { background: 'var(--color-cat-coral)' } : undefined}
                    >
                        <span>🔄</span><span className="hidden sm:inline">{confirmingReset ? '¿Seguro?' : 'Reiniciar'}</span>
                    </button>
                </div>
            </motion.header>

            {/* ── CUERPO: 2 paneles ──────────────────────────────────── */}
            <div className="flex flex-1 overflow-hidden max-[880px]:flex-col max-[880px]:overflow-y-auto">

                {/* PANEL IZQUIERDO — PREGUNTA + RESPUESTA (57%) */}
                <motion.section
                    initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.06, ease: 'easeOut' }}
                    className="w-[57%] flex flex-col gap-5 p-5 overflow-y-auto custom-scrollbar bg-bg-page border-r border-line max-[880px]:w-full max-[880px]:overflow-visible max-[880px]:border-r-0"
                >
                    {/* ── Tarjeta: Haz tu pregunta ── */}
                    <div className="rounded-2xl border border-line p-5 shrink-0" style={{ background: '#F4F7FB' }}>
                        <div className="flex items-start gap-4 mb-5">
                            <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={{ background: '#E3EEFA', color: 'var(--color-brand)' }}>
                                <ChatBubbleIcon />
                            </div>
                            <div>
                                <h2 className="text-[18px] font-semibold text-ink leading-tight">Haz tu pregunta</h2>
                                <p className="text-[14px] text-[#6B7280] mt-1">Escribe una sola pregunta sobre el Reglamento Interno, BPM, vacaciones, permisos, horarios y más.</p>
                            </div>
                        </div>

                        <div className="flex items-stretch gap-4 max-[520px]:flex-col">
                            <div className="flex-1 relative">
                                <input
                                    ref={inputRef}
                                    type="text" autoComplete="off"
                                    placeholder={appState === 'LISTENING' ? 'Escuchando…' : 'Ej: ¿Cuántos días de vacaciones tengo al año?'}
                                    value={inputValue}
                                    maxLength={MAX_QUERY_LENGTH}
                                    onChange={e => setInputValue(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitInput(); } }}
                                    disabled={appState === 'LISTENING' || isBusy}
                                    className={`w-full h-[58px] pl-5 ${isSupported ? 'pr-14' : 'pr-5'} border-[1.5px] border-line rounded-xl text-[16px] bg-bg-panel text-ink outline-none transition-colors focus:border-brand placeholder:text-muted disabled:opacity-70`}
                                />
                                {isSupported && (
                                    <button
                                        onClick={micButtonClick}
                                        disabled={isBusy}
                                        className={`absolute right-2.5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 ${appState === 'LISTENING' ? 'bg-brand text-white' : 'text-muted hover:text-brand hover:bg-brand-light/40'}`}
                                        title={appState === 'LISTENING' ? 'Detener' : 'Preguntar por voz'}
                                    >
                                        {appState === 'LISTENING' ? <StopIcon /> : <MicIcon />}
                                    </button>
                                )}
                                {inputValue.length >= COUNTER_THRESHOLD && (
                                    <span className="absolute right-3 bottom-[-18px] text-[10px] text-muted tabular-nums">
                                        {inputValue.length}/{MAX_QUERY_LENGTH}
                                    </span>
                                )}
                            </div>
                            <button
                                onClick={submitInput}
                                disabled={isBusy || appState === 'LISTENING'}
                                className="h-[58px] px-8 rounded-xl bg-brand hover:bg-brand-hover text-white text-[17px] font-medium flex items-center justify-center gap-3 transition-colors shrink-0 shadow-[0_2px_8px_rgba(24,95,165,0.25)] disabled:opacity-60"
                            >
                                <SendIcon /> {isBusy ? 'Consultando…' : 'Consultar'}
                            </button>
                        </div>

                        <p className="flex items-center gap-2 text-[13px] text-[#6B7280] mt-5">
                            <span className="text-[#6B7280]"><InfoIcon /></span>
                            La IA responderá con base en los documentos de la empresa. Formula preguntas claras y específicas.
                        </p>
                    </div>

                    {/* ── Tarjeta: Respuesta ── */}
                    <div ref={answerRef} className="rounded-2xl border border-line bg-bg-panel p-5 shrink-0">
                        <div className="flex items-start gap-4 mb-5">
                            <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--color-cat-teal-fill)', color: 'var(--color-cat-teal)' }}>
                                <DocIcon />
                            </div>
                            <div>
                                <h2 className="text-[18px] font-semibold text-ink leading-tight">Respuesta</h2>
                                <p className="text-[14px] text-[#6B7280] mt-1">Información obtenida de los documentos de la empresa.</p>
                            </div>
                        </div>

                        <AnimatePresence mode="wait">
                            {isBusy ? (
                                <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                    className="rounded-xl border border-line p-6" style={{ background: '#FAFBFC' }}>
                                    {pendingQuestion && <p className="text-[13px] text-muted mb-3">Pregunta: <span className="text-ink">{pendingQuestion}</span></p>}
                                    <div className="flex items-center gap-3 text-[15px] text-[#6B7280]">
                                        <span className="flex items-end gap-[3px] h-3.5">
                                            <span className="w-[5px] h-3.5 rounded-sm bg-brand-light origin-bottom animate-typing1" />
                                            <span className="w-[5px] h-3.5 rounded-sm bg-brand-light origin-bottom animate-typing2" />
                                            <span className="w-[5px] h-3.5 rounded-sm bg-brand-light origin-bottom animate-typing3" />
                                        </span>
                                        {subStateText}
                                    </div>
                                </motion.div>
                            ) : answer ? (
                                <motion.div key={answer.raw} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                                    <div className="rounded-xl border border-line p-6" style={{ background: '#FAFBFC' }}>
                                        <AnswerBody text={answer.body} />
                                        {answer.sources.length > 0 && (
                                            <div className="mt-5 pt-4 border-t border-line">
                                                <p className="flex items-center gap-2 text-[14px] font-medium text-ink mb-2"><ClipIcon /> Información extraída de:</p>
                                                <ul className="list-disc pl-11 flex flex-col gap-1 text-[15px] text-ink">
                                                    {answer.sources.map((s, i) => <li key={i}>{s}</li>)}
                                                </ul>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center justify-between gap-3 mt-4 flex-wrap">
                                        <div className="flex items-center gap-2.5">
                                            {feedback ? (
                                                <span className="text-[14px] text-[#6B7280]">
                                                    {feedback === 'up' ? '¡Gracias! Nos alegra que te sirviera.' : 'Gracias, lo usaremos para mejorar.'}
                                                </span>
                                            ) : (
                                                <>
                                                    <span className="text-[14px] text-[#6B7280] mr-1">¿Esta respuesta fue útil?</span>
                                                    <button onClick={() => sendFeedback('up')}
                                                        className="inline-flex items-center gap-2 h-11 px-5 rounded-full text-[14px] font-medium transition-colors hover:brightness-95"
                                                        style={{ background: 'var(--color-cat-teal-fill)', color: 'var(--color-cat-teal)' }}>
                                                        <ThumbUpIcon /> Sí
                                                    </button>
                                                    <button onClick={() => sendFeedback('down')}
                                                        className="inline-flex items-center gap-2 h-11 px-5 rounded-full text-[14px] font-medium transition-colors hover:brightness-95"
                                                        style={{ background: '#FDECEC', color: '#C62828' }}>
                                                        <ThumbDownIcon /> No
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {synthRef.current && (
                                                <button onClick={() => speakText(answer.body)} title="Escuchar la respuesta"
                                                    className="w-11 h-11 rounded-xl border border-line text-brand flex items-center justify-center hover:bg-brand-light/40 transition-colors">
                                                    <SpeakerIcon />
                                                </button>
                                            )}
                                            <button onClick={handleCopy}
                                                className="inline-flex items-center gap-2 h-11 px-5 rounded-xl border text-[14px] font-medium transition-colors"
                                                style={{ background: '#EEF5FD', borderColor: '#CFE0F5', color: 'var(--color-brand)' }}>
                                                <CopyIcon /> {copied ? 'Copiada ✓' : 'Copiar respuesta'}
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            ) : (
                                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                    className="rounded-xl border border-dashed border-line p-8 text-center" style={{ background: '#FAFBFC' }}>
                                    <p className="text-[15px] text-[#6B7280]">Aquí aparecerá la respuesta a tu pregunta.</p>
                                    <p className="text-[13px] text-muted mt-1">Cada consulta es independiente: si tienes otra duda, escríbela completa como una pregunta nueva.</p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <p className="text-[11px] text-muted text-center shrink-0 -mt-1">
                        El asistente puede cometer errores. Verifica la información importante con Recursos Humanos.
                    </p>
                </motion.section>

                {/* PANEL DERECHO — MÉTRICAS + FAQ (43%) */}
                <motion.aside
                    initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.12, ease: 'easeOut' }}
                    className="w-[43%] flex flex-col bg-bg-panel overflow-y-auto custom-scrollbar p-5 gap-5 max-[880px]:w-full max-[880px]:overflow-visible"
                >
                    <div className="grid grid-cols-3 gap-3">
                        {[
                            { label: 'Consultas hoy', value: metrics.consultas, dot: '#5B9BE0' },
                            { label: 'Resueltas', value: metrics.resueltas, dot: '#7FD1AE' },
                            { label: 'Pendientes', value: pendientes, dot: '#F2C46D' },
                        ].map((m, i) => (
                            <div key={i} className="bg-bg-panel border border-line rounded-xl p-4 flex flex-col gap-1.5">
                                <span className="text-[12px] font-medium text-[#6B7280] uppercase tracking-wider">{m.label}</span>
                                <motion.span key={m.value} initial={{ opacity: 0.4, y: 3 }} animate={{ opacity: 1, y: 0 }} className="text-[30px] font-medium text-ink leading-none mt-1">{m.value}</motion.span>
                                <div className="w-2.5 h-2.5 rounded-full mt-2" style={{ background: m.dot }} />
                            </div>
                        ))}
                    </div>

                    <div className="flex items-baseline justify-between gap-2">
                        <div className="flex items-baseline gap-3 flex-wrap">
                            <h2 className="text-[17px] font-medium text-ink">Preguntas frecuentes</h2>
                            <p className="text-[13px] text-[#6B7280]">Haz clic para usar como ejemplo</p>
                        </div>
                        <button onClick={() => setIsFaqOpen(true)} className="text-[14px] font-medium text-brand hover:underline whitespace-nowrap">
                            Ver todas →
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3 max-[640px]:grid-cols-1">
                        {FAQS.slice(0, FAQ_VISIBLE).map((faq, i) => (
                            <FaqCard key={i} faq={faq} featured={i === 0} onPick={pickFaq} disabled={isBusy} />
                        ))}
                    </div>
                </motion.aside>
            </div>

            {/* ── Footer global: aviso de fase de pruebas ────────────── */}
            <div className="shrink-0 px-6 py-2.5 border-t border-line text-center" style={{ background: '#FDF1E3' }}>
                <p className="text-[13px]" style={{ color: '#7a4a1e' }}>
                    ✏️ Este asistente se encuentra en fase de pruebas. Tu retroalimentación nos ayuda a mejorarlo.
                </p>
            </div>

            {/* ── Toast de error ─────────────────────────────────────── */}
            <AnimatePresence>
                {error && (
                    <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} className="fixed bottom-12 left-0 w-full flex justify-center z-[100] px-6">
                        <div className="bg-bg-panel border border-cat-coral/30 text-ink px-6 py-3 rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] flex items-center gap-3 max-w-lg">
                            <span className="text-lg">⚠️</span>
                            <span className="text-sm font-medium flex-1" style={{ color: 'var(--color-cat-coral)' }}>{error}</span>
                            <button onClick={() => setError(null)} className="text-muted hover:text-ink transition-colors px-2">✕</button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Modal: todas las preguntas frecuentes ──────────────── */}
            <AnimatePresence>
                {isFaqOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[250] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm" onClick={() => setIsFaqOpen(false)}>
                        <motion.div initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 12 }}
                            className="bg-bg-panel border border-line rounded-2xl p-6 max-w-3xl w-full shadow-2xl flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between mb-5 shrink-0">
                                <div>
                                    <h2 className="text-lg font-medium text-ink">Preguntas frecuentes</h2>
                                    <p className="text-[13px] text-[#6B7280] mt-0.5">Haz clic en una para consultarla</p>
                                </div>
                                <button onClick={() => setIsFaqOpen(false)} className="w-10 h-10 flex items-center justify-center bg-surface hover:bg-line border border-line rounded-full text-muted hover:text-ink transition-all text-xl">✕</button>
                            </div>
                            <div className="grid grid-cols-2 gap-3 overflow-y-auto custom-scrollbar max-[640px]:grid-cols-1">
                                {FAQS.map((faq, i) => <FaqCard key={i} faq={faq} featured={i === 0} onPick={pickFaq} disabled={isBusy} />)}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Modal PIN admin ────────────────────────────────────── */}
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

            {/* Documentos base */}
            <AnimatePresence>
                {isDocsOpen && <DocumentsGuide isOpen={isDocsOpen} onClose={() => setIsDocsOpen(false)} />}
            </AnimatePresence>
        </div>
    );
};

export default ChatShell;
