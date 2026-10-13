import { useEffect, useRef, useState } from 'react';
import aiClient from '../../utils/aiClient';
import {
    ViewTopBar, LightbulbIcon, ExclamationTriangleIcon, FileAltIcon, SmileIcon,
    CommentDotsIcon, UserSecretIcon, CheckCircleIcon,
} from './shared.jsx';

const TYPES = [
    { id: 'sugerencia', Icon: LightbulbIcon, label: 'Sugerencia' },
    { id: 'respuesta_incorrecta', Icon: ExclamationTriangleIcon, label: 'Resp. Incorrecta' },
    { id: 'falta_info', Icon: FileAltIcon, label: 'Falta Info' },
    { id: 'felicitacion', Icon: SmileIcon, label: 'Felicitación' },
    { id: 'otro', Icon: CommentDotsIcon, label: 'Otro' },
];
const MAX_MESSAGE_LENGTH = 500;
const AUTO_RETURN_SECONDS = 5;

/**
 * SuggestionsView — "Buzón de Sugerencias" (rediseño 2026-10-09).
 * Envía a POST /api/suggestions → se persiste en SQLite (hr_cache.db, tabla
 * `suggestions`), visible para RRHH vía GET /api/suggestions. Puede enviarse
 * de forma anónima (nombre y área son opcionales).
 */
