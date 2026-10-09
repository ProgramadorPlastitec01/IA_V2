import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import DatabaseService from '../services/database.js';
import PrivacyService, { CATEGORIES } from '../services/privacy.js';
import ragService from '../services/ragService.js';
import { cleanResponse } from '../utils/textProcessor.js';
import { logAnalyticsEvent, logErrorEvent } from '../utils/logger.js';
import { SYSTEM_MESSAGES } from '../config/systemMessages.js';

// ── Configuración (2026-06-17, split 2026-08-14) ─────────────────────────────
// Lectura y escritura de SQLite ahora son flags INDEPENDIENTES (antes un solo
// CACHE_ENABLED controlaba ambas). Motivo: se quiere volver a alimentar la
// tabla de conocimiento (para análisis/auditoría — confianza, IP, etc.) SIN
// que las respuestas se sirvan desde caché — cada consulta sigue yendo fresca
// al pipeline RAG.
// CACHE_READ_ENABLED  (default false) = si true, findSimilar() puede servir
//   una respuesta ya guardada en vez de invocar el RAG (mejora de tiempos).
// CACHE_WRITE_ENABLED (default true)  = si true, cada respuesta de RAG con
//   contenido real se guarda/actualiza en knowledge_base para consulta u
//   análisis posterior, aunque nunca se lea de vuelta para responder.
// MAX_QUERY_LENGTH: tope de caracteres de la consulta (defensa de backend).
const CACHE_READ_ENABLED  = String(process.env.CACHE_READ_ENABLED  || 'false').toLowerCase() === 'true';
const CACHE_WRITE_ENABLED = String(process.env.CACHE_WRITE_ENABLED || 'true').toLowerCase() === 'true';
const MAX_QUERY_LENGTH = parseInt(process.env.MAX_QUERY_LENGTH, 10) || 200;

// ── H-01: Blocklist de inyección de prompt (2026-06-18) ─────────────────────
// Detecta intentos de manipular las instrucciones del sistema ANTES de
// construir el prompt. Ante un match → rechazo sin pasar texto al LLM.
// No mezclar con el filtro de privacidad (ese cubre datos sensibles).
const INJECTION_PATTERNS = [
    /ignora?\s+(tus\s+|mis\s+|las\s+|los\s+)?instrucciones/i,
    /olvida?\s+(lo\s+)?(anterior|todo|instrucciones)/i,
    /act[uú]a?\s+(como|siendo)\s+/i,
    /nuevas?\s+instrucciones/i,
    /eres?\s+(ahora|un|una)\s+/i,
    /sin\s+restricciones/i,
    /system\s*prompt/i,
    /\bprompt\s*[:=]/i,
    /\bjailbreak\b/i,
    /\bdeveloper\s+mode\b/i,
    /\bdo\s+anything\s+now\b/i,
    /modo\s+(sin\s+restricciones|desarrollador|developer)/i,
    /tus\s+instrucciones\s+anteriores/i,
];

console.log(`[Cache] Lectura SQLite: ${CACHE_READ_ENABLED ? 'HABILITADA' : 'deshabilitada'} (CACHE_READ_ENABLED) | Escritura SQLite: ${CACHE_WRITE_ENABLED ? 'HABILITADA' : 'deshabilitada'} (CACHE_WRITE_ENABLED)`);

