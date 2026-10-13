import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue } from 'framer-motion';
import aiClient from '../../utils/aiClient';
import { API_BASE_URL } from '../../utils/apiConfig';
import NexusCore from '../NexusCore';
import {
    FAQS, FAQ_VISIBLE, MAX_QUERY_LENGTH, COUNTER_THRESHOLD,
    splitAnswer, isNotFoundAnswer, AnswerBody,
    MicIcon, StopIcon, SendIcon, SpeakerIcon, CopyIcon,
    ViewTopBar, copyToClipboard, CAT, ICONS,
    CheckCircleIcon, ExclamationTriangleIcon, BanIcon, TimesIcon, PaperclipIcon,
    CheckIcon, FrownIcon, MehIcon, SmileIcon, RedoAltIcon,
} from './shared.jsx';

/**
 * ChatView — "Pregúntale a la IA" (rediseño 2026-10-09, kiosco tema claro).
 * Mismo motor real que el ChatShell anterior (aiClient, voz, TTS, mutex,
 * timeouts adaptativos, reporte de errores) con la pantalla de estados del
 * diseño de referencia: vacío → procesando → encontrada / no encontrada / error.
 * Respaldo del layout de 2 paneles: backups/ui_2026-10-09/ChatShell_2panel_qa.jsx
 */
