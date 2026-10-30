import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../../utils/apiConfig';
import { AnswerBody, splitAnswer } from '../kiosk/shared';
import { Card, Badge, ConfirmModal, FilterPill, CheckIcon, XIcon, AlertTriangleIcon, ClockIcon } from './AdminUI';

/**
 * Portal RRHH — revisión de respuestas (2026-10-29).
 * Preguntas reales del kiosco con la última respuesta de la IA. Lo aprobado se
 * responde en ~1 s sin pasar por el modelo, solo si la pregunta coincide
 * exactamente (sin tildes ni signos). Toda llamada lleva el token de RRHH.
 */

const STATUS_FILTERS = [
    { key: 'pendiente', label: 'Pendientes' },
    { key: 'revisar', label: 'Por revisar' },
    { key: 'aprobada', label: 'Aprobadas' },
    { key: 'rechazada', label: 'Rechazadas' },
];

const REASON_LABELS = {
    documentos_cambiaron: 'Cambiaron los documentos',
    calificacion_negativa: 'Un trabajador marcó "No sirvió"',
    revocada: 'Aprobación revocada',
};

const MAX_BODY_LENGTH = 3000;

// SQLite guarda CURRENT_TIMESTAMP en UTC sin zona ("2026-10-29 17:05:00").
const fmtDate = (s) => (s ? new Date(`${String(s).replace(' ', 'T')}Z`).toLocaleString() : '—');

/** Respuesta tal como la verá el trabajador en el kiosco. */
const AnswerPreview = ({ text, title }) => {
    const { body, sources } = splitAnswer(text);
    return (
        <div className="rounded-lg border border-admin-border bg-admin-bg p-4">
            {title && <div className="text-[11px] uppercase tracking-wide text-admin-faint font-medium mb-2">{title}</div>}
            <AnswerBody text={body} />
            {sources.length > 0 && (
                <p className="text-[11px] text-admin-muted mt-3">Fuente: {sources.join(' · ')}</p>
            )}
        </div>
    );
};

const actionBtn = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity disabled:opacity-50';