// ── Filtro de calidad para ESCRITURA en caché (2026-06-16) ───────────────────
// Cachear SOLO respuestas con contenido real del RAG; no rechazos/no-respuestas.
// Señal: el texto final (el tri-estado no se propaga hasta aquí). Principio:
// quitar el bloque de citas y la nota final "No encontré información sobre: X";
// lo que queda es el contenido real. Si está vacío o LIDERA con una negación
// → es rechazo → no se cachea. Un PARTIAL_MATCH legítimo (contenido antes de la
// nota) sí se cachea. No usa umbral de confidence (se solapa demasiado entre
// buenas y rechazos; el piso 0.20 ya lo cubre ragService aguas arriba).
const _coreContent = (text) => {
    if (!text) return '';
    let t = String(text).split(/\n\n---\n/)[0];                          // quita citas
    t = t.replace(/no encontr[ée] informaci[oó]n sobre:[\s\S]*$/i, '');  // quita nota final
    return t.trim();
};
const isQualityAnswer = (text) => {
    if (!text || !text.trim()) return false;
    const core = _coreContent(text);
    if (core.length < 10) return false; // sin contenido real tras quitar nota/citas
    const REJECT_START = [
        /^no encontr[ée] informaci[oó]n/i,
        /^no se pudo extraer/i,
        /^no se encontr[oó] informaci[oó]n/i,
        /^no tengo (la )?informaci[oó]n/i,
    ];
    if (REJECT_START.some(r => r.test(core))) return false; // lidera con negación = rechazo
    if (/hubo un problema interno/i.test(core)) return false;
    return true;
};

// ── B2 (defensa en profundidad, 2026-06-17) ──────────────────────────────────
// Misma lógica que el B2 de llmService, pero en el ÚLTIMO punto del backend para
// cubrir TAMBIÉN el camino de cache-hit (la respuesta almacenada no pasa por el
// B2 del pipeline). Si la pregunta del usuario NO tiene conectores de sub-pregunta
// (y/además/también/asimismo) y queda contenido real, elimina la coletilla
// fabricada "No encontré información sobre: X". PRESERVA el bloque de citas
// (\n\n---\n📎...): separa respuesta de citas y solo limpia la cabecera, para no
// borrar las fuentes junto con la nota.
const stripFabricatedNote = (question, text) => {
    if (!text) return text;
    const tieneConectores = /\b(y|adem[áa]s|tambi[ée]n|asimismo)\b/i.test(question || '');
    if (tieneConectores) return text; // pregunta compuesta legítima → conserva nota (Cat-I)
    const parts = String(text).split(/\n\n---\n/); // [respuesta, ...citas]
    const head = parts[0]
        .replace(/\s*no encontr[ée] informaci[oó]n sobre[:\s][\s\S]*$/i, '')
        .trim();
    if (head.length < 20) return text; // no convertir un rechazo en vacío
    parts[0] = head;
    return parts.join('\n\n---\n');
};

