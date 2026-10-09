import DatabaseService from '../services/database.js';
import { logAnalyticsEvent } from '../utils/logger.js';

/**
 * Buzón de Sugerencias + Calificación de Respuestas (Kiosco 2026-10).
 * Persisten en SQLite (hr_cache.db, tablas `suggestions` y `answer_ratings`)
 * — misma base de datos que ya usa DatabaseService para knowledge_base.
 * También se registran en analytics.jsonl (igual que el resto de eventos)
 * para que el dashboard y los reportes de calidad existentes los vean.
 */

const SUGGESTION_TYPES = new Set(['sugerencia', 'respuesta_incorrecta', 'falta_info', 'felicitacion', 'otro']);
const RATING_VALUES = new Set(['good', 'neutral', 'bad']);
const MAX_MESSAGE_LENGTH = 500;

export const postSuggestion = async (req, res) => {
    try {
        let { type, message, name, area } = req.body || {};

        if (!type || !SUGGESTION_TYPES.has(type)) {
            return res.status(400).json({ success: false, error: 'Tipo de mensaje inválido.' });
        }
        message = (message || '').toString().trim();
        if (!message || message.length < 3) {
            return res.status(400).json({ success: false, error: 'El mensaje es demasiado corto.' });
        }
        message = message.slice(0, MAX_MESSAGE_LENGTH);
        name = name ? name.toString().trim().slice(0, 120) || null : null;
        area = area ? area.toString().trim().slice(0, 120) || null : null;

        const id = await DatabaseService.saveSuggestion({ type, message, name, area, clientIp: req.ip });
        logAnalyticsEvent('SuggestionSubmitted', { id, type, hasName: !!name, hasArea: !!area });

        res.json({ success: true, id });
    } catch (error) {
        console.error('Error guardando sugerencia:', error);
        res.status(500).json({ success: false, error: 'No se pudo guardar la sugerencia.' });
    }
};

export const getSuggestions = async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
        const suggestions = await DatabaseService.listSuggestions(limit);
        res.json({ suggestions });
    } catch (error) {
        console.error('Error listando sugerencias:', error);
        res.status(500).json({ error: 'No se pudieron leer las sugerencias.' });
    }
};

export const postRateAnswer = async (req, res) => {
    try {
        let { rating, question, answer, sources, conversationId } = req.body || {};

        if (!rating || !RATING_VALUES.has(rating)) {
            return res.status(400).json({ success: false, error: 'Calificación inválida.' });
        }
        question = (question || '').toString().trim().slice(0, 500);
        if (!question) {
            return res.status(400).json({ success: false, error: 'Falta la pregunta asociada.' });
        }
        answer = answer ? answer.toString().slice(0, 2000) : null;
        sources = Array.isArray(sources) ? sources.slice(0, 20).map(s => String(s).slice(0, 200)) : [];
        conversationId = conversationId ? String(conversationId).slice(0, 120) : null;

        const id = await DatabaseService.saveRating({ rating, question, answer, sources, conversationId, clientIp: req.ip });
        logAnalyticsEvent('AnswerFeedback', { id, useful: rating === 'good', rating, query: question, sources, conversationId });

        res.json({ success: true, id });
    } catch (error) {
        console.error('Error guardando calificación:', error);
        res.status(500).json({ success: false, error: 'No se pudo guardar la calificación.' });
    }
};

export const getRatingStats = async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);
        const stats = await DatabaseService.getRatingStats(limit);
        res.json(stats);
    } catch (error) {
        console.error('Error leyendo estadísticas de calificación:', error);
        res.status(500).json({ error: 'No se pudieron leer las calificaciones.' });
    }
};
