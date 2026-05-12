import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import DatabaseService from '../services/database.js';
import PrivacyService, { CATEGORIES } from '../services/privacy.js';
import ragService from '../services/ragService.js';
import { cleanResponse } from '../utils/textProcessor.js';
import { logAnalyticsEvent, logErrorEvent } from '../utils/logger.js';

export const postQuery = async (req, res) => {
    const startTotal = Date.now();
    const { query, conversationId } = req.body || {};
    const stats = {
        sqlite_ms: 0,
        embedding_ms: 0,
        qdrant_ms: 0,
        llm_ms: 0,
        total_ms: 0
    };

    try {
        if (!query || typeof query !== 'string') {
            return res.status(400).json({ error: 'Query is required' });
        }

        // 1. Filtro de privacidad preventivo
        const initialCategory = PrivacyService.classify(query);
        if (initialCategory === CATEGORIES.CONFIDENCIAL) {
            logAnalyticsEvent('SecurityBlocked', { query, category: 'confidencial' });
            return res.json({
                response: "No puedo proporcionar información confidencial sobre salarios o datos personales.\nPara conocer tu información exacta, consulta directamente con RRHH.",
                outOfScope: true,
                securityBlocked: true
            });
        }

        // 2. Búsqueda en Caché SQLite
        if (initialCategory === CATEGORIES.REGLAMENTO) {
            const startSqlite = Date.now();
            try {
                const cachedResult = await DatabaseService.findSimilar(query);
                stats.sqlite_ms = Date.now() - startSqlite;

                if (cachedResult) {
                    await DatabaseService.incrementUsage(cachedResult.id);
                    stats.total_ms = Date.now() - startTotal;
                    
                    logAnalyticsEvent('CacheHit', { query, latency: stats.total_ms });
                    
                    return res.json({
                        response: cleanResponse(cachedResult.answer),
                        outOfScope: false,
                        cached: true,
                        cacheSource: 'sqlite',
                        conversationId: conversationId || 'cached-session'
                    });
                }
            } catch (e) {
                console.error('⚠️ Error caché:', e.message);
            }
        }

        // 3. Flujo RAG Local
        const ragResult = await ragService.processQuery(query);
        
        // Integrar métricas del servicio RAG
        Object.assign(stats, ragResult.metrics);

        if (ragResult.error === 'no_context') {
            stats.total_ms = Date.now() - startTotal;
            logAnalyticsEvent('UnansweredQuery', { query, reason: 'no_context', maxScore: ragResult.qdrantResults?.[0]?.score || 0 });
            return res.json({
                response: "No encontré información relevante en el reglamento para responder esta pregunta.",
                outOfScope: false,
                category: initialCategory,
                ragStatus: 'low_relevance',
                conversationId: conversationId || crypto.randomUUID()
            });
        }

        const responseText = ragResult.answer;
        const finalCategory = PrivacyService.classify(query);
        stats.total_ms = Date.now() - startTotal;

        // 4. Guardar en SQLite (Aprendizaje progresivo)
        if (finalCategory === CATEGORIES.REGLAMENTO && !responseText.includes("No tengo información")) {
            const KV_FILE = path.join(process.cwd(), 'knowledge_version.json');
            let kv = 0;
            try { kv = JSON.parse(fs.readFileSync(KV_FILE, 'utf8')).version || 0; } catch(e){}
            await DatabaseService.storeOrUpdate(query, responseText, 'general', 'gemma_rag', kv);
        }

        // 5. Logging Auditoría + Performance
        logAnalyticsEvent('RAGQueryMetrics', {
            query,
            category: finalCategory,
            ...stats,
            chunksUsed: ragResult.chunksUsed,
            maxScore: ragResult.qdrantResults?.[0]?.score || 0
        });

        res.json({
            response: responseText,
            outOfScope: finalCategory !== CATEGORIES.REGLAMENTO,
            category: finalCategory,
            conversationId: conversationId || crypto.randomUUID()
        });

    } catch (error) {
        console.error('Query error:', error);
        logErrorEvent('IA', 'QueryEngine', error.message, error.stack, { query });
        
        let friendlyMessage = `Error al procesar la consulta: ${error.message}`;
        if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
            friendlyMessage = "El servicio de IA no está disponible temporalmente. Verifica los servicios locales.";
            logAnalyticsEvent('ServiceAlert', { service: 'IA', status: 'down', error: error.message });
        }

        res.status(500).json({ error: friendlyMessage });
    }
};

export const postReset = (req, res) => {
    res.json({ success: true });
};