const ChatView = ({ onHome, onNavigate, autoQuery, onAutoQueryConsumed, onContentChange, resetSignal }) => {
    const [answer, setAnswer] = useState(null); // { question, body, sources, raw, notFound }
    const [pendingQuestion, setPendingQuestion] = useState('');
    const [feedback, setFeedback] = useState(null); // null | 'good' | 'neutral' | 'bad'
    const [copied, setCopied] = useState(false);
    const [appState, setAppState] = useState('IDLE'); // IDLE, LISTENING, PROCESSING, RESPONDING
    const [processingStep, setProcessingStep] = useState(0);
    const [inputValue, setInputValue] = useState('');
    const [systemError, setSystemError] = useState(null); // falla de red/backend al consultar → tarjeta grande
    const [toastError, setToastError] = useState(null);    // mic/copiar/voz → aviso flotante, no oculta contenido
    const [isSupported, setIsSupported] = useState(true);

    const volume = useMotionValue(0);

    const recognitionRef = useRef(null);
    const synthRef = useRef(typeof window !== 'undefined' ? window.speechSynthesis : null);
    const streamRef = useRef(null);
    const abortControllerRef = useRef(null);
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const animationFrameRef = useRef(null);
    const currentUtteranceRef = useRef(null);
    const isActivatedRef = useRef(false);

    const stateRef = useRef(appState);
    useEffect(() => { stateRef.current = appState; }, [appState]);
    const mountedRef = useRef(true);
    const isLocked = useRef(false);
    const inputRef = useRef(null);
    const answerRef = useRef(null);
    const copiedTimerRef = useRef(null);

    const isMobileDevice = useRef((() => {
        const ua = navigator.userAgent;
        return /iPhone|iPad|iPod|Android|webOS/i.test(ua) || window.innerWidth <= 768;
    })());
    const isTabletOrKiosk = useRef(navigator.maxTouchPoints > 0 && window.innerWidth >= 768);

    // ── Montaje: init backend + soporte de voz ────────────────────────────
    useEffect(() => {
        mountedRef.current = true;
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            setIsSupported(false);
        }
        aiClient.initialize();
        aiClient.resetConversation();
        const synth = synthRef.current; // window.speechSynthesis es un singleton estable
        return () => {
            mountedRef.current = false;
            if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') audioContextRef.current.close();
            if (synth) synth.cancel();
        };
    }, []);

    // Informa al padre si hay contenido en pantalla (para el modal de inactividad).
    useEffect(() => {
        onContentChange?.(Boolean(answer) || appState === 'PROCESSING' || inputValue.length > 0);
    }, [answer, appState, inputValue, onContentChange]);

    const resetChat = useCallback(() => {
        if (synthRef.current) synthRef.current.cancel();
        if (abortControllerRef.current) abortControllerRef.current.abort();
        setInputValue('');
        setAnswer(null);
        setFeedback(null);
        setCopied(false);
        setSystemError(null);
        setToastError(null);
        setPendingQuestion('');
        setProcessingStep(0);
        setAppState('IDLE');
        isLocked.current = false;
    }, []);

    // Reinicio forzado desde el padre (botón "Reiniciar" global o inactividad).
    const lastResetSignal = useRef(resetSignal);
    useEffect(() => {
        if (resetSignal !== lastResetSignal.current) {
            lastResetSignal.current = resetSignal;
            resetChat();
        }
    }, [resetSignal, resetChat]);

    useEffect(() => {
        if (answer || appState === 'PROCESSING') {
            answerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [answer, appState]);

    useEffect(() => () => clearTimeout(copiedTimerRef.current), []);

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
        utterance.onstart = () => setAppState('RESPONDING');
        utterance.onend = () => setAppState(prev => prev === 'RESPONDING' ? 'IDLE' : prev);
        utterance.onerror = () => setAppState(prev => prev === 'RESPONDING' ? 'IDLE' : prev);

        const voices = synthRef.current.getVoices();
        const preferred = voices.find(v => v.lang.includes('es-MX') && v.name.includes('Google'))
            || voices.find(v => v.lang.includes('es')) || voices[0];
        if (preferred) utterance.voice = preferred;
        currentUtteranceRef.current = utterance;
        synthRef.current.speak(utterance);
    };

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
    const handleQuery = useCallback(async (rawQueryText) => {
        const queryText = (rawQueryText || '').slice(0, MAX_QUERY_LENGTH).trim();
        if (!queryText || queryText.length < 2) return;
        if (isLocked.current) return;
        isLocked.current = true;

        if (synthRef.current) synthRef.current.cancel();
        setInputValue(queryText);
        setPendingQuestion(queryText);
        setAnswer(null);
        setFeedback(null);
        setCopied(false);
        setAppState('PROCESSING');
        setProcessingStep(1);
        setSystemError(null);
        setToastError(null);

        const step2 = setTimeout(() => setProcessingStep(2), 1000);
        const step3 = setTimeout(() => setProcessingStep(3), 2000);

        try {
            abortControllerRef.current = new AbortController();
            const result = await aiClient.query(queryText, { signal: abortControllerRef.current.signal });
            if (!mountedRef.current) return;

            let finalResult = (result || '').trim();
            if (finalResult.toLowerCase() === 'sy') finalResult = 'Soy';
            if (finalResult.toLowerCase().startsWith('sy ')) finalResult = 'Soy ' + finalResult.substring(3);
            if (finalResult.toLowerCase() === 'ete') finalResult = 'Este';
            if (finalResult.toLowerCase().startsWith('te ')) finalResult = 'Este ' + finalResult.substring(3);

            const { body, sources } = splitAnswer(finalResult);
            const notFound = isNotFoundAnswer(body, sources);
            setAnswer({ question: queryText, body, sources, raw: finalResult, notFound });
            if (!notFound && synthRef.current) { setAppState('RESPONDING'); speakText(body); }
            else setAppState('IDLE');
        } catch (err) {
            if (err.name === 'AbortError') { setAppState('IDLE'); return; }
            reportError('IA', 'handleQuery', err.message, err.stack, { query: queryText });
            setSystemError(err.message || 'Ocurrió un inconveniente al conectar con el servidor de consulta local.');
            setAppState('IDLE');
        } finally {
            clearTimeout(step2); clearTimeout(step3);
            setProcessingStep(0);
            setPendingQuestion('');
            isLocked.current = false;
        }
    }, []);

    // Pregunta disparada desde fuera (chip de FAQ en Inicio/FAQs).
    const consumedAutoQuery = useRef(null);
    useEffect(() => {
        if (autoQuery && autoQuery !== consumedAutoQuery.current) {
            consumedAutoQuery.current = autoQuery;
            handleQuery(autoQuery);
            onAutoQueryConsumed?.();
        }
    }, [autoQuery, handleQuery, onAutoQueryConsumed]);

    const submitInput = () => {
        const v = inputValue.trim();
        if (!v) { inputRef.current?.focus(); return; }
        handleQuery(v);
    };

    // ── Feedback (😞/😐/😊) y copiar ───────────────────────────────────────
    const sendFeedback = async (value) => {
        if (!answer || feedback) return;
        setFeedback(value);
        try {
            await aiClient.rateAnswer({
                rating: value,
                question: answer.question,
                answer: answer.body.slice(0, 500),
                sources: answer.sources,
                conversationId: aiClient.conversationId,
            });
        } catch (e) { console.warn('No se pudo registrar la calificación:', e.message); }
        if (value === 'bad') {
            setTimeout(() => onNavigate?.('suggestions'), 1500);
        }
    };

    const handleCopy = async () => {
        if (!answer) return;
        const text = answer.sources.length
            ? `${answer.body}\n\nInformación extraída de:\n${answer.sources.map(s => `- ${s}`).join('\n')}`
            : answer.body;
        const ok = await copyToClipboard(text);
        if (!ok) { setToastError('No se pudo copiar la respuesta.'); return; }
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
        setToastError(null);
        setInputValue('');
        setAppState('LISTENING');

        if (isMobileDevice.current && streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null;
        }
        startVolumeLoop();

        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) { setToastError('Tu navegador no soporta reconocimiento de voz.'); setAppState('IDLE'); return; }

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
                setToastError(`Reconocimiento: ${e.error}`);
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

    const activateApp = async (thenListen = true) => {
        try {
            if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
                const isHTTP = window.location.protocol === 'http:';
                const isNonLocalhost = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
                reportError('Mic', 'activateApp', 'mediaDevices not available', null, { protocol: window.location.protocol, hostname: window.location.hostname });
                setToastError(isHTTP && isNonLocalhost
                    ? 'Micrófono requiere HTTPS. Usando modo teclado.'
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
            if (e.name === 'NotAllowedError') setToastError('Permiso de micrófono denegado. Habilítalo en el navegador.');
            else if (e.name === 'NotFoundError') setToastError('No se encontró micrófono. Usando modo teclado.');
            else setToastError('No pudimos activar el micrófono. Usando modo teclado.');
            setAppState('IDLE');
        }
    };

    const micButtonClick = () => {
        if (appState === 'LISTENING') return stopListening();
        if (!isActivatedRef.current) return activateApp(true);
        startListening();
    };

    const isBusy = appState === 'PROCESSING';
    const subStateTitle = processingStep <= 1 ? 'Buscando en los documentos oficiales...'
        : processingStep === 2 ? 'Cruzando con políticas y reglamentos...'
            : 'Preparando tu respuesta verificada...';
    const progressPct = processingStep <= 1 ? 33 : processingStep === 2 ? 66 : 100;

    const chips = FAQS.slice(0, 4);

    return (
        <section className="flex-1 flex flex-col h-full overflow-hidden bg-kiosk-bg">
            <ViewTopBar
                title="RITA"
                onHome={onHome}
                action={<span className="text-xs text-kiosk-muted hidden sm:inline w-24 text-right">Una respuesta a la vez</span>}
            />

            <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col items-center">
                <div className="w-full max-w-3xl flex flex-col gap-6">

                    {/* ── Estado: vacío (sin pregunta activa) ── */}
                    {!answer && !isBusy && !systemError && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full space-y-6 text-center">
                            <div className="relative w-16 h-16 mx-auto rounded-3xl overflow-hidden flex items-center justify-center bg-blue-50 border border-kiosk-border shadow-md">
                                <div className="absolute" style={{ width: 320, height: 320, transform: 'scale(0.3)' }}>
                                    <NexusCore status={appState.toLowerCase()} volume={volume} />
                                </div>
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-kiosk-text">¿Cuál es tu duda sobre la empresa?</h2>
                                <p className="text-kiosk-muted text-sm mt-1">Escribe tu pregunta o toca uno de los temas sugeridos abajo.</p>
                            </div>

                            <div className="flex flex-wrap justify-center gap-2 pt-2">
                                {chips.map((faq, i) => {
                                    const c = CAT[faq.theme];
                                    return (
                                        <button
                                            key={i}
                                            onClick={() => handleQuery(faq.q)}
                                            className="bg-kiosk-panel hover:bg-kiosk-card-hover border border-kiosk-border text-kiosk-muted hover:text-kiosk-text px-4 py-2.5 rounded-xl text-xs md:text-sm transition-all flex items-center space-x-2 shadow-sm"
                                        >
                                            <svg width="14" height="14" fill="none" stroke={c.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">{ICONS[faq.icon]}</svg>
                                            <span>{faq.q}</span>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="bg-kiosk-card border-2 border-kiosk-border rounded-2xl p-3 flex items-center space-x-3 shadow-lg mt-6">
                                <input
                                    ref={inputRef}
                                    type="text" autoComplete="off"
                                    id="chat-input-field" maxLength={MAX_QUERY_LENGTH}
                                    placeholder={appState === 'LISTENING' ? 'Escuchando…' : 'Escribe tu pregunta aquí (ej. ¿Cuántos días de vacaciones me tocan?)...'}
                                    value={inputValue}
                                    onChange={e => setInputValue(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitInput(); } }}
                                    disabled={appState === 'LISTENING'}
                                    className="flex-1 bg-transparent border-none text-kiosk-text placeholder-kiosk-muted focus:outline-none text-sm md:text-base py-2 px-2 disabled:opacity-70"
                                />
                                {isSupported && (
                                    <button
                                        onClick={micButtonClick}
                                        title={appState === 'LISTENING' ? 'Detener' : 'Dictar por voz'}
                                        className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors text-lg shrink-0 border border-kiosk-border shadow-sm ${appState === 'LISTENING' ? 'bg-kiosk-accent text-white' : 'bg-kiosk-panel hover:bg-blue-50 text-kiosk-muted hover:text-kiosk-accent'}`}
                                    >
                                        {appState === 'LISTENING' ? <StopIcon /> : <MicIcon />}
                                    </button>
                                )}
                                <button
                                    onClick={submitInput}
                                    disabled={appState === 'LISTENING'}
                                    className="bg-kiosk-accent hover:bg-kiosk-accent-hover text-white px-6 py-3 rounded-xl font-bold text-sm md:text-base transition-all flex items-center space-x-2 shadow-md shrink-0 disabled:opacity-60"
                                >
                                    <span>Consultar</span>
                                    <SendIcon />
                                </button>
                            </div>
                            <div className="flex justify-end px-2 text-xs text-kiosk-muted font-medium">
                                <span>{inputValue.length >= COUNTER_THRESHOLD ? `${inputValue.length} / ${MAX_QUERY_LENGTH} caracteres` : ''}</span>
                            </div>
                        </motion.div>
                    )}

                    {/* ── Estado: procesando ── */}
                    {isBusy && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full text-center space-y-6 py-12">
                            {pendingQuestion && <p className="text-[13px] text-kiosk-muted">Pregunta: <span className="text-kiosk-text">{pendingQuestion}</span></p>}
                            <div className="w-20 h-20 bg-blue-100 text-kiosk-accent rounded-full mx-auto flex items-center justify-center text-4xl animate-spin">
                                <svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-xl font-bold text-kiosk-text">{subStateTitle}</h3>
                                <p className="text-sm text-kiosk-muted">Cruzando información con reglamentos y políticas vigentes.</p>
                            </div>
                            <div className="w-48 h-2 bg-kiosk-panel rounded-full mx-auto overflow-hidden border border-kiosk-border">
                                <div className="h-full bg-kiosk-accent transition-all duration-500" style={{ width: `${progressPct}%` }} />
                            </div>
                        </motion.div>
                    )}

                    {/* ── Estado: respuesta encontrada / no encontrada ── */}
                    {answer && !isBusy && (
                        <div ref={answerRef} className="w-full space-y-6">
                            <div className="bg-kiosk-panel border border-kiosk-border px-4 py-2.5 rounded-xl text-xs text-kiosk-muted flex items-center justify-between shadow-sm">
                                <span><strong className="text-kiosk-text">Tu pregunta:</strong> {answer.question}</span>
                                <button onClick={resetChat} className="text-kiosk-accent hover:underline font-semibold whitespace-nowrap ml-3 inline-flex items-center gap-1">
                                    <RedoAltIcon size={11} /><span>Nueva pregunta</span>
                                </button>
                            </div>

                            {!answer.notFound ? (
                                <>
                                    <div className="bg-kiosk-card border border-kiosk-accent/40 rounded-2xl p-6 shadow-xl space-y-4">
                                        <div className="flex items-center space-x-3 text-kiosk-accent">
                                            <CheckCircleIcon size={22} />
                                            <h4 className="font-bold text-lg text-kiosk-text">Respuesta Encontrada</h4>
                                        </div>
                                        <div className="bg-kiosk-panel p-4 rounded-xl border border-kiosk-border shadow-inner">
                                            <AnswerBody text={answer.body} />
                                        </div>
                                        <div className="flex items-center justify-between text-xs text-kiosk-muted pt-2 border-t border-kiosk-border flex-wrap gap-2">
                                            {answer.sources.length > 0 ? (
                                                <span className="flex items-start gap-1.5">
                                                    <span className="text-kiosk-accent mt-0.5"><PaperclipIcon size={13} /></span>
                                                    <span><strong>Fuente:</strong> {answer.sources.join(' · ')}</span>
                                                </span>
                                            ) : <span />}
                                            <div className="flex items-center gap-2">
                                                {synthRef.current && (
                                                    <button onClick={() => speakText(answer.body)} className="bg-kiosk-panel hover:bg-blue-50 text-kiosk-text hover:text-kiosk-accent px-3 py-1.5 rounded-lg border border-kiosk-border transition-colors flex items-center space-x-1 shadow-sm">
                                                        <SpeakerIcon /><span>Escuchar</span>
                                                    </button>
                                                )}
                                                <button onClick={handleCopy} className="bg-kiosk-panel hover:bg-blue-50 text-kiosk-text hover:text-kiosk-accent px-3 py-1.5 rounded-lg border border-kiosk-border transition-colors flex items-center space-x-1 shadow-sm">
                                                    {copied ? <CheckIcon size={13} /> : <CopyIcon />}<span>{copied ? 'Copiada' : 'Copiar'}</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Feedback 3 estados */}
                                    <div className="bg-kiosk-card border border-kiosk-border rounded-2xl p-4 text-center space-y-3 shadow-md">
                                        {!feedback ? (
                                            <>
                                                <p className="text-sm font-semibold text-kiosk-text">¿Te sirvió esta respuesta?</p>
                                                <div className="flex justify-center gap-3">
                                                    <button onClick={() => sendFeedback('bad')} className="bg-kiosk-panel hover:bg-rose-50 border border-kiosk-border hover:border-rose-300 px-5 py-2.5 rounded-xl text-rose-500 transition-all flex items-center space-x-2 shadow-sm">
                                                        <FrownIcon size={20} /><span className="text-xs text-kiosk-muted font-medium">No sirvió</span>
                                                    </button>
                                                    <button onClick={() => sendFeedback('neutral')} className="bg-kiosk-panel hover:bg-amber-50 border border-kiosk-border hover:border-amber-300 px-5 py-2.5 rounded-xl text-amber-500 transition-all flex items-center space-x-2 shadow-sm">
                                                        <MehIcon size={20} /><span className="text-xs text-kiosk-muted font-medium">Más o menos</span>
                                                    </button>
                                                    <button onClick={() => sendFeedback('good')} className="bg-kiosk-panel hover:bg-emerald-50 border border-kiosk-border hover:border-emerald-300 px-5 py-2.5 rounded-xl text-emerald-500 transition-all flex items-center space-x-2 shadow-sm">
                                                        <SmileIcon size={20} /><span className="text-xs text-kiosk-muted font-medium">Me sirvió</span>
                                                    </button>
                                                </div>
                                            </>
                                        ) : (
                                            <p className="text-center bg-blue-50 border border-blue-200 p-3 rounded-xl text-blue-800 text-sm font-semibold">
                                                {feedback === 'bad'
                                                    ? '¡Gracias! Te llevamos al Buzón de Sugerencias para contarnos más.'
                                                    : '¡Gracias por tu calificación! Tu opinión nos ayuda a mejorar el asistente diario.'}
                                            </p>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <div className="w-full space-y-6 text-center">
                                    <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-3xl mx-auto flex items-center justify-center shadow-sm"><ExclamationTriangleIcon size={28} /></div>
                                    <div className="space-y-2">
                                        <h3 className="text-xl font-bold text-kiosk-text">Información no encontrada</h3>
                                        <p className="text-sm text-kiosk-muted max-w-md mx-auto">No encontré esta información específica en los documentos oficiales actuales de Plastitec.</p>
                                    </div>
                                    <div className="bg-kiosk-card border border-kiosk-border p-4 rounded-2xl max-w-md mx-auto text-sm text-kiosk-muted shadow-sm">
                                        Te recomendamos acudir directamente al área de Gestión Humana (RRHH) en oficina principal o contactar al anexo 142.
                                    </div>
                                    <div className="flex justify-center flex-wrap gap-4 pt-2">
                                        <button onClick={resetChat} className="bg-kiosk-card hover:bg-kiosk-card-hover border border-kiosk-border text-kiosk-text px-6 py-3 rounded-xl font-semibold text-sm transition-all shadow-sm">
                                            Reformular pregunta
                                        </button>
                                        <button onClick={() => onNavigate?.('suggestions')} className="bg-kiosk-accent hover:bg-kiosk-accent-hover text-white px-6 py-3 rounded-xl font-bold text-sm transition-all shadow-md">
                                            Reportar en Buzón
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Estado: error de sistema (falló la consulta al backend) ── */}
                    {systemError && !isBusy && !answer && (
                        <div className="w-full space-y-6 text-center">
                            <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-3xl mx-auto flex items-center justify-center shadow-sm"><BanIcon size={28} /></div>
                            <div className="space-y-2">
                                <h3 className="text-xl font-bold text-kiosk-text">Error temporal del sistema</h3>
                                <p className="text-sm text-kiosk-muted max-w-md mx-auto">{systemError}</p>
                            </div>
                            <button onClick={resetChat} className="bg-kiosk-accent hover:bg-kiosk-accent-hover text-white px-8 py-3 rounded-xl font-bold text-sm transition-all shadow-md">
                                Intentar de nuevo
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div className="px-6 py-3 border-t border-kiosk-border bg-kiosk-card text-[11px] text-kiosk-muted text-center shadow-sm shrink-0">
                Aviso: La información generada por la IA es de carácter orientativo. El asistente puede cometer errores; ante dudas legales o contractuales, consulta los documentos oficiales con RRHH.
            </div>

            <AnimatePresence>
                {toastError && (
                    <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} className="fixed bottom-16 left-0 w-full flex justify-center z-[100] px-6">
                        <div className="bg-kiosk-card border border-rose-200 text-kiosk-text px-6 py-3 rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] flex items-center gap-3 max-w-lg">
                            <span className="text-amber-500"><ExclamationTriangleIcon size={18} /></span>
                            <span className="text-sm font-medium flex-1 text-rose-700">{toastError}</span>
                            <button onClick={() => setToastError(null)} className="text-kiosk-muted hover:text-kiosk-text transition-colors px-2"><TimesIcon size={14} /></button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </section>
    );
};

export default ChatView;