export const postQuery = async (req, res) => {
    const startTotal = Date.now();
    const { query, conversationId, bypass_cache } = req.body || {};
    const stats = {
        sqlite_ms: 0,
        embedding_ms: 0,
        qdrant_ms: 0,
        llm_ms: 0,
        total_ms: 0
    };

    try {
        if (!query || typeof query !== 'string' || !query.trim()) {
            return res.status(400).json({ error: 'Query is required' });
        }

        // 1. Filtro de privacidad preventivo
        const initialCategory = PrivacyService.classify(query);
        if (initialCategory === CATEGORIES.CONFIDENCIAL) {
            logAnalyticsEvent('SecurityBlocked', { query, category: 'confidencial' });
            return res.json({
                response: SYSTEM_MESSAGES.CONFIDENTIAL,
                outOfScope: true,
                securityBlocked: true
            });
        }

        // 1.5. Validación de longitud (defensa de backend; DESPUÉS de privacidad,
        //      ANTES del pipeline). Espejo del maxLength=200 del frontend.
        if (query.length > MAX_QUERY_LENGTH) {
            logAnalyticsEvent('QueryRejected', { reason: 'too_long', length: query.length, limit: MAX_QUERY_LENGTH });
            return res.json({
                response: `Tu pregunta supera el límite de ${MAX_QUERY_LENGTH} caracteres. Por favor formúlala de forma más breve.`,
                outOfScope: true,
                rejected: true,
                reason: 'query_too_long'
            });
        }

        // 1.6. Detección de inyección de prompt (H-01, 2026-06-18).
        //      Bloquea antes de construir el prompt; el texto NO llega al LLM.
        if (INJECTION_PATTERNS.some(p => p.test(query))) {
            logAnalyticsEvent('InjectionBlocked', { reason: 'prompt_injection_pattern', length: query.length });
            return res.json({
                response: 'Solo puedo responder consultas sobre los documentos de RRHH de Plastitec.',
                outOfScope: true,
                rejected: true,
                reason: 'injection_detected'
            });
        }

        // 2. Búsqueda en Caché SQLite (solo si CACHE_READ_ENABLED)
        if (CACHE_READ_ENABLED && initialCategory === CATEGORIES.REGLAMENTO && !bypass_cache) {
            const startSqlite = Date.now();
            try {
                const cachedResult = await DatabaseService.findSimilar(query);
                stats.sqlite_ms = Date.now() - startSqlite;

                if (cachedResult) {
                    await DatabaseService.incrementUsage(cachedResult.id);
                    stats.total_ms = Date.now() - startTotal;
                    
                    logAnalyticsEvent('CacheHit', { query, latency: stats.total_ms });
                    
                    return res.json({
                        response: stripFabricatedNote(query, cleanResponse(cachedResult.answer)),
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
            const unansweredConversationId = conversationId || crypto.randomUUID();
            logAnalyticsEvent('UnansweredQuery', {
                conversationId: unansweredConversationId,
                clientIp: req.ip,
                query,
                response: SYSTEM_MESSAGES.NO_MATCH,
                reason: 'no_context',
                maxScore: ragResult.qdrantResults?.[0]?.score || 0
            });
            return res.json({
                response: SYSTEM_MESSAGES.NO_MATCH,
                outOfScope: false,
                category: initialCategory,
                ragStatus: 'low_relevance',
                conversationId: unansweredConversationId
            });
        }

        const responseText = ragResult.answer;
        const finalCategory = PrivacyService.classify(query);
        stats.total_ms = Date.now() - startTotal;

        // 4. Guardar en SQLite (solo escritura — ver CACHE_WRITE_ENABLED arriba;
        //    no se usa para responder, solo para análisis/auditoría posterior).
        // bypass_cache también desactiva la escritura: una corrida de benchmark
        // no debe contaminar la tabla ni heredar respuestas entre tests.
        // Filtro de calidad: solo se guardan respuestas con contenido real,
        // nunca rechazos/no-respuestas (reemplaza el guard viejo inútil que solo
        // miraba "No tengo información", frase que el LLM nunca produce).
        if (CACHE_WRITE_ENABLED && finalCategory === CATEGORIES.REGLAMENTO && !bypass_cache && isQualityAnswer(responseText)) {
            const KV_FILE = path.join(process.cwd(), 'knowledge_version.json');
            let kv = 0;
            try { kv = JSON.parse(fs.readFileSync(KV_FILE, 'utf8')).version || 0; } catch(e){}
            await DatabaseService.storeOrUpdate(query, responseText, 'general', 'gemma_rag', kv, ragResult.confidence || 0, req.ip);
        }

        // 5. Logging Auditoría + Performance
        // conversationId calculado UNA vez y reusado en log + respuesta: antes se
        // generaba un randomUUID() distinto en cada sitio, y el log ni siquiera
        // guardaba el texto de la respuesta — el emparejamiento pregunta↔respuesta
        // en reportes posteriores dependía de la posición en el archivo, que se
        // desalinea bajo escritura concurrente (2 tablets).
        const finalConversationId = conversationId || crypto.randomUUID();
        const finalResponseText = stripFabricatedNote(query, responseText);
        logAnalyticsEvent('RAGQueryMetrics', {
            conversationId: finalConversationId,
            clientIp: req.ip,
            query,
            response: finalResponseText,
            category: finalCategory,
            ...stats,
            chunksUsed: ragResult.chunksUsed,
            maxScore: ragResult.qdrantResults?.[0]?.score || 0
        });

        res.json({
            response: finalResponseText,
            outOfScope: finalCategory !== CATEGORIES.REGLAMENTO,
            category: finalCategory,
            confidence: ragResult.confidence || 0,
            sources: ragResult.sources || [],
            chunksUsed: ragResult.chunksUsed || 0,
            retrievalLogs: ragResult.retrievalLogs || null,
            context: ragResult.context || null,
            conversationId: finalConversationId
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