const SuggestionsView = ({ onHome, onContentChange, resetSignal }) => {
    const [type, setType] = useState('sugerencia');
    const [message, setMessage] = useState('');
    const [name, setName] = useState('');
    const [area, setArea] = useState('');
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState(null);
    const [countdown, setCountdown] = useState(AUTO_RETURN_SECONDS);
    const countdownRef = useRef(null);

    const resetForm = () => {
        clearInterval(countdownRef.current);
        setType('sugerencia'); setMessage(''); setName(''); setArea('');
        setSending(false); setSent(false); setError(null); setCountdown(AUTO_RETURN_SECONDS);
    };

    // Reinicio forzado desde el padre (botón "Reiniciar" global o inactividad).
    const lastResetSignal = useRef(resetSignal);
    useEffect(() => {
        if (resetSignal !== lastResetSignal.current) {
            lastResetSignal.current = resetSignal;
            resetForm();
        }
    }, [resetSignal]);

    useEffect(() => {
        onContentChange?.(!sent && message.trim().length > 0);
    }, [message, sent, onContentChange]);

    useEffect(() => () => clearInterval(countdownRef.current), []);

    const handleSubmit = async () => {
        const trimmed = message.trim();
        if (trimmed.length < 3) { setError('Escribe un mensaje un poco más detallado.'); return; }
        setSending(true);
        setError(null);
        try {
            await aiClient.submitSuggestion({ type, message: trimmed, name: name.trim() || null, area: area.trim() || null });
            setSent(true);
            countdownRef.current = setInterval(() => {
                setCountdown(s => {
                    if (s <= 1) { clearInterval(countdownRef.current); resetForm(); onHome(); return 0; }
                    return s - 1;
                });
            }, 1000);
        } catch (e) {
            setError(e.message || 'No se pudo enviar el mensaje. Intenta de nuevo.');
        } finally {
            setSending(false);
        }
    };

    return (
        <section className="flex-1 flex flex-col h-full overflow-hidden bg-kiosk-bg">
            <ViewTopBar title="Buzón de Sugerencias y Reportes" onHome={onHome} />

            <div className="flex-1 overflow-y-auto p-6 md:p-8 max-w-2xl mx-auto w-full space-y-6">
                {!sent ? (
                    <div className="bg-kiosk-card border border-kiosk-border rounded-3xl p-6 md:p-8 space-y-6 shadow-xl">
                        <div>
                            <h2 className="text-xl font-bold text-kiosk-text">Tu opinión nos importa</h2>
                            <p className="text-xs text-kiosk-muted mt-1">Envía sugerencias, reporta respuestas incorrectas de la IA o comparte felicitaciones.</p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-kiosk-muted uppercase tracking-wider">Tipo de mensaje</label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {TYPES.map(t => (
                                    <button
                                        key={t.id} type="button" onClick={() => setType(t.id)}
                                        className={`px-4 py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 shadow-sm border-2 ${
                                            type === t.id
                                                ? 'bg-kiosk-panel border-kiosk-accent text-kiosk-accent'
                                                : 'bg-kiosk-panel border-kiosk-border text-kiosk-muted'
                                        } ${t.id === 'otro' ? 'col-span-2 sm:col-span-1' : ''}`}
                                    >
                                        <t.Icon size={16} /><span>{t.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-semibold text-kiosk-muted uppercase tracking-wider">Detalle del mensaje</label>
                                <span className="text-xs text-kiosk-muted font-medium">{message.length} / {MAX_MESSAGE_LENGTH}</span>
                            </div>
                            <textarea
                                value={message} maxLength={MAX_MESSAGE_LENGTH} rows={4}
                                onChange={e => setMessage(e.target.value)}
                                placeholder="Escribe aquí tu comentario con total libertad..."
                                className="w-full bg-kiosk-panel border border-kiosk-border rounded-xl p-4 text-kiosk-text text-sm placeholder-kiosk-muted focus:outline-none focus:border-kiosk-accent resize-none shadow-inner"
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-kiosk-muted">Nombre (Opcional)</label>
                                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Juan Pérez"
                                    className="w-full bg-kiosk-panel border border-kiosk-border rounded-xl px-4 py-2.5 text-sm text-kiosk-text focus:outline-none focus:border-kiosk-accent shadow-sm" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-kiosk-muted">Área / Planta (Opcional)</label>
                                <input type="text" value={area} onChange={e => setArea(e.target.value)} placeholder="Ej. Producción Línea 3"
                                    className="w-full bg-kiosk-panel border border-kiosk-border rounded-xl px-4 py-2.5 text-sm text-kiosk-text focus:outline-none focus:border-kiosk-accent shadow-sm" />
                            </div>
                        </div>

                        {error && <p className="text-sm text-rose-600 font-medium">{error}</p>}

                        <div className="flex items-center justify-between pt-2 flex-wrap gap-3">
                            <span className="text-xs text-kiosk-accent font-medium flex items-center space-x-1.5">
                                <UserSecretIcon size={14} /><span>Puedes enviarlo de forma completamente anónima</span>
                            </span>
                            <button
                                onClick={handleSubmit} disabled={sending}
                                className="bg-kiosk-accent hover:bg-kiosk-accent-hover text-white px-8 py-3.5 rounded-xl font-bold text-sm transition-all shadow-md disabled:opacity-60"
                            >
                                {sending ? 'Enviando…' : 'Enviar Sugerencia'}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="bg-kiosk-card border border-kiosk-accent/50 rounded-3xl p-8 text-center space-y-6 shadow-2xl">
                        <div className="w-20 h-20 bg-blue-100 text-kiosk-accent rounded-full mx-auto flex items-center justify-center shadow-sm"><CheckCircleIcon size={36} /></div>
                        <div className="space-y-2">
                            <h3 className="text-2xl font-bold text-kiosk-text">¡Mensaje enviado con éxito!</h3>
                            <p className="text-sm text-kiosk-muted max-w-sm mx-auto">Agradecemos tu aporte. El equipo de Gestión Humana revisará tu comentario para seguir mejorando.</p>
                        </div>
                        <p className="text-xs text-kiosk-muted">Volviendo al inicio automáticamente en <span className="font-bold text-kiosk-accent">{countdown}</span> segundos...</p>
                        <button onClick={() => { resetForm(); onHome(); }} className="bg-kiosk-panel hover:bg-kiosk-card-hover border border-kiosk-border text-kiosk-text px-6 py-2.5 rounded-xl text-xs font-medium shadow-sm">
                            Volver al inicio ahora
                        </button>
                    </div>
                )}
            </div>
        </section>
    );
};

export default SuggestionsView;
