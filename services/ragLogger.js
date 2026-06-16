/**
 * RAG Logger v1.0 — Plastitec AI
 *
 * Logger estructurado para trazabilidad completa del pipeline RAG.
 * Salida dual: consola formateada + logs/rag_debug.jsonl
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const LOG_FILE   = path.join(__dirname, '..', 'logs', 'retrieval_debug.jsonl');

// Asegura que el directorio logs existe
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

// Colores ANSI para consola
const C = {
    reset:  '\x1b[0m',
    dim:    '\x1b[2m',
    bold:   '\x1b[1m',
    cyan:   '\x1b[36m',
    green:  '\x1b[32m',
    yellow: '\x1b[33m',
    red:    '\x1b[31m',
    blue:   '\x1b[34m',
    magenta:'\x1b[35m',
    gray:   '\x1b[90m',
};

class RagLogger {
    constructor() {
        this._session = null;
    }

    /**
     * Inicia una sesión de logging para una query.
     * @param {string} query 
     * @returns {object} session — pasar a cada método de log
     */
    startSession(query) {
        const session = {
            id:         `rag_${Date.now()}`,
            timestamp:  new Date().toISOString(),
            query,
            stages:     {},
            startMs:    Date.now(),
        };

        console.log(`\n${C.bold}${'═'.repeat(70)}${C.reset}`);
        console.log(`${C.cyan}${C.bold}🔍 RAG PIPELINE — Nueva consulta${C.reset}`);
        console.log(`${C.gray}   ID:    ${session.id}${C.reset}`);
        console.log(`${C.gray}   Time:  ${session.timestamp}${C.reset}`);
        console.log(`${C.bold}   Query: "${query}"${C.reset}`);
        console.log(`${C.bold}${'─'.repeat(70)}${C.reset}`);

        return session;
    }

    /**
     * Loguea la etapa de expansión de query.
     */
    logExpansion(session, { expandedQuery, expandedTerms, keywords, intent, expansionMs }) {
        session.stages.expansion = { expandedQuery, expandedTerms, keywords, intent, expansionMs };

        console.log(`\n${C.blue}📡 [1/6] QUERY EXPANSION${C.reset} ${C.gray}(${expansionMs}ms)${C.reset}`);
        console.log(`   ${C.dim}Intent detectado:${C.reset} ${C.yellow}${intent}${C.reset}`);
        console.log(`   ${C.dim}Keywords:${C.reset}       ${C.cyan}[${keywords.join(', ')}]${C.reset}`);
        if (expandedTerms && expandedTerms.length > 0) {
            console.log(`   ${C.dim}Términos expandidos:${C.reset} ${C.cyan}[${expandedTerms.join(', ')}]${C.reset}`);
        }
        if (expandedQuery !== session.query) {
            console.log(`   ${C.dim}Expandida:${C.reset}      ${C.green}"${expandedQuery.substring(0, 120)}..."${C.reset}`);
        } else {
            console.log(`   ${C.dim}Expandida:${C.reset}      ${C.gray}(sin cambios — query larga o sin términos nuevos)${C.reset}`);
        }
    }

    /**
     * Loguea la etapa de embedding.
     */
    logEmbedding(session, { model, dimension, embeddingMs }) {
        session.stages.embedding = { model, dimension, embeddingMs };

        console.log(`\n${C.blue}🧬 [2/6] EMBEDDING${C.reset} ${C.gray}(${embeddingMs}ms)${C.reset}`);
        console.log(`   ${C.dim}Modelo:${C.reset}     ${model}`);
        console.log(`   ${C.dim}Dimensión:${C.reset}  ${dimension}d`);
    }

    /**
     * Loguea los resultados del retrieval semántico y keyword.
     */
    logRetrieval(session, { semanticResults, bm25_results, phrase_results, subQueryCount, retrievalMs }) {
        session.stages.retrieval = {
            semanticCount: semanticResults.length,
            bm25Count:     bm25_results.length,
            phraseCount:   phrase_results.length,
            subQueryCount,
            retrievalMs,
            topSemantic:   semanticResults.slice(0, 3).map(r => ({
                source: r.payload?.fuente,
                score:  r.score?.toFixed(4),
                preview: (r.payload?.texto_original || '').substring(0, 80)
            }))
        };

        console.log(`\n${C.blue}📥 [3/6] RETRIEVAL${C.reset} ${C.gray}(${retrievalMs}ms)${C.reset}`);
        console.log(`   ${C.dim}Semántico:${C.reset}  ${C.green}${semanticResults.length} chunks${C.reset} | ${C.dim}BM25:${C.reset} ${C.green}${bm25_results.length} chunks${C.reset} | ${C.dim}Phrase:${C.reset} ${C.green}${phrase_results.length} chunks${C.reset}`);

        if (semanticResults.length > 0) {
            console.log(`   ${C.dim}Top semánticos:${C.reset}`);
            semanticResults.slice(0, 3).forEach((r, i) => {
                const preview = (r.payload?.texto_original || '').substring(0, 70).replace(/\n/g, ' ');
                const score   = r.score?.toFixed(4) ?? '?';
                const src     = r.payload?.fuente ?? 'unknown';
                console.log(`     ${i+1}. [${C.yellow}${score}${C.reset}] ${C.gray}${src}${C.reset} — "${preview}..."`);
            });
        } else {
            console.log(`   ${C.red}⚠️  Sin resultados semánticos.${C.reset}`);
        }
    }

    /**
     * Loguea los resultados del reranking.
     */
    logReranking(session, { rankedChunks, fusion_results, rerankMs }) {
        session.stages.reranking = {
            count:    rankedChunks.length,
            fusion_results,
            rerankMs,
            selected: rankedChunks.slice(0, 6).map(r => ({
                source:      r.payload?.fuente,
                finalScore:  r.finalScore?.toFixed(4),
                searchType:  r.searchType,
                boosted:     r.boosted,
                boostReason: r.boostReason,
                preview:     (r.payload?.texto_original || '').substring(0, 80)
            }))
        };

        console.log(`\n${C.blue}🏆 [4/6] RERANKING & FUSION${C.reset} ${C.gray}(${rerankMs}ms)${C.reset}`);
        console.log(`   ${C.dim}Total fusionados:${C.reset} ${fusion_results} | ${C.dim}Total candidatos final:${C.reset} ${rankedChunks.length}`);
        rankedChunks.slice(0, 6).forEach((r, i) => {
            const preview = (r.payload?.texto_original || '').substring(0, 65).replace(/\n/g, ' ');
            const score   = r.finalScore?.toFixed(4) ?? '?';
            const src     = r.payload?.fuente ?? 'unknown';
            const boost   = r.boosted ? ` ${C.green}[+${r.boostReason}]${C.reset}` : '';
            const type    = r.searchType === 'hybrid' ? `${C.magenta}HYBRID${C.reset}` :
                            r.searchType === 'keyword' ? `${C.yellow}KWD${C.reset}` : `${C.cyan}SEM${C.reset}`;
            console.log(`     ${i+1}. [${C.yellow}${score}${C.reset}] ${type}${boost} ${C.gray}${src}${C.reset}`);
            console.log(`        ${C.dim}"${preview}..."${C.reset}`);
        });
    }

    /**
     * Loguea el contexto final armado para el LLM.
     */
    logContext(session, { contextText, chunksUsed, sources, confidence_score, contextMs }) {
        session.stages.context = {
            chars:      contextText.length,
            chunksUsed,
            sources,
            confidence_score: confidence_score?.toFixed(4),
            contextMs,
            preview:    contextText.substring(0, 200)
        };

        const confColor = confidence_score > 0.5 ? C.green : confidence_score > 0.3 ? C.yellow : C.red;
        console.log(`\n${C.blue}📑 [5/6] CONTEXTO FINAL${C.reset} ${C.gray}(${contextMs}ms)${C.reset}`);
        console.log(`   ${C.dim}Tamaño:${C.reset}     ${contextText.length} chars | ${C.dim}Chunks:${C.reset} ${chunksUsed}`);
        console.log(`   ${C.dim}Confianza:${C.reset}  ${confColor}${(confidence_score * 100).toFixed(1)}%${C.reset}`);
        console.log(`   ${C.dim}Fuentes:${C.reset}    ${sources.join(', ')}`);
        if (contextText.length === 0) {
            console.log(`   ${C.red}⚠️  CONTEXTO VACÍO — No se encontraron chunks relevantes.${C.reset}`);
        }
    }

    /**
     * Loguea la acción del grounding validator.
     */
    logGrounding(session, { blocked, reason, suspiciousTerm, groundingScore }) {
        session.stages.grounding = { blocked, reason, suspiciousTerm, groundingScore };

        if (blocked) {
            console.log(`\n${C.red}🛑 [GROUNDING] Respuesta bloqueada${C.reset}`);
            console.log(`   ${C.dim}Razón:${C.reset}    ${reason}`);
            console.log(`   ${C.dim}Término:${C.reset}  "${suspiciousTerm}"`);
            console.log(`   ${C.dim}Score:${C.reset}    ${groundingScore?.toFixed(3)}`);
        } else {
            console.log(`\n${C.green}✅ [GROUNDING] Validación OK — respuesta aprobada${C.reset}`);
        }
    }

    /**
     * Loguea la respuesta final del LLM.
     */
    logResponse(session, { rawResponse, finalResponse, llmMs, modelUsed, confidenceAware }) {
        session.stages.response = {
            rawLength:   rawResponse?.length,
            finalLength: finalResponse?.length,
            llmMs,
            modelUsed,
            confidenceAware,
            preview:     finalResponse?.substring(0, 200)
        };

        const totalMs = Date.now() - session.startMs;
        console.log(`\n${C.blue}💬 [6/6] RESPUESTA LLM${C.reset} ${C.gray}(${llmMs}ms)${C.reset}`);
        console.log(`   ${C.dim}Modelo:${C.reset}   ${modelUsed}`);
        if (confidenceAware) {
            console.log(`   ${C.yellow}⚡ Modo confianza parcial activado${C.reset}`);
        }
        console.log(`   ${C.dim}Preview:${C.reset}  "${(finalResponse || '').substring(0, 120).replace(/\n/g, ' ')}..."`);
        console.log(`\n${C.bold}${'─'.repeat(70)}${C.reset}`);
        console.log(`${C.green}${C.bold}⏱  TOTAL: ${totalMs}ms${C.reset}`);
        console.log(`${C.bold}${'═'.repeat(70)}${C.reset}\n`);

        session.totalMs = totalMs;
        this._persistSession(session);
    }

    /**
     * Loguea un error crítico en el pipeline.
     */
    logError(session, { stage, error }) {
        const totalMs = Date.now() - session.startMs;
        console.log(`\n${C.red}❌ [RAG ERROR] Fallo en etapa: ${stage}${C.reset}`);
        console.log(`   ${error.message}`);
        session.stages.error = { stage, message: error.message, stack: error.stack };
        session.totalMs = totalMs;
        this._persistSession(session);
    }

    /**
     * Fallback para compatibilidad con código antiguo que llame a _log
     */
    _log(level, msg, data) {
        console.log(`[${level.toUpperCase()}] ${msg}`, data ? data : '');
    }

    /**
     * Escribe la sesión completa al archivo JSONL.
     * @private
     */
    _persistSession(session) {
        try {
            const line = JSON.stringify(session) + '\n';
            fs.appendFileSync(LOG_FILE, line, 'utf-8');
        } catch (e) {
            // No romper el pipeline si el logging falla
            console.warn(`[RagLogger] No se pudo escribir log: ${e.message}`);
        }
    }
}

export default new RagLogger();
