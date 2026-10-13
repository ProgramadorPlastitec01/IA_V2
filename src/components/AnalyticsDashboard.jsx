import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { API_BASE_URL } from '../utils/apiConfig';
import SystemStatus from './SystemStatus';
import SystemErrorsTab from './admin/SystemErrorsTab';
import ModelValidationTab from './admin/ModelValidationTab';
import CorpusGapsTab from './admin/CorpusGapsTab';
import { ZapIcon, NewBadge, FlaskIcon, FileSearchIcon } from './admin/AdminUI';

const AnalyticsDashboard = ({ onClose }) => {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ total: 0, remote: 0, local: 0, savedTime: 0 });
    const [systemErrors, setSystemErrors] = useState([]);
    const [suggestions, setSuggestions] = useState([]);
    const [ratingStats, setRatingStats] = useState({ totals: [], recent: [] });
    const [activeTab, setActiveTab] = useState('analytics'); // 'analytics' | 'system' | 'errors' | 'feedback' | 'models' | 'corpus-gaps'
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

    const SUGGESTION_TYPE_LABELS = {
        sugerencia: { label: '💡 Sugerencia', cls: 'bg-cat-amber-fill text-cat-amber border-cat-amber/30' },
        respuesta_incorrecta: { label: '⚠️ Resp. Incorrecta', cls: 'bg-cat-coral-fill text-cat-coral border-cat-coral/30' },
        falta_info: { label: '📄 Falta Info', cls: 'bg-cat-purple-fill text-cat-purple border-cat-purple/30' },
        felicitacion: { label: '😊 Felicitación', cls: 'bg-cat-green-fill text-cat-green border-cat-green/30' },
        otro: { label: '💬 Otro', cls: 'bg-surface text-muted border-line' },
    };
    const RATING_LABELS = { good: '😊 Buena', neutral: '😐 Más o menos', bad: '😞 No sirvió' };
    const ratingCount = (r) => ratingStats.totals.find(t => t.rating === r)?.count || 0;

    return (
        <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed inset-0 z-50 bg-admin-bg flex flex-col p-6 overflow-hidden text-admin-ink font-admin-sans"
        >
            {/* Header */}
            <div className="flex justify-between items-center mb-6 border-b border-admin-border pb-4">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-admin-accent text-white flex items-center justify-center flex-shrink-0">
                        <ZapIcon size={18} />
                    </div>
                    <div>
                        <h1 className="text-lg font-semibold text-admin-ink leading-tight">Admin Dashboard</h1>
                        <p className="text-xs text-admin-muted">System &amp; Analytics Console</p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="px-4 py-2 bg-admin-card hover:bg-admin-bg border border-admin-border rounded-lg text-admin-ink text-sm transition-colors"
                >
                    Cerrar [ESC]
                </button>
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap gap-3 mb-6">
                {[
                    { key: 'analytics', label: 'Estadísticas de Uso' },
                    { key: 'system', label: 'Estado de Servicios' },
                    { key: 'errors', label: 'Errores del Sistema', count: systemErrors.filter(e => e.status === 'pending').length },
                    { key: 'feedback', label: 'Buzón y Calificaciones', count: suggestions.filter(s => s.status === 'nuevo').length },
                ].map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all flex items-center gap-2 border ${activeTab === tab.key ? 'bg-admin-accent text-white border-admin-accent' : 'bg-admin-card border-admin-border text-admin-muted hover:bg-admin-bg'}`}
                    >
                        {tab.label}
                        {tab.count > 0 && (
                            <span className={`rounded-full w-5 h-5 flex items-center justify-center text-[10px] ${activeTab === tab.key ? 'bg-white/20' : 'bg-admin-error text-white'}`}>
                                {tab.count}
                            </span>
                        )}
                    </button>
                ))}
                {[
                    { key: 'models', label: 'Validación de Modelos IA', icon: FlaskIcon },
                    { key: 'corpus-gaps', label: 'Huecos del Corpus', icon: FileSearchIcon },
                ].map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.key;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all flex items-center gap-2 border ${isActive ? 'bg-admin-accent text-white border-admin-accent' : 'bg-admin-accent-soft border-dashed border-admin-accent-dash text-admin-accent hover:bg-admin-accent-soft/70'}`}
                        >
                            <Icon size={15} />
                            {tab.label}
                            <NewBadge />
                        </button>
                    );
                })}
            </div>

            {/* Content Area */}
            <div className="flex-grow overflow-hidden flex flex-col">
                {activeTab === 'models' ? (
                    <ModelValidationTab />
                ) : activeTab === 'corpus-gaps' ? (
                    <CorpusGapsTab />
                ) : activeTab === 'system' ? (
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
                    <SystemErrorsTab onNavigateToCorpusGaps={() => setActiveTab('corpus-gaps')} />
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
