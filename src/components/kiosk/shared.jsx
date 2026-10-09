/**
 * shared.jsx — piezas comunes del kiosco (rediseño 2026-10-09, tema claro,
 * pantalla de inicio con tarjetas). Portado desde el ChatShell de 2 paneles:
 * mismos íconos SVG, parser de respuestas y tarjeta de FAQ, reutilizados por
 * HomeView, ChatView y FaqView para no duplicar lógica de render.
 */

// ── Categorías FAQ → color (vía CSS vars de @theme en index.css) ───────────
export const CAT = {
    teal: { fill: 'var(--color-cat-teal-fill)', color: 'var(--color-cat-teal)' },
    coral: { fill: 'var(--color-cat-coral-fill)', color: 'var(--color-cat-coral)' },
    amber: { fill: 'var(--color-cat-amber-fill)', color: 'var(--color-cat-amber)' },
    green: { fill: 'var(--color-cat-green-fill)', color: 'var(--color-cat-green)' },
    purple: { fill: 'var(--color-cat-purple-fill)', color: 'var(--color-cat-purple)' },
};

export const ICONS = {
    calendar: <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />,
    alert: <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>,
    clock: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
    phone: <><rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12.01" y2="18" /></>,
    drop: <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />,
};

// ── FAQ (al hacer clic se usa como pregunta real y se consulta al RAG) ─────
export const FAQS = [
    { theme: 'teal', icon: 'calendar', cat: 'Vacaciones y licencias', q: '¿Cuántos días de permiso por luto tengo?', freq: 8 },
    { theme: 'coral', icon: 'alert', cat: 'Accidentes', q: '¿Cómo reporto un accidente laboral?', freq: 6 },
    { theme: 'amber', icon: 'clock', cat: 'Horarios', q: '¿Cuál es el horario de trabajo?', freq: 4 },
    { theme: 'purple', icon: 'phone', cat: 'Normas internas', q: '¿Puedo usar mi celular en la planta?', freq: 4 },
    { theme: 'teal', icon: 'calendar', cat: 'Vacaciones y licencias', q: '¿Cómo solicito vacaciones?', freq: 2 },
    { theme: 'teal', icon: 'calendar', cat: 'Vacaciones y licencias', q: '¿Cuántos días de vacaciones tengo al año?' },
    { theme: 'amber', icon: 'clock', cat: 'Horarios', q: '¿Cuántas horas tiene la jornada laboral semanal?' },
    { theme: 'green', icon: 'drop', cat: 'Higiene y BPM', q: '¿Cuál es el procedimiento de lavado de manos?' },
    { theme: 'purple', icon: 'phone', cat: 'Normas internas', q: '¿Puedo ingresar alimentos a la planta?' },
];
// Cuántas tarjetas se muestran antes de "Ver todas".
export const FAQ_VISIBLE = 5;

// Límite de longitud de consulta (espejo del MAX_QUERY_LENGTH del backend).
export const MAX_QUERY_LENGTH = 200;
export const COUNTER_THRESHOLD = 160;

// Separador que el backend pone antes del bloque de fuentes:
// "...respuesta\n\n---\n📎 *Información extraída de:*\n- Doc A\n- Doc B"
const SOURCES_SPLIT_RE = /\n\s*-{3,}\s*\n/;

/** Separa el cuerpo de la respuesta y la lista de fuentes que agrega el backend. */
export const splitAnswer = (raw) => {
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

// Heurística visual (NO cambia el motor real): el backend siempre responde
// 200 con texto; estos prefijos son los mensajes canónicos de "sin contenido"
// (ver config/systemMessages.js). Al detectarlos mostramos la tarjeta ámbar
// "Información no encontrada" del diseño en vez de la tarjeta verde de éxito.
const NOT_FOUND_RE = /^(no encontr[ée] informaci[oó]n|no entendi[eé] tu pregunta|no se encontr[oó] informaci[oó]n suficiente|no puedo proporcionar informaci[oó]n confidencial)/i;
export const isNotFoundAnswer = (body, sources) => sources.length === 0 && NOT_FOUND_RE.test((body || '').trim());

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
export const AnswerBody = ({ text }) => {
    const blocks = [];
    let list = null;
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
        <div className="flex flex-col gap-3 text-[15px] leading-relaxed text-kiosk-text">
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

// ── Iconografía SVG inline (sin dependencias externas) ─────────────────────
export const MicIcon = () => (
    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
    </svg>
);
export const StopIcon = () => (<svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>);
export const SendIcon = () => (
    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
);
export const SpeakerIcon = () => (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
);
export const DocIcon = () => (
    <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="14" y2="17" />
    </svg>
);
export const InfoIcon = () => (
    <svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
    </svg>
);
export const ClipIcon = () => (
    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
);
export const CopyIcon = () => (
    <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
);
export const ChevronRightIcon = () => (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" /></svg>
);
export const ArrowLeftIcon = () => (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
);

/** Tarjeta de pregunta frecuente — panel de inicio, vista FAQ y modal "Ver todas". */
export const FaqCard = ({ faq, featured, onPick, disabled }) => {
    const c = CAT[faq.theme];
    return (
        <button
            onClick={() => onPick(faq.q)}
            disabled={disabled}
            className="group relative bg-kiosk-card border border-kiosk-border rounded-2xl p-4 flex items-start gap-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] disabled:opacity-60 disabled:pointer-events-none"
        >
            <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-transform group-hover:rotate-6 group-hover:scale-105" style={{ background: c.fill, color: c.color }}>
                <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">{ICONS[faq.icon]}</svg>
            </div>
            <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium uppercase tracking-wider mb-1 pr-16" style={{ color: c.color }}>{faq.cat}</div>
                <div className="text-[14px] text-kiosk-text leading-snug mb-2.5">{faq.q}</div>
                {faq.freq > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-kiosk-panel text-kiosk-muted">
                        <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                        {faq.freq} consultas
                    </span>
                )}
            </div>
            {featured && <span className="absolute top-3 right-3 bg-kiosk-accent text-white text-[10px] font-medium px-2 py-0.5 rounded-full tracking-wide">⭐ Popular</span>}
        </button>
    );
};

/** Copia al portapapeles; en kiosco por HTTP (sin clipboard API) usa execCommand. */
export const copyToClipboard = async (text) => {
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

/** Barra de navegación superior reutilizada por todas las vistas secundarias. */
export const ViewTopBar = ({ title, onHome, action }) => (
    <div className="px-6 py-4 border-b border-kiosk-border flex items-center justify-between bg-kiosk-card shadow-sm shrink-0">
        <button
            onClick={onHome}
            className="bg-kiosk-panel hover:bg-kiosk-card-hover text-kiosk-text px-4 py-2 rounded-xl border border-kiosk-border text-sm font-medium flex items-center space-x-2 transition-colors shadow-sm"
        >
            <span className="text-kiosk-accent"><ArrowLeftIcon /></span>
            <span>Inicio</span>
        </button>
        <h3 className="font-bold text-kiosk-text text-sm md:text-base text-center flex-1 px-4 truncate">{title}</h3>
        {action || <div className="w-24" />}
    </div>
);