const AnswerReviewsTab = ({ token, onUnauthorized }) => {
    const [status, setStatus] = useState('pendiente');
    const [data, setData] = useState({ reviews: [], counts: {} });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [busyId, setBusyId] = useState(null);
    const [editing, setEditing] = useState(null);     // { id, text, note }
    const [rejecting, setRejecting] = useState(null); // { id, note }
    const [confirmRevoke, setConfirmRevoke] = useState(null); // review

    const api = useCallback(async (path, options = {}) => {
        const res = await fetch(`${API_BASE_URL}/api/answer-reviews${path}`, {
            ...options,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
        });
        if (res.status === 401) {
            onUnauthorized();
            throw new Error('Sesión expirada');
        }
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
        return json;
    }, [token, onUnauthorized]);

    const fetchReviews = useCallback(async () => {
        setLoading(true);
        try {
            setData(await api(`?status=${status}&limit=200`));
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [api, status]);

    useEffect(() => { fetchReviews(); }, [fetchReviews]);

    const runAction = async (id, path, body) => {
        setBusyId(id);
        try {
            await api(`/${id}/${path}`, { method: 'POST', body: JSON.stringify(body || {}) });
            setEditing(null);
            setRejecting(null);
            setConfirmRevoke(null);
            await fetchReviews();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusyId(null);
        }
    };

    const startEdit = (review) => {
        const base = review.status === 'aprobada' ? review.approvedAnswer : review.latestAnswer;
        setRejecting(null);
        setEditing({ id: review.id, text: splitAnswer(base).body, note: '' });
    };

    const counts = data.counts || {};

    return (
        <div className="flex-grow overflow-auto custom-scrollbar font-admin-sans pb-6">
            <div className="mb-5">
                <h2 className="text-lg font-semibold text-admin-ink">Respuestas aprobadas</h2>
                <p className="text-xs text-admin-muted mt-0.5 max-w-3xl">
                    Preguntas reales del kiosco con la respuesta que generó la IA. Lo que apruebes se responde en
                    menos de 1 segundo, solo cuando la pregunta se escribe igual (sin importar tildes, mayúsculas ni
                    signos). Si cambian los documentos o un trabajador marca "No sirvió", vuelve a "Por revisar".
                </p>
            </div>

            <div className="flex flex-wrap gap-2 mb-5">
                {STATUS_FILTERS.map(f => (
                    <FilterPill key={f.key} active={status === f.key} onClick={() => { setStatus(f.key); setEditing(null); setRejecting(null); }}>
                        {f.label} ({counts[f.key] || 0})
                    </FilterPill>
                ))}
            </div>

            {error && (
                <div className="mb-4 flex items-center gap-2 text-xs text-admin-error bg-admin-error-soft border border-admin-error/20 rounded-lg px-3 py-2">
                    <AlertTriangleIcon size={14} /> {error}
                </div>
            )}

            <div className="space-y-3 max-w-5xl">
                {loading ? (
                    <div className="text-center py-16 text-admin-faint text-sm">Cargando…</div>
                ) : data.reviews.length === 0 ? (
                    <div className="text-center py-16 text-admin-faint italic text-sm">No hay preguntas en esta lista.</div>
                ) : data.reviews.map(review => {
                    const isBusy = busyId === review.id;
                    const isEditing = editing?.id === review.id;
                    const isRejecting = rejecting?.id === review.id;
                    const { ratings } = review;
                    const editSources = splitAnswer(review.status === 'aprobada' ? review.approvedAnswer : review.latestAnswer).sources;
                    return (
                        <Card key={review.id} className="p-4">
                            <div className="flex items-start justify-between gap-3 mb-1.5">
                                <h3 className="text-sm font-medium text-admin-ink">"{review.question}"</h3>
                                <div className="flex flex-wrap justify-end gap-1.5 flex-shrink-0">
                                    {review.edited && review.status === 'aprobada' && <Badge tone="accent">Corregida por RRHH</Badge>}
                                    {review.statusReason && REASON_LABELS[review.statusReason] && (
                                        <Badge tone={review.status === 'revisar' ? 'warning' : 'neutral'}>{REASON_LABELS[review.statusReason]}</Badge>
                                    )}
                                </div>
                            </div>
                            <p className="text-[11px] text-admin-faint mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                                <span>Preguntada {review.askCount} {review.askCount === 1 ? 'vez' : 'veces'}</span>
                                <span className="inline-flex items-center gap-1"><ClockIcon size={11} /> última {fmtDate(review.lastAsked)}</span>
                                {(ratings.good + ratings.neutral + ratings.bad) > 0 && (
                                    <span>
                                        <span className="text-admin-success">Sirvió {ratings.good}</span>
                                        {' · '}<span>Más o menos {ratings.neutral}</span>
                                        {' · '}<span className="text-admin-error">No sirvió {ratings.bad}</span>
                                    </span>
                                )}
                                {review.status === 'aprobada' && (
                                    <span>Aprobada {fmtDate(review.approvedAt)} · respondida {review.servedCount} {review.servedCount === 1 ? 'vez' : 'veces'} desde la caché</span>
                                )}
                            </p>

                            {isEditing ? (
                                <div className="space-y-2">
                                    <textarea
                                        value={editing.text}
                                        onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                                        rows={Math.min(14, Math.max(5, editing.text.split('\n').length + 1))}
                                        maxLength={MAX_BODY_LENGTH}
                                        className="w-full rounded-lg border border-admin-border bg-admin-card p-3 text-sm text-admin-ink leading-relaxed outline-none focus:border-admin-accent"
                                    />
                                    <div className="flex justify-between text-[11px] text-admin-faint">
                                        <span>{editSources.length > 0 ? `Las fuentes se conservan: ${editSources.join(' · ')}` : 'Sin fuentes'}</span>
                                        <span className="font-admin-mono">{editing.text.length}/{MAX_BODY_LENGTH}</span>
                                    </div>
                                    <input
                                        value={editing.note}
                                        onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                                        maxLength={300}
                                        placeholder="Nota interna (opcional): qué se corrigió y por qué"
                                        className="w-full rounded-lg border border-admin-border bg-admin-card px-3 py-2 text-xs text-admin-ink outline-none focus:border-admin-accent"
                                    />
                                    {editing.text.trim() && <AnswerPreview title="Vista previa en el kiosco" text={editing.text} />}
                                    <div className="flex gap-2">
                                        <button disabled={isBusy || !editing.text.trim()}
                                            onClick={() => runAction(review.id, 'approve', { answer: editing.text, note: editing.note || null })}
                                            className={`${actionBtn} bg-admin-accent text-white hover:opacity-90`}>
                                            <CheckIcon size={13} /> {isBusy ? 'Guardando…' : 'Guardar y aprobar'}
                                        </button>
                                        <button disabled={isBusy} onClick={() => setEditing(null)}
                                            className={`${actionBtn} bg-admin-card border border-admin-border text-admin-muted hover:bg-admin-bg`}>
                                            Cancelar
                                        </button>
                                    </div>
                                </div>
                            ) : review.status === 'revisar' && review.approvedAnswer ? (
                                <div className="grid gap-3 md:grid-cols-2">
                                    <AnswerPreview title="Aprobada anteriormente" text={review.approvedAnswer} />
                                    <AnswerPreview title="Respuesta actual de la IA" text={review.latestAnswer} />
                                </div>
                            ) : (
                                <AnswerPreview text={review.status === 'aprobada' ? review.approvedAnswer : review.latestAnswer} />
                            )}

                            {review.note && !isEditing && (
                                <p className="text-[11px] text-admin-muted mt-2">Nota: {review.note}</p>
                            )}

                            {isRejecting && (
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                    <input
                                        value={rejecting.note}
                                        onChange={(e) => setRejecting({ ...rejecting, note: e.target.value })}
                                        maxLength={300}
                                        autoFocus
                                        placeholder="¿Qué está mal? (opcional)"
                                        className="flex-grow min-w-[220px] rounded-lg border border-admin-border bg-admin-card px-3 py-1.5 text-xs text-admin-ink outline-none focus:border-admin-accent"
                                    />
                                    <button disabled={isBusy} onClick={() => runAction(review.id, 'reject', { note: rejecting.note || null })}
                                        className={`${actionBtn} bg-admin-error text-white hover:opacity-90`}>
                                        {isBusy ? 'Guardando…' : 'Confirmar rechazo'}
                                    </button>
                                    <button disabled={isBusy} onClick={() => setRejecting(null)}
                                        className={`${actionBtn} bg-admin-card border border-admin-border text-admin-muted hover:bg-admin-bg`}>
                                        Cancelar
                                    </button>
                                </div>
                            )}

                            {!isEditing && !isRejecting && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {review.status !== 'aprobada' && (
                                        <button disabled={isBusy || !review.latestAnswer} onClick={() => runAction(review.id, 'approve')}
                                            className={`${actionBtn} bg-admin-accent text-white hover:opacity-90`}>
                                            <CheckIcon size={13} /> {isBusy ? 'Guardando…' : review.status === 'revisar' ? 'Aprobar respuesta actual' : 'Aprobar'}
                                        </button>
                                    )}
                                    <button disabled={isBusy} onClick={() => startEdit(review)}
                                        className={`${actionBtn} bg-admin-card border border-admin-border text-admin-ink hover:bg-admin-bg`}>
                                        {review.status === 'aprobada' ? 'Corregir' : 'Corregir y aprobar'}
                                    </button>
                                    {review.status === 'aprobada' ? (
                                        <button disabled={isBusy} onClick={() => setConfirmRevoke(review)}
                                            className={`${actionBtn} bg-admin-card border border-admin-error/30 text-admin-error hover:bg-admin-error-soft`}>
                                            <XIcon size={13} /> Revocar
                                        </button>
                                    ) : review.status !== 'rechazada' && (
                                        <button disabled={isBusy} onClick={() => { setEditing(null); setRejecting({ id: review.id, note: '' }); }}
                                            className={`${actionBtn} bg-admin-card border border-admin-error/30 text-admin-error hover:bg-admin-error-soft`}>
                                            <XIcon size={13} /> Rechazar
                                        </button>
                                    )}
                                </div>
                            )}
                        </Card>
                    );
                })}
            </div>

            <ConfirmModal
                open={confirmRevoke !== null}
                title="¿Revocar la aprobación?"
                body={confirmRevoke ? `"${confirmRevoke.question}" dejará de responderse desde la caché y volverá a pasar por la IA. Queda en Pendientes.` : ''}
                confirmLabel="Revocar"
                tone="error"
                busy={confirmRevoke !== null && busyId === confirmRevoke.id}
                onConfirm={() => runAction(confirmRevoke.id, 'revoke')}
                onCancel={() => setConfirmRevoke(null)}
            />
        </div>
    );
};

export default AnswerReviewsTab;
