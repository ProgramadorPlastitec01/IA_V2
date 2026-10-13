import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { API_BASE_URL } from '../../utils/apiConfig';
import { Card, Badge, FilterPill, ConfirmModal, ChevronRightIcon, ChevronDownIcon, ArrowRightIcon } from './AdminUI';

const RANGE_OPTIONS = [
    { value: 'all', label: 'Todos los períodos' },
    { value: '1', label: 'Últimas 24 horas' },
    { value: '7', label: 'Últimos 7 días' },
    { value: '30', label: 'Últimos 30 días' },
];

const STATUS_BADGE = {
    resolved: <Badge tone="success">Resuelto</Badge>,
    ignored: <Badge tone="neutral">Ignorado</Badge>,
    pending: <Badge tone="warning">Pendiente</Badge>,
};

const SystemErrorsTab = ({ onNavigateToCorpusGaps }) => {
    const [groups, setGroups] = useState([]);
    const [totals, setTotals] = useState({ totalEvents: 0, totalGroups: 0 });
    const [statusFilter, setStatusFilter] = useState('all'); // all | pending | resolved
    const [rangeFilter, setRangeFilter] = useState('all');
    const [expanded, setExpanded] = useState(new Set());
    const [selected, setSelected] = useState(new Set());
    const [confirmAction, setConfirmAction] = useState(null); // 'resolve' | 'ignore' | null
    const [busy, setBusy] = useState(false);

    const fetchGrouped = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/system-errors/grouped`);
            const data = await res.json();
            if (data.groups) {
                setGroups(data.groups);
                setTotals({ totalEvents: data.totalEvents, totalGroups: data.totalGroups });
            }
        } catch (err) {
            console.error('Error fetching grouped system errors:', err);
        }
    };

    useEffect(() => {
        fetchGrouped();
        const interval = setInterval(fetchGrouped, 10000);
        return () => clearInterval(interval);
    }, []);

    const visibleGroups = useMemo(() => {
        const cutoff = rangeFilter === 'all' ? null : Date.now() - parseInt(rangeFilter) * 24 * 60 * 60 * 1000;
        return groups.filter(g => {
            if (statusFilter !== 'all' && g.status !== statusFilter) return false;
            if (cutoff && new Date(g.lastTimestamp).getTime() < cutoff) return false;
            return true;
        });
    }, [groups, statusFilter, rangeFilter]);

    const toggleExpanded = (fp) => {
        setExpanded(prev => {
            const next = new Set(prev);
            next.has(fp) ? next.delete(fp) : next.add(fp);
            return next;
        });
    };

    const toggleSelected = (fp) => {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(fp) ? next.delete(fp) : next.add(fp);
            return next;
        });
    };

    const selectedGroups = groups.filter(g => selected.has(g.fingerprint));
    const selectedEventCount = selectedGroups.reduce((s, g) => s + g.count, 0);

    const runBulkAction = async (status) => {
        setBusy(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/system-errors/resolve-bulk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fingerprints: Array.from(selected), status }),
            });
            if (res.ok) {
                setSelected(new Set());
                await fetchGrouped();
            }
        } catch (err) {
            console.error('Error applying bulk action:', err);
        } finally {
            setBusy(false);
            setConfirmAction(null);
        }
    };

    const exportCsv = () => {
        const rows = [['fingerprint', 'title', 'count', 'status', 'platforms', 'lastTimestamp']];
        selectedGroups.forEach(g => rows.push([g.fingerprint, g.title, g.count, g.status, g.platforms.join('|'), g.lastTimestamp]));
        const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `system-errors-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="flex-grow flex flex-col overflow-hidden font-admin-sans">
            <div className="mb-4">
                <h2 className="text-lg font-semibold text-admin-ink">System Error Log — vista agrupada</h2>
                <p className="text-xs text-admin-muted mt-0.5">
                    {totals.totalEvents} eventos · agrupados en {totals.totalGroups} tipos de error
                </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex gap-2">
                    <FilterPill active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>Todos</FilterPill>
                    <FilterPill active={statusFilter === 'pending'} onClick={() => setStatusFilter('pending')}>Pendientes</FilterPill>
                    <FilterPill active={statusFilter === 'resolved'} onClick={() => setStatusFilter('resolved')}>Resueltos</FilterPill>
                </div>
                <select
                    value={rangeFilter}
                    onChange={(e) => setRangeFilter(e.target.value)}
                    className="px-3 py-1.5 rounded-lg text-xs border border-admin-border bg-admin-card text-admin-ink"
                >
                    {RANGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
            </div>

            <AnimatePresence>
                {selected.size > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                        className="flex items-center justify-between gap-3 bg-admin-ink text-white rounded-xl px-4 py-3 mb-4"
                    >
                        <span className="text-sm">
                            {selected.size} grupo{selected.size !== 1 ? 's' : ''} seleccionado{selected.size !== 1 ? 's' : ''} · {selectedEventCount} evento{selectedEventCount !== 1 ? 's' : ''}
                        </span>
                        <div className="flex gap-2">
                            <button onClick={() => setConfirmAction('resolve')} className="px-3 py-1.5 bg-white text-admin-ink rounded-lg text-xs font-medium hover:bg-admin-bg transition-colors">
                                Resolver seleccionados
                            </button>
                            <button onClick={() => setConfirmAction('ignore')} className="px-3 py-1.5 bg-white/10 border border-white/30 rounded-lg text-xs font-medium hover:bg-white/20 transition-colors">
                                Ignorar
                            </button>
                            <button onClick={exportCsv} className="px-3 py-1.5 bg-white/10 border border-white/30 rounded-lg text-xs font-medium hover:bg-white/20 transition-colors">
                                Exportar CSV
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="flex-grow overflow-auto custom-scrollbar space-y-3 pb-4">
                {visibleGroups.length === 0 ? (
                    <div className="text-center py-20 text-admin-faint italic text-sm">No hay errores que coincidan con el filtro.</div>
                ) : (
                    visibleGroups.map(g => {
                        const isExpanded = expanded.has(g.fingerprint);
                        const isSelected = selected.has(g.fingerprint);
                        return (
                            <Card key={g.fingerprint} className="overflow-hidden">
                                <div className="p-4 flex items-start gap-3">
                                    {g.readOnly ? (
                                        <div className="mt-1 w-4 h-4 flex-shrink-0" />
                                    ) : (
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => toggleSelected(g.fingerprint)}
                                            className="mt-1 w-4 h-4 accent-[#3D3A8C] flex-shrink-0"
                                            aria-label={`Seleccionar grupo ${g.title}`}
                                        />
                                    )}
                                    <button onClick={() => toggleExpanded(g.fingerprint)} className="mt-1 text-admin-faint hover:text-admin-ink flex-shrink-0" aria-label={isExpanded ? 'Colapsar' : 'Expandir'}>
                                        {isExpanded ? <ChevronDownIcon size={16} /> : <ChevronRightIcon size={16} />}
                                    </button>
                                    <div className="flex-grow min-w-0">
                                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                            <span className="font-admin-mono text-sm text-admin-ink truncate">{g.title}</span>
                                            <Badge tone="neutral">× {g.count} ocurrencias</Badge>
                                            {STATUS_BADGE[g.status]}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            {g.platforms.filter(p => p !== 'Desconocido').map(p => (
                                                <span key={p} className="px-2 py-0.5 rounded text-[10px] bg-admin-bg border border-admin-border text-admin-muted">{p}</span>
                                            ))}
                                            <span className="text-[11px] text-admin-faint">último: {new Date(g.lastTimestamp).toLocaleString()}</span>
                                        </div>
                                        {g.isInsufficientContext && (
                                            <button
                                                onClick={onNavigateToCorpusGaps}
                                                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-admin-accent hover:underline"
                                            >
                                                Ver en Huecos del Corpus <ArrowRightIcon size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <AnimatePresence>
                                    {isExpanded && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                            className="border-t border-admin-border bg-admin-bg overflow-hidden"
                                        >
                                            <div className="px-4 py-2 pl-14 space-y-1.5">
                                                {g.occurrences.map(o => (
                                                    <div key={o.id} className="flex items-center gap-3 text-[11px] text-admin-muted py-1">
                                                        <span className="font-admin-mono tabular-nums w-40 flex-shrink-0">{new Date(o.timestamp).toLocaleString()}</span>
                                                        {g.readOnly ? (
                                                            <span className="truncate">"{o.message}"</span>
                                                        ) : (
                                                            <>
                                                                <span className="px-1.5 py-0.5 rounded bg-admin-card border border-admin-border">{o.os} · {o.browser}</span>
                                                                {STATUS_BADGE[o.status] || null}
                                                            </>
                                                        )}
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

            <ConfirmModal
                open={confirmAction !== null}
                title={confirmAction === 'resolve' ? '¿Resolver los grupos seleccionados?' : '¿Ignorar los grupos seleccionados?'}
                body={`Esto marcará ${selectedEventCount} evento(s) en ${selected.size} grupo(s) como ${confirmAction === 'resolve' ? 'resueltos' : 'ignorados'}.`}
                confirmLabel={confirmAction === 'resolve' ? 'Resolver' : 'Ignorar'}
                busy={busy}
                onConfirm={() => runBulkAction(confirmAction === 'resolve' ? 'resolved' : 'ignored')}
                onCancel={() => setConfirmAction(null)}
            />
        </div>
    );
};

export default SystemErrorsTab;
