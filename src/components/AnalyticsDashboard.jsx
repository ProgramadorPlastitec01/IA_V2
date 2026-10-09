import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { API_BASE_URL } from '../utils/apiConfig';
import SystemStatus from './SystemStatus';

const AnalyticsDashboard = ({ onClose }) => {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ total: 0, remote: 0, local: 0, savedTime: 0 });
    const [systemErrors, setSystemErrors] = useState([]);
    const [suggestions, setSuggestions] = useState([]);
    const [ratingStats, setRatingStats] = useState({ totals: [], recent: [] });
    const [activeTab, setActiveTab] = useState('analytics'); // 'analytics' | 'system' | 'errors' | 'feedback'
    const [errorFilter, setErrorFilter] = useState('all'); // 'all' | 'Mic'
    const [suggestionTypeFilter, setSuggestionTypeFilter] = useState('all');

    const fetchAnalytics = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/analytics`);
            const data = await res.json();
            if (data.events) {
                processEvents(data.events);
            }
        } catch (err) {
            console.error('Error fetching stats:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchSystemErrors = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/system-errors`);
            const data = await res.json();
            if (data.errors) setSystemErrors(data.errors);
        } catch (err) {
            console.error('Error fetching system errors:', err);
        }
    };

    const fetchSuggestions = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/suggestions?limit=200`);
            const data = await res.json();
            if (data.suggestions) setSuggestions(data.suggestions);
        } catch (err) {
            console.error('Error fetching suggestions:', err);
        }
    };

    const fetchRatingStats = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/rate-answer/stats?limit=200`);
            const data = await res.json();
            if (data.totals) setRatingStats(data);
        } catch (err) {
            console.error('Error fetching rating stats:', err);
        }
    };

    const resolveError = async (id) => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/system-errors/resolve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });
            if (res.ok) fetchSystemErrors();
        } catch (err) {
            console.error('Error resolving error:', err);
        }
    };

    const processEvents = (rawEvents) => {
        setEvents(rawEvents);

        let remoteCount = 0;
        let localCount = 0;
        let savedTimeSeconds = 0;

        rawEvents.forEach(e => {
            if (e.type === 'RemoteQuery') {
                remoteCount++;
            } else if (e.type === 'LocalIntentResolved' || e.type === 'LocalCacheHit') {
                localCount++;
                // Estimamos que una consulta remota tarda 10s y una local 0.01s
                // Ahorro por cada local = ~9.99s
                savedTimeSeconds += 9.9;
            }
        });

        setStats({
            total: rawEvents.length,
            remote: remoteCount,
            local: localCount,
            savedTime: Math.round(savedTimeSeconds)
        });
    };

    useEffect(() => {
        fetchAnalytics();
        fetchSystemErrors();
        fetchSuggestions();
        fetchRatingStats();
        const interval = setInterval(() => {
            fetchAnalytics();
            fetchSystemErrors();
            fetchSuggestions();
            fetchRatingStats();
        }, 10000); // Auto-refresh cada 10s
        return () => clearInterval(interval);
    }, []);

    const getBadgeColor = (type) => {
        if (type === 'RemoteQuery') return 'bg-cat-purple-fill text-cat-purple border-cat-purple/30';
        if (type === 'LocalIntentResolved') return 'bg-cat-green-fill text-cat-green border-cat-green/30';
        if (type === 'LocalCacheHit') return 'bg-brand-light text-brand border-brand/30';
        return 'bg-surface text-muted border-line';
    };

    const getDeviceInfo = (ua) => {
        if (!ua) return 'Unknown Device';
        if (ua.includes('iPhone')) return '📱 iPhone';
        if (ua.includes('iPad')) return 'tablet iPad';
        if (ua.includes('Android')) return ua.includes('wv') ? '📱 Android (WV)' : '📱 Android';
        if (ua.includes('Windows')) return '💻 Windows';
        if (ua.includes('Macintosh')) return '💻 Mac';
        return '🖥️ Desktop/Other';
    };

    const SUGGESTION_TYPE_LABELS = {
        sugerencia: { label: '💡 Sugerencia', cls: 'bg-cat-amber-fill text-cat-amber border-cat-amber/30' },
        respuesta_incorrecta: { label: '⚠️ Resp. Incorrecta', cls: 'bg-cat-coral-fill text-cat-coral border-cat-coral/30' },
        falta_info: { label: '📄 Falta Info', cls: 'bg-cat-purple-fill text-cat-purple border-cat-purple/30' },
        felicitacion: { label: '😊 Felicitación', cls: 'bg-cat-green-fill text-cat-green border-cat-green/30' },
        otro: { label: '💬 Otro', cls: 'bg-surface text-muted border-line' },
    };
    const RATING_LABELS = { good: '😊 Buena', neutral: '😐 Más o menos', bad: '😞 No sirvió' };
    const ratingCount = (r) => ratingStats.totals.find(t => t.rating === r)?.count || 0;

    const getBrowserInfo = (ua) => {
        if (!ua) return '---';
        if (ua.includes('Edg/')) return 'Edge';
        if (ua.includes('Chrome/')) return 'Chrome';
        if (ua.includes('Safari/') && !ua.includes('Chrome/')) return 'Safari';
        if (ua.includes('Firefox/')) return 'Firefox';
        return 'Other';
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed inset-0 z-50 bg-bg-page flex flex-col p-6 overflow-hidden text-ink"
        >
            {/* Header */}
            <div className="flex justify-between items-center mb-6 border-b border-line pb-4">
                <div>
                    <h1 className="text-2xl font-medium text-brand">
                        ⚡ Admin Dashboard
                    </h1>
                    <p className="text-xs text-muted mt-1">System &amp; Analytics Console</p>
                </div>
                <button
                    onClick={onClose}
                    className="px-4 py-2 bg-bg-panel hover:bg-surface border border-line rounded-lg text-ink transition-colors"
                >
                    Cerrar [ESC]
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-4 mb-6">
                <button
                    onClick={() => setActiveTab('analytics')}
                    className={`px-6 py-3 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'analytics' ? 'bg-brand text-white shadow-[0_2px_12px_rgba(24,95,165,0.25)]' : 'bg-bg-panel border border-line text-muted hover:bg-surface'}`}
                >
                    📊 Estadísticas de Uso
                </button>
                <button
                    onClick={() => setActiveTab('system')}
                    className={`px-6 py-3 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'system' ? 'bg-cat-green text-white shadow-[0_2px_12px_rgba(15,110,86,0.25)]' : 'bg-bg-panel border border-line text-muted hover:bg-surface'}`}
                >
                    🖥️ Estado de Servicios
                </button>
                <button
                    onClick={() => setActiveTab('errors')}
                    className={`px-6 py-3 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'errors' ? 'bg-cat-coral text-white shadow-[0_2px_12px_rgba(153,60,29,0.25)]' : 'bg-bg-panel border border-line text-muted hover:bg-surface'}`}
                >
                    🚨 Errores del Sistema
                    {systemErrors.filter(e => e.status === 'pending').length > 0 && (
                        <span className="bg-cat-coral text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] animate-pulse">
                            {systemErrors.filter(e => e.status === 'pending').length}
                        </span>
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('feedback')}
                    className={`px-6 py-3 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'feedback' ? 'bg-cat-purple text-white shadow-[0_2px_12px_rgba(83,74,183,0.25)]' : 'bg-bg-panel border border-line text-muted hover:bg-surface'}`}
                >
                    💬 Buzón y Calificaciones
                    {suggestions.filter(s => s.status === 'nuevo').length > 0 && (
                        <span className="bg-cat-purple text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]">
                            {suggestions.filter(s => s.status === 'nuevo').length}
                        </span>
                    )}
                </button>
            </div>

            {/* Content Area */}
            <div className="flex-grow overflow-hidden flex flex-col">
                {activeTab === 'system' ? (
                    <SystemStatus />
                ) : activeTab === 'feedback' ? (
                    <div className="flex-grow overflow-auto custom-scrollbar space-y-8 pb-4">
                        {/* KPI de calificaciones */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-cat-green-fill border border-cat-green/20 p-4 rounded-xl">
                                <div className="text-cat-green text-xs uppercase mb-1">😊 Me sirvió</div>
                                <div className="text-3xl font-medium text-cat-green">{ratingCount('good')}</div>
                            </div>
                            <div className="bg-cat-amber-fill border border-cat-amber/20 p-4 rounded-xl">
                                <div className="text-cat-amber text-xs uppercase mb-1">😐 Más o menos</div>
                                <div className="text-3xl font-medium text-cat-amber">{ratingCount('neutral')}</div>
                            </div>
                            <div className="bg-cat-coral-fill border border-cat-coral/20 p-4 rounded-xl">
                                <div className="text-cat-coral text-xs uppercase mb-1">😞 No sirvió</div>
                                <div className="text-3xl font-medium text-cat-coral">{ratingCount('bad')}</div>
                            </div>
                        </div>

                        {/* Buzón de sugerencias */}
                        <div className="bg-bg-panel rounded-xl border border-line overflow-hidden flex flex-col">
                            <div className="px-6 py-4 border-b border-line bg-surface flex flex-wrap justify-between items-center gap-2">
                                <h3 className="text-sm font-medium text-ink">Buzón de Sugerencias ({suggestions.length})</h3>
                                <div className="flex gap-2 flex-wrap">
                                    <button
                                        onClick={() => setSuggestionTypeFilter('all')}
                                        className={`px-3 py-1 rounded text-[10px] border transition-all ${suggestionTypeFilter === 'all' ? 'bg-surface border-line text-ink' : 'border-transparent text-muted'}`}
                                    >
                                        Todos
                                    </button>
                                    {Object.entries(SUGGESTION_TYPE_LABELS).map(([key, v]) => (
                                        <button
                                            key={key}
                                            onClick={() => setSuggestionTypeFilter(key)}
                                            className={`px-3 py-1 rounded text-[10px] border transition-all ${suggestionTypeFilter === key ? v.cls : 'border-transparent text-muted'}`}
                                        >
                                            {v.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="overflow-auto p-4 space-y-3 custom-scrollbar max-h-[420px]">
                                {suggestions.length === 0 ? (
                                    <div className="text-center py-10 text-muted italic">Aún no hay mensajes en el buzón.</div>
                                ) : (
                                    suggestions
                                        .filter(s => suggestionTypeFilter === 'all' || s.type === suggestionTypeFilter)
                                        .map((s) => {
                                            const typeInfo = SUGGESTION_TYPE_LABELS[s.type] || SUGGESTION_TYPE_LABELS.otro;
                                            return (
                                                <motion.div
                                                    key={s.id}
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    className="p-4 rounded-xl border border-line bg-bg-page flex flex-col gap-2"
                                                >
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${typeInfo.cls}`}>{typeInfo.label}</span>
                                                        <span className="text-[10px] text-muted tabular-nums">{new Date(s.created_at).toLocaleString()}</span>
                                                    </div>
                                                    <p className="text-sm text-ink">{s.message}</p>
                                                    {(s.name || s.area) && (
                                                        <div className="flex gap-2 text-[10px] text-muted">
                                                            {s.name && <span>👤 {s.name}</span>}
                                                            {s.area && <span>🏭 {s.area}</span>}
                                                        </div>
                                                    )}
                                                </motion.div>
                                            );
                                        })
                                )}
                            </div>
                        </div>

                        {/* Respuestas calificadas recientemente */}
                        <div className="bg-bg-panel rounded-xl border border-line overflow-hidden flex flex-col">
                            <div className="px-6 py-4 border-b border-line bg-surface">
                                <h3 className="text-sm font-medium text-ink">Respuestas Calificadas Recientemente</h3>
                            </div>
                            <div className="overflow-auto p-4 space-y-3 custom-scrollbar max-h-[420px]">
                                {ratingStats.recent.length === 0 ? (
                                    <div className="text-center py-10 text-muted italic">Aún no hay respuestas calificadas.</div>
                                ) : (
                                    ratingStats.recent.map((r) => (
                                        <motion.div
                                            key={r.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className={`p-4 rounded-xl border flex flex-col gap-2 ${
                                                r.rating === 'bad' ? 'bg-cat-coral-fill border-cat-coral/20'
                                                : r.rating === 'neutral' ? 'bg-cat-amber-fill border-cat-amber/20'
                                                : 'bg-cat-green-fill border-cat-green/20'
                                            }`}
                                        >
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <span className="text-xs font-medium text-ink">{RATING_LABELS[r.rating] || r.rating}</span>
                                                <span className="text-[10px] text-muted tabular-nums">{new Date(r.created_at).toLocaleString()}</span>
                                            </div>
                                            <p className="text-sm text-ink font-medium">"{r.question}"</p>
                                            {r.answer && <p className="text-xs text-muted line-clamp-3">{r.answer}</p>}
                                            {r.sources?.length > 0 && (
                                                <p className="text-[10px] text-muted">📎 {r.sources.join(' · ')}</p>
                                            )}
                                        </motion.div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                ) : activeTab === 'errors' ? (
                    <div className="flex-grow flex flex-col overflow-hidden">
                        <div className="bg-bg-panel rounded-xl border border-line overflow-hidden flex flex-col flex-grow">
                            <div className="px-6 py-4 border-b border-line bg-surface flex justify-between items-center">
                                <h3 className="text-sm font-medium text-ink">System Error Log</h3>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setErrorFilter('all')}
                                        className={`px-3 py-1 rounded text-[10px] border transition-all ${errorFilter === 'all' ? 'bg-surface border-line text-ink' : 'border-transparent text-muted'}`}
                                    >
                                        Todos
                                    </button>
                                    <button
                                        onClick={() => setErrorFilter('Mic')}
                                        className={`px-3 py-1 rounded text-[10px] border transition-all ${errorFilter === 'Mic' ? 'bg-cat-amber-fill border-cat-amber/40 text-cat-amber' : 'border-transparent text-muted'}`}
                                    >
                                        🎙️ Mic Errs
                                    </button>
                                </div>
                            </div>
                            <div className="overflow-auto p-4 space-y-3 custom-scrollbar">
                                {systemErrors.length === 0 ? (
                                    <div className="text-center py-20 text-muted italic">No se han registrado errores aún.</div>
                                ) : (
                                    systemErrors
                                        .filter(err => errorFilter === 'all' || err.type === errorFilter)
                                        .map((err) => (
                                            <motion.div
                                                key={err.id}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className={`p-4 rounded-xl border ${err.status === 'resolved' ? 'bg-cat-green-fill border-cat-green/20 opacity-70' : 'bg-cat-coral-fill border-cat-coral/20'} flex flex-col md:flex-row gap-4`}
                                            >
                                                <div className="flex-shrink-0 w-32">
                                                    <div className="text-[10px] text-muted mb-1 tabular-nums">{new Date(err.timestamp).toLocaleString()}</div>
                                                    <span className={`px-2 py-0.5 rounded text-[8px] font-medium uppercase ${err.type === 'Mic' ? 'bg-cat-amber-fill text-cat-amber' : 'bg-cat-coral-fill text-cat-coral'}`}>
                                                        {err.type}
                                                    </span>
                                                </div>
                                                <div className="flex-grow">
                                                    <div className="text-xs font-medium text-ink mb-1">[{err.module}] {err.message}</div>

                                                    <div className="flex flex-wrap gap-2 mb-2">
                                                        <div className="px-1.5 py-0.5 bg-surface rounded text-[9px] text-muted border border-line">
                                                            {getDeviceInfo(err.details?.userAgent)}
                                                        </div>
                                                        <div className="px-1.5 py-0.5 bg-surface rounded text-[9px] text-muted border border-line">
                                                            🌐 {getBrowserInfo(err.details?.userAgent)}
                                                        </div>
                                                        {err.details?.phase && (
                                                            <div className="px-1.5 py-0.5 bg-brand-light rounded text-[9px] text-brand border border-brand/20">
                                                                Phase: {err.details.phase}
                                                            </div>
                                                        )}
                                                        {err.details?.isSecure === false && (
                                                            <div className="px-1.5 py-0.5 bg-cat-coral-fill rounded text-[9px] text-cat-coral font-medium border border-cat-coral/20">
                                                                ⚠️ INSECURE CONTEXT
                                                            </div>
                                                        )}
                                                    </div>

                                                    {err.stack && (
                                                        <pre className="text-[9px] text-muted bg-surface p-2 rounded overflow-x-auto font-mono whitespace-pre-wrap border border-line">
                                                            {err.stack}
                                                        </pre>
                                                    )}
                                                </div>
                                                <div className="flex-shrink-0 flex items-center justify-end">
                                                    {err.status === 'pending' ? (
                                                        <button
                                                            onClick={() => resolveError(err.id)}
                                                            className="px-4 py-2 bg-cat-green-fill hover:bg-cat-green hover:text-white border border-cat-green/30 rounded-lg text-cat-green text-[10px] font-medium transition-all"
                                                        >
                                                            Marcar Resuelto
                                                        </button>
                                                    ) : (
                                                        <span className="text-cat-green text-[10px] flex items-center gap-1 italic">
                                                            ✅ Resuelto
                                                        </span>
                                                    )}
                                                </div>
                                            </motion.div>
                                        ))
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* KPI Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                            <div className="bg-bg-panel border border-line p-4 rounded-xl">
                                <div className="text-muted text-xs uppercase mb-1">Total Consultas</div>
                                <div className="text-3xl font-medium text-ink">{stats.total}</div>
                            </div>
                            <div className="bg-cat-green-fill border border-cat-green/20 p-4 rounded-xl">
                                <div className="text-cat-green text-xs uppercase mb-1">Resueltas Localmente</div>
                                <div className="text-3xl font-medium text-cat-green">{stats.local}</div>
                                <div className="text-[10px] text-cat-green/70">Speed: &lt;10ms</div>
                            </div>
                            <div className="bg-cat-purple-fill border border-cat-purple/20 p-4 rounded-xl">
                                <div className="text-cat-purple text-xs uppercase mb-1">Consultas Remotas</div>
                                <div className="text-3xl font-medium text-cat-purple">{stats.remote}</div>
                                <div className="text-[10px] text-cat-purple/70">RAG Engine</div>
                            </div>
                            <div className="bg-brand-light border border-brand/20 p-4 rounded-xl relative overflow-hidden">
                                <div className="text-brand text-xs uppercase mb-1">Tiempo Ahorrado</div>
                                <div className="text-3xl font-medium text-brand">{stats.savedTime}s</div>
                                <div className="text-[10px] text-brand/70">ROI Estimado</div>
                                {/* Background decoration */}
                                <div className="absolute -right-4 -bottom-4 text-brand/10 text-6xl">⏱️</div>
                            </div>
                        </div>

                        {/* Logs Table */}
                        <div className="flex-grow bg-bg-panel rounded-xl border border-line overflow-hidden flex flex-col">
                            <div className="px-4 py-3 border-b border-line bg-surface flex justify-between items-center">
                                <h3 className="text-sm font-medium text-ink">Live Event Log</h3>
                                <div className="flex gap-2 text-[10px]">
                                    <span className="flex items-center gap-1 text-cat-green"><div className="w-2 h-2 rounded-full bg-cat-green"></div>Local</span>
                                    <span className="flex items-center gap-1 text-cat-purple"><div className="w-2 h-2 rounded-full bg-cat-purple"></div>Remote</span>
                                </div>
                            </div>

                            <div className="overflow-auto flex-grow p-2 space-y-1 custom-scrollbar">
                                {loading && events.length === 0 ? (
                                    <div className="text-center py-10 text-muted">Cargando datos...</div>
                                ) : (
                                    events.map((e, idx) => (
                                        <motion.div
                                            key={idx}
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: idx * 0.03 }}
                                            className="flex items-center gap-4 p-3 hover:bg-surface rounded-lg border border-transparent hover:border-line transition-colors group"
                                        >
                                            <div className="w-20 text-[10px] text-muted font-mono flex-shrink-0 tabular-nums">
                                                {new Date(e.timestamp).toLocaleTimeString()}
                                            </div>
                                            <div className={`px-2 py-0.5 rounded text-[10px] uppercase font-medium border ${getBadgeColor(e.type)} w-32 text-center flex-shrink-0`}>
                                                {e.type.replace('Local', '').replace('Remote', '')}
                                            </div>
                                            <div className="flex-grow text-sm text-ink truncate group-hover:text-brand transition-colors">
                                                "{e.query || e.data?.query || '---'}"
                                            </div>
                                            <div className="w-20 text-right text-xs font-mono text-muted tabular-nums">
                                                {e.latencyMs || e.data?.latencyMs || 0}ms
                                            </div>
                                        </motion.div>
                                    ))
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </motion.div>
    );
};

export default AnalyticsDashboard;
