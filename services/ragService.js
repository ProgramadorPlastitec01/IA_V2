import embeddingsService from './embeddingsService.js';
import qdrantService from './qdrantService.js';
import gemmaService from './gemmaService.js';
import queryExpansion from './queryExpansion.js';
import intentRoutingService from './intentRoutingService.js';
import { cleanResponse } from '../utils/textProcessor.js';

class RagService {
    /**
     * Procesa una consulta completa usando el flujo RAG local con métricas detalladas.
     * Implementa fallback a modelos más ligeros si falla el principal.
     */
    async processQuery(query) {
        const metrics = {
            expansion_ms: 0,
            embedding_ms: 0,
            qdrant_ms: 0,
            llm_ms: 0,
            total_ms: 0
        };
        const startTotal = Date.now();

        console.log(`🧠 [RAG Service] Procesando: "${query}"`);

        try {
            // 1. Detectar Intención y Expandir query
            const intent = intentRoutingService.detectIntent(query);
            const params = intentRoutingService.getParams(intent);
            console.log(`[Intent] Categoria detectada: ${intent.toUpperCase()}`);

            // Limitar topK para performance
            const MAX_TOPK = 12;
            params.topK = Math.min(params.topK || 10, MAX_TOPK);
            console.log(`[RAG-Params] topK ajustado a: ${params.topK}`);

            const startExpansion = Date.now();
            const expandedQuery = queryExpansion.expand(query);
            metrics.expansion_ms = Date.now() - startExpansion;

            // 2. Generar embedding
            const startEmbedding = Date.now();
            const queryEmbedding = await embeddingsService.generateEmbedding(expandedQuery);
            metrics.embedding_ms = Date.now() - startEmbedding;

            // 3. Buscar en Qdrant
            const startQdrant = Date.now();
            const qdrantResults = await qdrantService.searchSimilar(queryEmbedding, params.topK);
            metrics.qdrant_ms = Date.now() - startQdrant;

            // Aplicar pesos por Metadata
            const weightedResults = this._applyWeights(qdrantResults, params.prioritizeCategory, params.boostValue);
            this._logQdrantResults(weightedResults);

            // 4. Construir contexto (Capped to 3000 chars for LLM)
            const { contextText, chunksUsed, sources } = this._buildContext(weightedResults, params.minScore);

            if (!contextText) {
                metrics.total_ms = Date.now() - startTotal;
                return {
                    error: 'no_context',
                    metrics,
                    qdrantResults,
                    chunksUsed: 0
                };
            }

            const MAX_CONTEXT_CHARS = 3000;
            const finalContext = contextText.length > MAX_CONTEXT_CHARS ? contextText.slice(0, MAX_CONTEXT_CHARS) + '\n...[truncado]' : contextText;

            // 5. Generar respuesta con LLM
            const ragPrompt = this._buildPrompt(finalContext, expandedQuery, sources);

            const startLLM = Date.now();
            let rawResponse;
            try {
                rawResponse = await gemmaService.generateResponse(ragPrompt);
            } catch (err) {
                console.warn('[RAG] Error en modelo principal:', err.message);
                const fallbackModel = process.env.FALLBACK_OLLAMA_MODEL || 'llama3.2:3b';
                console.log(`[RAG] Intentando fallback con modelo: ${fallbackModel}`);
                rawResponse = await gemmaService.generateResponse(ragPrompt, fallbackModel);
            }
            metrics.llm_ms = Date.now() - startLLM;
            metrics.total_ms = Date.now() - startTotal;

            return {
                answer: cleanResponse(rawResponse),
                expandedQuery,
                chunksUsed,
                metrics,
                qdrantResults
            };

        } catch (error) {
            console.error('[RAG Service Error]:', error);
            throw error;
        }
    }

    _logQdrantResults(results) {
        if (results && results.length > 0) {
            const maxScore = Math.max(...results.map(r => r.score ?? 0));
            const bestSource = results[0]?.payload?.fuente || 'Desconocida';
            console.log(`[RAG] ${results.length} chunks. Max Score: ${maxScore.toFixed(4)} | Fuente: ${bestSource}`);
        }
    }

    _applyWeights(results, prioritizeCategory, boostValue) {
        if (!prioritizeCategory) return results;

        return results.map(res => {
            const category = res.payload?.metadata?.category || '';
            const shouldBoost = category === prioritizeCategory;
            
            if (shouldBoost) {
                return { ...res, score: Math.min(res.score + boostValue, 1.0), boosted: true };
            }
            return res;
        }).sort((a, b) => b.score - a.score);
    }

    _buildContext(results, minScore = 0.35) {
        let contextText = '';
        let chunksUsed = 0;
        const sources = new Set();
        const MAX_CONTEXT_CHARS_INTERNAL = 6000;
        
        if (results && results.length > 0) {
            const seenContent = new Set();

            for (const result of results) {
                if ((result.score ?? 0) < minScore) continue;
                
                const chunkContent = result.payload?.texto_original || '';
                const source = result.payload?.fuente || 'Documento';
                
                const contentHash = chunkContent.substring(0, 100).trim();
                if (seenContent.has(contentHash)) continue;
                seenContent.add(contentHash);

                if (contextText.length + chunkContent.length > MAX_CONTEXT_CHARS_INTERNAL) break;
                
                contextText += `\n--- FUENTE: ${source} ---\n${chunkContent}\n`;
                sources.add(source);
                chunksUsed++;
            }
        }
        return { contextText: contextText.trim(), chunksUsed, sources: [...sources] };
    }

    _buildPrompt(context, query, sources) {
        const sourcesList = sources.length > 0 ? sources.join(', ') : 'Documentacion interna';
        return `Eres el Asistente de IA de Plastitec. Responde basado EXCLUSIVAMENTE en el contexto proporcionado.
        
CONTEXTO:
${context}

PREGUNTA:
${query}

INSTRUCCIONES:
- Responde de forma amable y profesional.
- Si no esta en el contexto, di que no tienes la informacion.
- Al final indica las fuentes: ${sourcesList}

Respuesta:`;
    }
}

export default new RagService();
