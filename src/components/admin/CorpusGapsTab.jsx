import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { API_BASE_URL } from '../../utils/apiConfig';
import { Card, Badge, ConfirmModal, ChevronDownIcon, ChevronRightIcon, BookIcon, XIcon } from './AdminUI';

const RANGE_OPTIONS = [
    { value: '7', label: 'Últimos 7 días' },
    { value: '30', label: 'Últimos 30 días' },
    { value: '90', label: 'Últimos 90 días' },
];

const CorpusGapsTab = () => {
    const [threshold, setThreshold] = useState(0.6);
    const [days, setDays] = useState('30');
    const [data, setData] = useState({ gaps: [], slangTermsUncovered: [], summary: {} });
    const [loading, setLoading] = useState(true);
    const [expandedVariants, setExpandedVariants] = useState(new Set());
    const [confirmGlossary, setConfirmGlossary] = useState(null); // gap object or null
    const [addingGlossary, setAddingGlossary] = useState(false);
    const [markedRechunk, setMarkedRechunk] = useState(new Set());
    const [addedGlossary, setAddedGlossary] = useState(new Set());
    const [showGlossaryModal, setShowGlossaryModal] = useState(false);
    const [fullGlossary, setFullGlossary] = useState([]);

    const fetchGaps = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/analytics/corpus-gaps?threshold=${threshold}&days=${days}`);
            const json = await res.json();
            setData(json);
        } catch (err) {
            console.error('Error fetching corpus gaps:', err);
        } finally {
            setLoading(false);
        }
    }, [threshold, days]);

    useEffect(() => { fetchGaps(); }, [fetchGaps]);

    const toggleVariants = (question) => {
        setExpandedVariants(prev => {
            const next = new Set(prev);
            next.has(question) ? next.delete(question) : next.add(question);
            return next;
        });
    };

    const markRechunk = async (gap) => {
        try {
            await fetch(`${API_BASE_URL}/api/corpus-gaps/mark-rechunk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: gap.question }),
            });
            setMarkedRechunk(prev => new Set(prev).add(gap.question));
        } catch (err) {
            console.error('Error marking for rechunk:', err);
        }
    };

    const confirmAddGlossary = async () => {
        if (!confirmGlossary) return;
        setAddingGlossary(true);
        try {
            const { cause } = confirmGlossary;
            const res = await fetch(`${API_BASE_URL}/api/glosario/add-term`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ palabra: cause.term, significado: cause.significado || cause.term, ejemplo: confirmGlossary.question }),
            });
            if (res.ok) setAddedGlossary(prev => new Set(prev).add(confirmGlossary.question));
        } catch (err) {
            console.error('Error adding glossary term:', err);
        } finally {
            setAddingGlossary(false);
            setConfirmGlossary(null);
        }
    };

    const openFullGlossary = async () => {
        setShowGlossaryModal(true);
        if (fullGlossary.length === 0) {
            try {
                const res = await fetch(`${API_BASE_URL}/api/glosario/terms`);
                const json = await res.json();
                setFullGlossary(json.terms || []);
            } catch (err) {
                console.error('Error loading full glossary:', err);
            }
        }
    };

    const { summary = {} } = data;

    return (
        <div className="flex-grow overflow-auto custom-scrollbar font-admin-sans pb-6">
            <div className="mb-5">
                <h2 className="text-lg font-semibold text-admin-ink">Huecos del corpus</h2>
                <p className="text-xs text-admin-muted mt-0.5">Consultas con confidence bajo umbral o estado INSUFFICIENT_CONTEXT, agrupadas por similitud</p>
            </div>

            <Card className="p-4 mb-5">
                <div className="flex flex-wrap items-center gap-6">
                    <div className="flex-grow min-w-[240px]">
                        <label className="block text-[11px] uppercase text-admin-faint font-medium mb-2">
                            Umbral de confianza: <span className="font-admin-mono text-admin-ink">&lt; {threshold.toFixed(2)}</span>
                        </label>
                        <input
                            type="range" min="0" max="1" step="0.05" value={threshold}
                            onChange={(e) => setThreshold(parseFloat(e.target.value))}
                            className="w-full accent-[#3D3A8C]"
                        />
                    </div>
                    <select
                        value={days}
                        onChange={(e) => setDays(e.target.value)}
                        className="px-3 py-1.5 rounded-lg text-xs border border-admin-border bg-admin-card text-admin-ink"
                    >
                        {RANGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </div>
            </Card>

            <div className="flex flex-wrap gap-5" style={{ alignItems: 'flex-start' }}>
                {/* Columna principal */}
                <div className="space-y-3" style={{ flex: '999 1 760px', minWidth: '320px' }}>
                    {loading ? (
                        <div className="text-center py-16 text-admin-faint text-sm">Cargando…</div>
                    ) : data.gaps.length === 0 ? (
                        <div className="text-center py-16 text-admin-faint italic text-sm">No hay huecos del corpus para este filtro.</div>
                    ) : (
                        data.gaps.map(gap => {
                            const isExpanded = expandedVariants.has(gap.question);
                            const isRechunkMarked = markedRechunk.has(gap.question);
                            const isGlossaryAdded = addedGlossary.has(gap.question);
                            return (
                                <Card key={gap.question} className="p-4">
                                    <div className="flex items-start justify-between gap-3 mb-1.5">
                                        <h3 className="text-sm font-medium text-admin-ink">"{gap.question}"</h3>
                                        {gap.confidence !== null ? (
                                            <Badge tone="error" className="flex-shrink-0">confidence {gap.confidence.toFixed(2)}</Badge>
                                        ) : (
                                            <Badge tone="error" className="flex-shrink-0">{gap.statusLabel}</Badge>
                                        )}
                                    </div>
                                    <p className="text-[11px] text-admin-faint mb-3">
                                        {gap.variantCount} variante{gap.variantCount !== 1 ? 's' : ''} similar{gap.variantCount !== 1 ? 'es' : ''} · último intento {new Date(gap.lastAttempt).toLocaleString()}
                                    </p>

                                    {gap.cause.label && (
                                        <div className="mb-3">
                                            <Badge tone={gap.cause.kind === 'slang_uncovered' ? 'warning' : 'accent'}>{gap.cause.label}</Badge>
                                        </div>
                                    )}

                                    <div className="flex flex-wrap items-center gap-2">
                                        {gap.cause.kind === 'slang_uncovered' && (
                                            isGlossaryAdded ? (
                                                <Badge tone="success">Agregado al glosario</Badge>
                                            ) : (
                                                <button
                                                    onClick={() => setConfirmGlossary(gap)}
                                                    className="px-3 py-1.5 bg-admin-accent hover:opacity-90 text-white rounded-lg text-xs font-medium transition-opacity"
                                                >
                                                    Agregar al glosario
                                                </button>
                                            )
                                        )}
                                        {gap.cause.kind === 'long_question' && (
                                            isRechunkMarked ? (
                                                <Badge tone="success">Marcado para re-chunking</Badge>
                                            ) : (
                                                <button
                                                    onClick={() => markRechunk(gap)}
                                                    className="px-3 py-1.5 bg-admin-ink hover:opacity-90 text-white rounded-lg text-xs font-medium transition-opacity"
                                                >
                                                    Marcar para re-chunking
                                                </button>
                                            )
                                        )}
                                        {gap.variantCount > 1 && (
                                            <button
                                                onClick={() => toggleVariants(gap.question)}
                                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-admin-card border border-admin-border rounded-lg text-xs font-medium text-admin-muted hover:bg-admin-bg transition-colors"
                                            >
                                                {isExpanded ? <ChevronDownIcon size={13} /> : <ChevronRightIcon size={13} />}
                                                Ver variantes ({gap.variantCount})
                                            </button>
                                        )}
                                    </div>

                                    <AnimatePresence>
                                        {isExpanded && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                                className="overflow-hidden"
                                            >
                                                <div className="mt-3 pt-3 border-t border-admin-border space-y-1.5">
                                                    {gap.variants.map((v, i) => (
                                                        <div key={i} className="text-[11px] text-admin-muted flex items-center gap-2">
                                                            <span className="font-admin-mono w-36 flex-shrink-0 tabular-nums">{new Date(v.timestamp).toLocaleString()}</span>
                                                            <span className="truncate">"{v.question}"</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </Card>
                            );
                        })
                    )}
                </div>

                {/* Panel lateral */}
                <div className="space-y-4" style={{ flex: '1 1 300px', maxWidth: '340px', minWidth: '260px' }}>
                    <Card className="p-4">
                        <h3 className="text-sm font-semibold text-admin-ink mb-3">Términos de jerga sin cobertura</h3>
                        {data.slangTermsUncovered.length === 0 ? (
                            <p className="text-xs text-admin-faint italic">Sin hallazgos en este período.</p>
                        ) : (
                            <ul className="space-y-2 mb-3">
                                {data.slangTermsUncovered.map(t => (
                                    <li key={t.term} className="flex items-center justify-between text-xs">
                                        <span className="font-admin-mono text-admin-ink">{t.term}</span>
                                        <span className="text-admin-error">{t.fails} fallo{t.fails !== 1 ? 's' : ''}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <button onClick={openFullGlossary} className="text-xs font-medium text-admin-accent hover:underline">
                            Ir al glosario completo →
                        </button>
                    </Card>

                    <Card className="p-4">
                        <h3 className="text-sm font-semibold text-admin-ink mb-3">Resumen del período</h3>
                        <dl className="space-y-2 text-xs">
                            <div className="flex justify-between"><dt className="text-admin-muted">Consultas totales</dt><dd className="font-admin-mono text-admin-ink">{summary.totalQueries ?? 0}</dd></div>
                            <div className="flex justify-between"><dt className="text-admin-muted">Bajo umbral</dt><dd className="font-admin-mono text-admin-ink">{summary.belowThreshold ?? 0} ({summary.belowThresholdPct ?? 0}%)</dd></div>
                            <div className="flex justify-between"><dt className="text-admin-muted">Por jerga sin cobertura</dt><dd className="font-admin-mono text-admin-ink">{summary.bySlang ?? 0}</dd></div>
                            <div className="flex justify-between"><dt className="text-admin-muted">Por falta de chunking</dt><dd className="font-admin-mono text-admin-ink">{summary.byChunking ?? 0}</dd></div>
                        </dl>
                    </Card>
                </div>
            </div>

            <ConfirmModal
                open={confirmGlossary !== null}
                title="¿Agregar término al glosario?"
                body={confirmGlossary ? `Se agregará "${confirmGlossary.cause.term}" (${confirmGlossary.cause.significado}) a config/glosario_jerga_colombiana.json.` : ''}
                confirmLabel="Agregar"
                busy={addingGlossary}
                onConfirm={confirmAddGlossary}
                onCancel={() => setConfirmGlossary(null)}
            />

            <AnimatePresence>
                {showGlossaryModal && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm font-admin-sans"
                        onClick={() => setShowGlossaryModal(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
                            className="bg-admin-card border border-admin-border rounded-xl p-6 max-w-md w-full max-h-[70vh] flex flex-col shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-semibold text-admin-ink flex items-center gap-2"><BookIcon size={16} /> Glosario completo</h3>
                                <button onClick={() => setShowGlossaryModal(false)} className="text-admin-faint hover:text-admin-ink" aria-label="Cerrar">
                                    <XIcon size={18} />
                                </button>
                            </div>
                            <div className="overflow-y-auto custom-scrollbar space-y-2 pr-1">
                                {fullGlossary.length === 0 ? (
                                    <p className="text-xs text-admin-faint">Cargando…</p>
                                ) : fullGlossary.map(t => (
                                    <div key={t.display} className="flex justify-between gap-3 text-xs py-1.5 border-b border-admin-border last:border-0">
                                        <span className="font-admin-mono text-admin-ink flex-shrink-0">{t.display}</span>
                                        <span className="text-admin-muted text-right">{t.significado}</span>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default CorpusGapsTab;
