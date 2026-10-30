import DatabaseService from '../services/database.js';
import faqCache from '../services/faqCache.js';
import { normalizeQuestion, corpusSignature } from '../services/answerKeys.js';
import { logAnalyticsEvent } from '../utils/logger.js';

/**
 * Portal RRHH — respuestas aprobadas (2026-10-29).
 * RRHH revisa preguntas reales del kiosco con la última respuesta de la IA y
 * aprueba, corrige o rechaza. Lo aprobado se sirve en chatController sin pasar
 * por el LLM (coincidencia exacta de la pregunta normalizada).
 * Todas las rutas exigen token de rol rrhh (requireHr en answerReviewRoutes).
 */

const STATUSES = new Set(['pendiente', 'revisar', 'aprobada', 'rechazada']);
const MAX_BODY_LENGTH = 3000;
const MAX_NOTE_LENGTH = 300;

// Respuesta = cuerpo + bloque de fuentes ("\n\n---\n📎 *Información extraída de:* …").
// Se corta en el ÚLTIMO separador, como splitAnswer del kiosco (shared.jsx), para
// que el cuerpo que edita RRHH sea el mismo que ve. RRHH corrige solo el cuerpo;
// el bloque de fuentes original se conserva para que no se puedan romper ni inventar.
const SOURCES_SEPARATOR = '\n\n---\n';
const splitAnswer = (text) => {
    const t = String(text || '');
    const i = t.lastIndexOf(SOURCES_SEPARATOR);
    if (i < 0 || !/informaci[oó]n extra[ií]da de/i.test(t.slice(i))) return { body: t.trim(), citations: '' };
    return { body: t.slice(0, i).trim(), citations: t.slice(i + SOURCES_SEPARATOR.length) };
};
const joinAnswer = (body, citations) => (citations ? `${body}${SOURCES_SEPARATOR}${citations}` : body);

const parseJsonArray = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };
const cleanNote = (note) => (note ? String(note).trim().slice(0, MAX_NOTE_LENGTH) || null : null);

const toDto = (row, ratings) => ({
    id: row.id,
    question: row.question_original,
    askCount: row.ask_count,
    lastAsked: row.last_asked,
    latestAnswer: row.latest_answer,
    latestSources: parseJsonArray(row.latest_sources),
    approvedAnswer: row.approved_answer,
    approvedSources: parseJsonArray(row.approved_sources),
    edited: !!row.edited,
    approvedAt: row.approved_at,
    servedCount: row.served_count,
    lastServed: row.last_served,
    status: row.status,
    statusReason: row.status_reason,
    note: row.note,
    ratings: ratings.get(row.question_key) || { good: 0, neutral: 0, bad: 0 },
});

export const getAnswerReviews = async (req, res) => {
    try {
        const status = STATUSES.has(req.query.status) ? req.query.status : 'pendiente';
        const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
        const [rows, counts, ratingRows] = await Promise.all([
            DatabaseService.listReviews(status, limit),
            DatabaseService.countReviewsByStatus(),
            DatabaseService.getRatingCountsByQuestion(),
        ]);
        const ratings = new Map();
        for (const r of ratingRows) {
            const key = normalizeQuestion(r.question);
            const agg = ratings.get(key) || { good: 0, neutral: 0, bad: 0 };
            if (r.rating in agg) agg[r.rating] += r.count;
            ratings.set(key, agg);
        }
        res.json({
            status,
            counts: Object.fromEntries(counts.map(c => [c.status, c.count])),
            reviews: rows.map(row => toDto(row, ratings)),
        });
    } catch (error) {
        console.error('Error listando respuestas para revisión:', error);
        res.status(500).json({ error: 'No se pudieron leer las respuestas.' });
    }
};

export const getAnswerReviewHistory = async (req, res) => {
    try {
        res.json({ history: await DatabaseService.getReviewHistory(parseInt(req.params.id, 10)) });
    } catch (error) {
        console.error('Error leyendo historial de revisión:', error);
        res.status(500).json({ error: 'No se pudo leer el historial.' });
    }
};

const loadReview = async (req, res) => {
    const review = await DatabaseService.getReview(parseInt(req.params.id, 10));
    if (!review) res.status(404).json({ error: 'La pregunta ya no existe.' });
    return review;
};

export const postApprove = async (req, res) => {
    try {
        const review = await loadReview(req, res);
        if (!review) return;
        // Corrigiendo una ya aprobada se parte de lo aprobado; en otro caso, de la última respuesta de la IA.
        const baseText = review.status === 'aprobada' ? review.approved_answer : review.latest_answer;
        const baseSources = review.status === 'aprobada' ? review.approved_sources : review.latest_sources;
        if (!baseText) return res.status(400).json({ error: 'No hay respuesta de la IA para aprobar.' });

        const base = splitAnswer(baseText);
        let body = base.body;
        if (req.body?.answer !== undefined && req.body?.answer !== null) {
            body = String(req.body.answer).trim();
            if (!body) return res.status(400).json({ error: 'La respuesta no puede quedar vacía.' });
            if (body.length > MAX_BODY_LENGTH) {
                return res.status(400).json({ error: `La respuesta supera ${MAX_BODY_LENGTH} caracteres.` });
            }
        }
        const aiBody = splitAnswer(review.latest_answer).body;
        const edited = body !== aiBody;
        const note = cleanNote(req.body?.note);

        await DatabaseService.approveReview(review.id, {
            answer: joinAnswer(body, base.citations),
            sources: parseJsonArray(baseSources),
            edited,
            signature: corpusSignature(),
            note,
        });
        logAnalyticsEvent('AnswerReviewApproved', { id: review.id, query: review.question_original, edited });
        res.json({ success: true });
    } catch (error) {
        console.error('Error aprobando respuesta:', error);
        res.status(500).json({ error: 'No se pudo aprobar la respuesta.' });
    }
};

export const postReject = async (req, res) => {
    try {
        const review = await loadReview(req, res);
        if (!review) return;
        await DatabaseService.rejectReview(review.id, cleanNote(req.body?.note));
        // Si la misma respuesta estaba en la caché de temas sugeridos, que se regenere.
        faqCache.invalidate(review.question_original);
        logAnalyticsEvent('AnswerReviewRejected', { id: review.id, query: review.question_original });
        res.json({ success: true });
    } catch (error) {
        console.error('Error rechazando respuesta:', error);
        res.status(500).json({ error: 'No se pudo rechazar la respuesta.' });
    }
};

export const postRevoke = async (req, res) => {
    try {
        const review = await loadReview(req, res);
        if (!review) return;
        if (review.status !== 'aprobada') return res.status(400).json({ error: 'La respuesta no está aprobada.' });
        await DatabaseService.setReviewStatus(review.id, 'pendiente', 'revocada', 'revocar', cleanNote(req.body?.note));
        logAnalyticsEvent('AnswerReviewRevoked', { id: review.id, query: review.question_original });
        res.json({ success: true });
    } catch (error) {
        console.error('Error revocando respuesta:', error);
        res.status(500).json({ error: 'No se pudo revocar la respuesta.' });
    }
};
