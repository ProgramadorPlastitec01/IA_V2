import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';

/* ────────────────────────────────────────────────────────────────────
   Iconos — SVG inline, trazo simple, sin emoji (sistema de diseño del
   Admin Dashboard 2026-10: Errores agrupados, Validación de Modelos IA,
   Huecos del Corpus).
   ──────────────────────────────────────────────────────────────────── */
const icon = (paths, size, props) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
        {paths}
    </svg>
);

export const ChevronRightIcon = ({ size = 16, ...p }) => icon(<path d="M9 18l6-6-6-6" />, size, p);
export const ChevronDownIcon = ({ size = 16, ...p }) => icon(<path d="M6 9l6 6 6-6" />, size, p);
export const CheckIcon = ({ size = 16, ...p }) => icon(<path d="M20 6L9 17l-5-5" />, size, p);
export const XIcon = ({ size = 16, ...p }) => icon(<><path d="M18 6L6 18" /><path d="M6 6l12 12" /></>, size, p);
export const PlayIcon = ({ size = 16, ...p }) => icon(<path d="M6 4l14 8-14 8V4z" />, size, p);
export const AlertTriangleIcon = ({ size = 16, ...p }) => icon(<><path d="M10.3 3.6L1.8 18a1.8 1.8 0 0 0 1.5 2.7h17.4a1.8 1.8 0 0 0 1.5-2.7L13.7 3.6a1.8 1.8 0 0 0-3.4 0z" /><path d="M12 9v4" /><path d="M12 16.5v.01" /></>, size, p);
export const FlaskIcon = ({ size = 16, ...p }) => icon(<><path d="M9 2h6" /><path d="M10 2v6.3a2 2 0 0 1-.4 1.2L4.5 17a2 2 0 0 0 1.6 3.2h11.8a2 2 0 0 0 1.6-3.2l-5.1-7.5a2 2 0 0 1-.4-1.2V2" /><path d="M7 15h10" /></>, size, p);
export const DatabaseIcon = ({ size = 16, ...p }) => icon(<><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>, size, p);
export const SlidersIcon = ({ size = 16, ...p }) => icon(<><path d="M4 21v-7" /><path d="M4 10V3" /><path d="M12 21v-9" /><path d="M12 8V3" /><path d="M20 21v-5" /><path d="M20 12V3" /><circle cx="4" cy="12" r="2" /><circle cx="12" cy="10" r="2" /><circle cx="20" cy="14" r="2" /></>, size, p);
export const ArrowRightIcon = ({ size = 16, ...p }) => icon(<><path d="M5 12h14" /><path d="M12 5l7 7-7 7" /></>, size, p);
export const ClockIcon = ({ size = 16, ...p }) => icon(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></>, size, p);
export const FileSearchIcon = ({ size = 16, ...p }) => icon(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8.5" /><path d="M14 2v6h6" /><circle cx="15" cy="17" r="3" /><path d="M20 20l-1.5-1.5" /></>, size, p);
export const DownloadIcon = ({ size = 16, ...p }) => icon(<><path d="M12 3v12" /><path d="M7 11l5 5 5-5" /><path d="M5 21h14" /></>, size, p);
export const BookIcon = ({ size = 16, ...p }) => icon(<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>, size, p);
export const ZapIcon = ({ size = 16, ...p }) => icon(<path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" fill="currentColor" stroke="none" />, size, p);

/* ────────────────────────────────────────────────────────────────────
   Badges / pills
   ──────────────────────────────────────────────────────────────────── */
const TONE_CLASSES = {
    success: 'bg-admin-success-soft text-admin-success border-admin-success/20',
    warning: 'bg-admin-warning-soft text-admin-warning border-admin-warning/20',
    error: 'bg-admin-error-soft text-admin-error border-admin-error/20',
    accent: 'bg-admin-accent-soft text-admin-accent border-admin-accent/20',
    neutral: 'bg-admin-bg text-admin-muted border-admin-border',
};

export const Badge = ({ tone = 'neutral', children, className = '' }) => (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border ${TONE_CLASSES[tone]} ${className}`}>
        {children}
    </span>
);

export const NewBadge = () => (
    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold tracking-wide bg-admin-accent text-white">NUEVO</span>
);

/* ────────────────────────────────────────────────────────────────────
   Card — contenedor base reutilizado por las 3 pestañas
   ──────────────────────────────────────────────────────────────────── */
export const Card = ({ children, className = '' }) => (
    <div className={`bg-admin-card border border-admin-border rounded-xl ${className}`}>{children}</div>
);

/* ────────────────────────────────────────────────────────────────────
   ConfirmModal — para toda acción sensible (promover modelo, agregar
   término al glosario, resolver/ignorar en bloque).
   ──────────────────────────────────────────────────────────────────── */
export const ConfirmModal = ({ open, title, body, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', tone = 'accent', onConfirm, onCancel, busy = false }) => {
    const confirmCls = tone === 'error'
        ? 'bg-admin-error hover:opacity-90 text-white'
        : 'bg-admin-accent hover:opacity-90 text-white';
    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm font-admin-sans"
                    onClick={onCancel}
                >
                    <motion.div
                        initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
                        className="bg-admin-card border border-admin-border rounded-xl p-6 max-w-sm w-full shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start gap-3 mb-2">
                            <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${tone === 'error' ? 'bg-admin-error-soft text-admin-error' : 'bg-admin-accent-soft text-admin-accent'}`}>
                                <AlertTriangleIcon size={18} />
                            </div>
                            <h3 className="text-sm font-semibold text-admin-ink pt-1.5">{title}</h3>
                        </div>
                        <p className="text-[13px] text-admin-muted mb-5 ml-12">{body}</p>
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={onCancel} disabled={busy}
                                className="py-2.5 bg-admin-bg hover:bg-admin-border/50 border border-admin-border rounded-lg text-admin-ink text-sm font-medium transition-colors disabled:opacity-50">
                                {cancelLabel}
                            </button>
                            <button onClick={onConfirm} disabled={busy}
                                className={`py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${confirmCls}`}>
                                {busy ? 'Procesando…' : confirmLabel}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

/* ────────────────────────────────────────────────────────────────────
   StatCard — 4 métricas lado a lado (Validación de Modelos IA)
   ──────────────────────────────────────────────────────────────────── */
export const StatCard = ({ label, current, candidate, betterWhen = 'lower', format = (v) => v }) => {
    let candidateTone = 'neutral';
    if (candidate !== undefined && candidate !== null && current !== undefined && current !== null) {
        const improved = betterWhen === 'lower' ? candidate < current : candidate > current;
        const worsened = betterWhen === 'lower' ? candidate > current : candidate < current;
        if (improved) candidateTone = 'success';
        else if (worsened) candidateTone = 'warning';
    }
    return (
        <Card className="p-4">
            <div className="text-[11px] uppercase tracking-wide text-admin-faint mb-2 font-medium">{label}</div>
            <div className="text-2xl font-semibold text-admin-ink font-admin-mono">{format(current)}</div>
            <div className="text-[10px] text-admin-faint mt-0.5">actual</div>
            {candidate !== undefined && candidate !== null && (
                <>
                    <div className={`text-base font-medium font-admin-mono mt-1.5 ${candidateTone === 'success' ? 'text-admin-success' : candidateTone === 'warning' ? 'text-admin-warning' : 'text-admin-muted'}`}>
                        {format(candidate)}
                    </div>
                    <div className="text-[10px] text-admin-faint">candidato</div>
                </>
            )}
        </Card>
    );
};

/* Pill de filtro (Todos/Pendientes/Resueltos, etc.) */
export const FilterPill = ({ active, onClick, children }) => (
    <button
        onClick={onClick}
        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${active ? 'bg-admin-accent text-white border-admin-accent' : 'bg-admin-card border-admin-border text-admin-muted hover:bg-admin-bg'}`}
    >
        {children}
    </button>
);

export const VerdictBadge = ({ verdict }) => {
    if (verdict === 'Mejora el candidato') return <Badge tone="success">Mejora el candidato</Badge>;
    if (verdict === 'Revisar latencia') return <Badge tone="warning">Revisar latencia</Badge>;
    return <Badge tone="neutral">Empate</Badge>;
};
