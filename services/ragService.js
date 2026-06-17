/**
 * RagService v7.1 — Plastitec AI
 *
 * Cambios respecto a v7.0:
 *   - Fase 2.5.1: Integra neuralRerankingService (Cross-Encoder bge-reranker-base)
 *   - Activación mediante flag ENABLE_NEURAL_RERANKER=true en .env
 *   - Pipeline de producción INTACTO si el flag está desactivado
 *   - Flujo Neural: Top-15 Qdrant → Top-8 Cross-Encoder → Top-4 LLM
 *
 * Cambios respecto a v6.5:
 *   - MAX_BASE_CHUNKS: 3 → 6
 *   - MAX_CONTEXT_LENGTH: 3500 → 6000
 *   - Integra rerankingService (BM25 + keyword density + phrase boost)
 *   - Integra ragLogger (logging estructurado completo)
 *   - _strictGroundingValidator reemplazado por _intelligentGroundingValidator
 *     (solo bloquea entidades/fechas/artículos inventados)
 *   - Section title boosting integrado en rerankingService
 *   - Neighbor retrieval con expansión 1-3 según score
 */

import embeddingsService from './embeddingsService.js';
import qdrantService from './qdrantService.js';
import llmService from './llmService.js';
import intentRoutingService from './intentRoutingService.js';
import rerankingService from './rerankingService.js';
import neuralRerankingService from './neuralRerankingService.js';
import ragLogger from './ragLogger.js';
import queryUnderstandingService from './queryUnderstandingService.js';
import acronymResolver from './acronymResolver.js';
import retrievalConfidence from './retrievalConfidence.js';
import { cleanResponse, polarityAwareClean } from '../utils/textProcessor.js';
import responseTypeResolver from './responseTypeResolver.js';
import responseBuilderService from './responseBuilderService.js';

// ─── Constantes de dominio ─────────────────────────────────────────────────

const SPANISH_STOPWORDS = new Set([
    'el', 'la', 'los', 'las', 'de', 'del', 'que', 'como', 'puede', 'pueden',
    'durante', 'empresa', 'para', 'por', 'una', 'un', 'en', 'y', 'es', 'se',
    'su', 'sus', 'con', 'al', 'lo', 'no', 'si', 'más', 'pero', 'o', 'qué',
    'cuál', 'cuáles', 'cómo', 'debe', 'deben', 'son', 'hay', 'entre', 'sobre',
    'este', 'esta', 'estos', 'estas', 'ser', 'tiene', 'tienen', 'vez',
]);

const EXACT_ACRONYMS = ['copasst', 'sg-sst', 'sgsst', 'sagrilaft', 'oea', 'bpm', 'rit'];

const DOC_PRIORITY_MAP = [
    {
        keywords:     ['visitante', 'visita', 'overol', 'polaina', 'ropa de calle',
                       'escafandra', 'cofia', 'maquillaje', 'uniforme', 'lavado',
                       'hipoclorito', 'planchado'],
        boostDocs:    ['bpm', 'bpmm', 'visita', 'higiene', 'induccion'],
        penalizeDocs: ['rit', 'reglamento', 'comunicado'],
    },
    {
        keywords:     ['aprendiz', 'sena', 'contrato aprendizaje', 'contrato de aprendizaje'],
        boostDocs:    ['rit', 'reglamento'],
        penalizeDocs: ['bpm'],
    },
    {
        keywords:     ['copasst', 'comité paritario', 'funciones copasst'],
        boostDocs:    ['induccion', 'sst'],
        penalizeDocs: ['bpm', 'etica'],
    },
    {
        keywords:     ['misión', 'visión', 'valores', 'historia', 'quiénes somos', 'plastitec'],
        boostDocs:    ['conocimiento', 'visual', 'empresa'],
        penalizeDocs: ['comunicado'],
    },
    // ── SAGRILAFT / LAFT ────────────────────────────────────────────────────
    {
        keywords:     [
            'sagrilaft', 'laft', 'la/ft', 'riesgo laft',
            'lavado de activos', 'lavado activos',
            'financiación del terrorismo', 'financiacion del terrorismo',
            'financiación terrorismo', 'financiacion terrorismo',
            'terrorismo', 'autocontrol', 'prevención laft', 'prevencion laft',
            'ofac', 'riesgo integral', 'datos prohibidos', 'datos personales',
        ],
        boostDocs:    ['i-rh-017', 'etica', 'rit', 'reglamento'],
        penalizeDocs: ['bpm', 'induccion'],
    },
    // ── CÓDIGO DE ÉTICA / CONDUCTA ÉTICA ─────────────────────────────────────
    {
        keywords:     [
            'etica', 'ética', 'etico', 'ético',
            'conducta', 'conducta ética', 'conducta etica',
            'comportamiento etico', 'comportamiento ético',
            'integridad', 'transparencia',
            'conflicto de interes', 'conflicto de interés',
            'soborno', 'corrupción', 'corrupcion',
            'denuncia', 'canal etico', 'canal ético',
            'código de ética', 'codigo de etica',
            'valores corporativos', 'principios corporativos',
            'regalo', 'beneficio indebido', 'conflicto interes',
        ],
        boostDocs:    ['i-rh-017', 'etica', 'codigo'],
        penalizeDocs: ['bpm', 'induccion'],
    },
    // ── Ingreso/acceso a áreas (2026-06-15) ──────────────────────────────────
    // Prioriza los instructivos dedicados de ingreso (I-RH-009/010/011) sobre el
    // BPM general, que puntúa muy alto semánticamente pero describe las áreas a
    // nivel de prácticas, no del procedimiento de ingreso paso a paso.
    {
        keywords:     [
            'ingreso a areas', 'ingreso a áreas', 'ingreso a area', 'ingreso a área',
            'acceso a areas', 'acceso a áreas', 'ingreso a zona', 'proceso de ingreso',
            'areas blancas', 'áreas blancas', 'areas grises', 'áreas grises',
            'areas negras', 'áreas negras', 'area blanca', 'área blanca',
            'area gris', 'área gris', 'area negra', 'área negra',
        ],
        boostDocs:    ['i-rh-009', 'i-rh-010', 'i-rh-011', 'ingreso_areas'],
        penalizeDocs: ['bpm'],
    },
    // ── Procedimiento de incapacidad / ausencia por enfermedad (2026-06-15) ───
    // El procedimiento accionable (reporte, soportes) vive en el RIT; I-RH-004
    // (Inducción SST) domina por score semántico pero es contexto general de SST.
    // Keywords acotadas a ausencia/incapacidad para NO capturar queries generales
    // de "enfermedades laborales" donde I-RH-004 sí es la fuente correcta.
    {
        keywords:     [
            'incapacidad', 'incapacidades', 'faltar por enfermedad',
            'ausencia por enfermedad', 'permiso por enfermedad',
            'licencia por enfermedad', 'reporte de incapacidad', 'justificar ausencia',
        ],
        boostDocs:    ['rit', 'reglamento'],
        penalizeDocs: ['induccion', 'i-rh-004'],
    },
    // ── Quejas y reclamos (2026-06-15) ───────────────────────────────────────
    // El trámite de reclamos está en el RIT (Cap. XXIV, Art. 110-111). Refuerza
    // el ranking además de la expansión sinonímica del vocabulario.
    {
        keywords:     [
            'quejas y reclamos', 'queja', 'reclamo', 'reclamos',
            'procedimiento de reclamo', 'tramite de reclamo', 'trámite de reclamo',
        ],
        boostDocs:    ['rit', 'reglamento'],
        penalizeDocs: ['induccion', 'bpm'],
    },
];

// ─── Configuración de retrieval ─────────────────────────────────────────────
const MAX_BASE_CHUNKS    = 6;    // Era 3
const MAX_CONTEXT_LENGTH = 6000; // Era 3500
const MIN_SCORE_THRESHOLD = 0.08;

// ─── Clase principal ───────────────────────────────────────────────────────

class RagService {

    async processQuery(query) {
        const session = ragLogger.startSession(query);
        const metrics = { expansion_ms: 0, embedding_ms: 0, retrieval_ms: 0, rerank_ms: 0, llm_ms: 0, total_ms: 0 };
        const startTotal = Date.now();

        try {
            // ── ETAPA 1: Query Understanding & Expansión ──────────────────
            const startExpansion = Date.now();
            const intent         = intentRoutingService.detectIntent(query);
            const intentParams   = intentRoutingService.getParams(intent);
            
            const { expanded_query, expanded_terms, normalizedTerms } = queryUnderstandingService.understand(query);

            // spellCorrectedQuery: query con typos corregidos, usada para todo lo que
            // compara contra el texto canónico del corpus: Embedding primario, keywords,
            // reranking léxico (BM25/keyword density) y exactPhraseSearch.
            // La query original (query) se conserva para: logs, acronymResolver
            // (case-insensitive, debe ver el texto tal como vino) y el conteo de
            // tokens de especificidad del Confidence Engine.
            const { normalizedQuery: spellCorrectedQuery } = queryUnderstandingService._normalizeSpelling(query.trim());


            const foundAcronyms  = acronymResolver.resolveAcronyms(query);

            const keywords       = this._extractKeywords(spellCorrectedQuery);
            const docPriority    = this._detectDocPriority(query);
            metrics.expansion_ms = Date.now() - startExpansion;

            ragLogger.logExpansion(session, {
                expandedQuery:   expanded_query,
                expandedTerms:   expanded_terms,
                normalizedTerms,
                spellCorrected:  spellCorrectedQuery !== query ? spellCorrectedQuery : null,
                keywords,
                intent,
                expansionMs:     metrics.expansion_ms,
            });

            // ── ETAPA 2: Dual Embedding ───────────────────────────────────
            // Embedding 1: query con typos corregidos (spellCorrectedQuery) — NO la raw.
            //   Esto garantiza que la normalización ortográfica llegue al índice vectorial.
            // Embedding 2: expanded_query — incluye expansión de acrónimos y términos.
            const startEmbedding  = Date.now();
            if (spellCorrectedQuery !== query) {
                console.log(`[Embedding] Usando query normalizada: "${query}" → "${spellCorrectedQuery}"`);
            }
            const originalQueryEmbedding = await embeddingsService.generateEmbedding(spellCorrectedQuery);
            const expandedQueryEmbedding = await embeddingsService.generateEmbedding(expanded_query);
            metrics.embedding_ms  = Date.now() - startEmbedding;

            ragLogger.logEmbedding(session, {
                model:       process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text',
                dimension:   originalQueryEmbedding.length,
                embeddingMs: metrics.embedding_ms,
            });

            // ── ETAPA 3: Hybrid Retrieval V2 ──────────────────────────────
            const startRetrieval = Date.now();
            const topK = intentParams.topK || 20;

            const cleanKeywordQuery = expanded_terms.length > 0 ? expanded_terms.join(' ') : keywords.join(' ');
            
            const [semanticResults, expandedSemanticResults, keywordResults, exactPhraseResults] = await Promise.all([
                qdrantService.searchSimilar(originalQueryEmbedding, topK),
                qdrantService.searchSimilar(expandedQueryEmbedding, topK),
                qdrantService.searchKeyword(cleanKeywordQuery, 15),
                qdrantService.searchExactPhrase(spellCorrectedQuery, 10),
            ]);

            metrics.retrieval_ms = Date.now() - startRetrieval;

            ragLogger.logRetrieval(session, {
                semanticResults,
                bm25_results: keywordResults,
                phrase_results: exactPhraseResults,
                subQueryCount: 0,
                retrievalMs:   metrics.retrieval_ms,
            });

            // ── ETAPA 4: Weighted Fusion Reranking ────────────────────────
            const startRerank = Date.now();

            // Weighted Fusion
            // Semantic = 0.45, BM25 = 0.25, Exact Phrase = 0.20, Expanded Query = 0.10
            const merged = this._weightedFusion(
                semanticResults, 0.45,
                keywordResults, 0.25,
                exactPhraseResults, 0.20,
                expandedSemanticResults, 0.10
            );

            // Reranking léxico multi-factor
            const lexicalReranked = rerankingService.rerank(merged, spellCorrectedQuery, keywords, docPriority, foundAcronyms);

            // ── Fase 2.5.1: Neural Reranking (Cross-Encoder) ──────────────
            // Sólo activo si ENABLE_NEURAL_RERANKER=true — producción no afectada
            let reranked = lexicalReranked;
            let neuralMetrics = { skipped: true };

            if (neuralRerankingService.isEnabled) {
                const { results, metrics: nm } = await neuralRerankingService.rank(
                    query,
                    lexicalReranked
                );
                reranked = results;
                neuralMetrics = nm;
            }

            metrics.rerank_ms = Date.now() - startRerank;

            ragLogger.logReranking(session, {
                rankedChunks:  reranked,
                fusion_results: merged.length,
                rerankMs:      metrics.rerank_ms,
                neural_active: neuralRerankingService.isEnabled,
                neural_metrics: neuralMetrics,
            });

            // ── ETAPA 5: Construcción de contexto & Retrieval Confidence ──
            const startContext = Date.now();
            const { contextText, chunksUsed, sources, rawConfidence, logDetails } =
                await this._buildContextExpanded(reranked, query, keywords);
            const contextMs = Date.now() - startContext;

            // Retrieval Confidence Engine (V2 — Query Specificity Score activo)
            const { confidence, querySpecificityTokens } = retrievalConfidence.calculateConfidence({
                similarity: rawConfidence,
                keywordDensity: reranked.length > 0 ? (reranked[0].keywordScore || 0) : 0,
                hasPhraseMatch: exactPhraseResults.length > 0,
                hasAcronymMatch: foundAcronyms.length > 0,
                hasSectionRelevance: reranked.length > 0 ? (reranked[0].boostReason?.includes('section') || false) : false,
                query,
            });

            ragLogger.logContext(session, {
                contextText,
                chunksUsed,
                sources,
                confidence_score: confidence,
                query_specificity_tokens: querySpecificityTokens,
                contextMs,
            });

            // ── Validación Determinística de Entidades (Layer 1.5) ────────
            let isEntityHallucination = false;
            /* DESACTIVADO PARA A/B TESTING - ESTRATEGIA A
            if (keywords.length > 0 && contextText) {
                const contextLower = contextText.toLowerCase();
                const mainWords = keywords.filter(k => k.length > 4);
                if (mainWords.length > 0) {
                    let missingCount = 0;
                    for (const w of mainWords) {
                        const root = w.substring(0, 5); 
                        if (!contextLower.includes(root)) {
                            missingCount++;
                        }
                    }
                    if (missingCount / mainWords.length >= 0.5) {
                        isEntityHallucination = true;
                    }
                }
            }
            */

            // ── Sin contexto → respuesta de no encontrado ─────────────────
            const safeConfidence = isNaN(confidence) ? 0 : confidence;
            console.log(`[ConfidenceEngine] similarity=${rawConfidence.toFixed(3)} specificityTokens=${querySpecificityTokens} finalConfidence=${safeConfidence.toFixed(3)}`);

            if (!contextText || chunksUsed === 0 || safeConfidence < 0.20 || isEntityHallucination) {
                const noContextResp = {
                    answer:      'No encontré información sobre este tema en la documentación disponible.',
                    confidence:  0,
                    sources:     [],
                    metrics,
                    chunksUsed:  0,
                };
                ragLogger.logResponse(session, {
                    rawResponse:      noContextResp.answer,
                    finalResponse:    noContextResp.answer,
                    llmMs:            0,
                    modelUsed:        'N/A (sin contexto)',
                    confidenceAware:  false,
                });
                metrics.total_ms = Date.now() - startTotal;
                return { ...noContextResp, metrics };
            }

            // ── ETAPA 6 & 7: Pipeline de Extracción Multi-Etapa (Fase 2) ──
            // Fase 3.1: Clasificar tipo de respuesta determinísticamente
            const responseType = responseTypeResolver.classify(query);
            llmService.setResponseMode(responseType);

            const startLLM = Date.now();
            let finalResponse;

            try {
                const { jsonFacts, citations } = await llmService.generateRAGResponse(query, contextText, session, confidence, sources);
                const builtText = responseBuilderService.build(jsonFacts, responseType);
                finalResponse = builtText + citations;
            } catch (err) {
                console.error(`   ❌ LLM primario falló: ${err.message}.`);
                finalResponse = "Lo siento, hubo un problema técnico extrayendo la información solicitada.";
            }
            
            metrics.llm_ms = Date.now() - startLLM;
            metrics.total_ms = Date.now() - startTotal;

            ragLogger.logResponse(session, {
                rawResponse: finalResponse,
                finalResponse: finalResponse,
                llmMs: metrics.llm_ms,
                modelUsed: process.env.OLLAMA_MODEL || 'llama3.2',
                confidenceAware: false
            });

            const cleanedResponse = polarityAwareClean(cleanResponse(finalResponse), query);

            return {
                answer:          cleanedResponse,
                expandedQuery:   expanded_query,
                normalizedTerms,
                keywords,
                chunksUsed,
                confidence:      safeConfidence,
                sources:         sources || [],
                metrics,
                retrievalLogs:   logDetails,
                context:         contextText,
            };

        } catch (error) {
            console.error('\n❌ [RagService v7.0] Error crítico:', error.message);
            ragLogger.logError(session, { stage: 'pipeline', error });
            return {
                answer:     'Hubo un problema interno procesando la solicitud. Por favor, intenta de nuevo.',
                confidence: 0,
                sources:    [],
                metrics,
            };
        }
    }

    // ─── Extracción de Keywords ─────────────────────────────────────────────

    _extractKeywords(query) {
        return query
            .toLowerCase()
            .replace(/[¿?¡!]/g, '')
            .split(/\s+/)
            // Strip de puntuación al inicio/final del token ("laborales." → "laborales")
            // \p{L}\p{N} preserva letras Unicode españolas (á, é, ñ, ü) y dígitos.
            .map(w => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
            .filter(w => w.length > 2 && !SPANISH_STOPWORDS.has(w));
    }

    _detectDocPriority(query) {
        const lower = query.toLowerCase();
        for (const rule of DOC_PRIORITY_MAP) {
            if (rule.keywords.some(k => lower.includes(k))) {
                return { boost: rule.boostDocs, penalize: rule.penalizeDocs };
            }
        }
        return { boost: [], penalize: [] };
    }

    _dedup(results) {
        const seen = new Set();
        return results.filter(r => {
            if (seen.has(r.id)) return false;
            seen.add(r.id);
            return true;
        });
    }

    // ─── Weighted Fusion ───────────────────────────────────────────────────

    _weightedFusion(semantic, wSem, bm25, wBM25, exact, wExact, expanded, wExp) {
        const scores = new Map();

        const addResults = (results, weight, type) => {
            if (!results) return;
            results.forEach((res, rank) => {
                // Base score logic: either use their own score normalized or a rank-based score
                // In exact phrase and keyword, score is already partially calculated.
                // Qdrant semantic score is typical cosine (0-1).
                let itemScore = res.score || (1 / (rank + 1));
                if (itemScore > 1) itemScore = 1;

                const weightedScore = itemScore * weight;
                if (scores.has(res.id)) {
                    const entry   = scores.get(res.id);
                    entry.score  += weightedScore;
                    entry.types.push(type);
                } else {
                    scores.set(res.id, { res, score: weightedScore, types: [type] });
                }
            });
        };

        addResults(semantic, wSem, 'semantic');
        addResults(bm25, wBM25, 'bm25');
        addResults(exact, wExact, 'exact_phrase');
        addResults(expanded, wExp, 'expanded_semantic');

        return Array.from(scores.values())
            .sort((a, b) => b.score - a.score)
            .map(item => ({
                ...item.res,
                fusionScore: item.score,
                searchType:  item.types.join('+'),
                finalScore:  item.score // Initialize finalScore
            }));
    }



    // ─── Construcción de contexto con neighbor retrieval ─────────────────

    async _buildContextExpanded(results, query, keywords) {
        const MAX_CONTEXT_CHARS = 10000;
        const topScore = results.length > 0 ? results[0].finalScore : 0;
        const minThreshold = Math.max(0.20, topScore * 0.15);

        const criticalChunks = []; // Top 1-2
        const supportChunks = [];  // Rank 3-6
        const sourcesSet = new Set();
        const logDetails = [];

        for (let i = 0; i < results.length; i++) {
            const res = results[i];
            if (i >= 2 && res.finalScore < minThreshold) continue;
            
            if (i < 2) {
                criticalChunks.push(res);
            } else if (i < 6) {
                supportChunks.push(res);
            } else {
                break;
            }
            
            sourcesSet.add(res.payload.fuente);
            logDetails.push({
                source:      res.payload.fuente,
                score:       res.finalScore,
                searchType:  res.searchType,
                boosted:     res.boosted,
                boostReason: res.boostReason,
            });
        }

        // ── Neighbor Retrieval solo para críticos ─────────────────────────
        const neighborIndicesBySource = new Map();
        criticalChunks.forEach(c => {
            const src = c.payload.fuente;
            const idx = c.payload.chunk_index;
            if (!neighborIndicesBySource.has(src)) neighborIndicesBySource.set(src, new Set());
            const indices = neighborIndicesBySource.get(src);
            indices.add(idx - 1);
            indices.add(idx + 1);
            
            // Section Reconstruction: si el chunk parece un título, traer los siguientes
            const text = (c.payload.texto_original || '').trim();
            const isShortHeader = text.length < 120 && /^[A-ZÁÉÍÓÚÑ\s\-:.]{5,}$/.test(text.split('\n')[0]);
            if (isShortHeader) {
                for (let r = 1; r <= 3; r++) indices.add(idx + r);
            }
        });

        // ── Recuperar chunks vecinos ───────────────────────────────
        const neighborPayloads = [];
        for (const [source, indicesSet] of neighborIndicesBySource.entries()) {
            const indices = Array.from(indicesSet).filter(i => i >= 0);
            if (indices.length === 0) continue;
            try {
                const payloads = await qdrantService.fetchPointsByIndices(source, indices);
                neighborPayloads.push(...payloads);
            } catch (err) {
                console.error(`   ⚠️ Fallo neighbor retrieval para ${source}: ${err.message}`);
            }
        }

        // ── Ensamblaje Inteligente (Sin Truncamiento Bruto) ──────────────────
        let currentChars = 0;
        const assembledSources = new Map(); // source -> set of texts

        const addChunkToContext = (source, text, isCritical = false) => {
            const clean = this._cleanText(text || '');
            if (clean.length < 10) return true;
            
            if (!assembledSources.has(source)) assembledSources.set(source, new Set());
            const set = assembledSources.get(source);
            if (set.has(clean)) return true; // ya existe, continuar buscando espacio

            if (currentChars + clean.length > MAX_CONTEXT_CHARS && !isCritical) {
                return false; // No hay espacio
            }

            set.add(clean);
            currentChars += clean.length;
            return true;
        };

        // 1. Agregar Chunks Críticos (siempre entran)
        criticalChunks.forEach(c => addChunkToContext(c.payload.fuente, c.payload.texto_original, true));

        // 2. Agregar Vecinos de Críticos (si hay espacio)
        for (const p of neighborPayloads) {
            if (!addChunkToContext(p.fuente, p.texto_original, false)) break;
        }

        // 3. Agregar Chunks de Soporte (si hay espacio)
        for (const c of supportChunks) {
            if (!addChunkToContext(c.payload.fuente, c.payload.texto_original, false)) break;
        }

        let finalContextText = '';
        for (const [source, texts] of assembledSources.entries()) {
            finalContextText += `\n[[ FUENTE: ${source} ]]\n`;
            texts.forEach(t => finalContextText += `\n${t}\n`);
            finalContextText += '\n' + '─'.repeat(50) + '\n';
        }

        return {
            contextText: finalContextText.trim(),
            chunksUsed:  criticalChunks.length + supportChunks.length,
            sources:     Array.from(sourcesSet),
            rawConfidence:  topScore,
            logDetails,
        };
    }

    // ─── Limpieza de texto ─────────────────────────────────────────────────

    _cleanText(text) {
        return text
            .replace(/(\w)-\n(\w)/g, '$1$2')           // Unir palabras cortadas con guión
            .replace(/\n\s*(\d+\.)\s+/g, '\n$1 ')      // Preservar listas numeradas
            .replace(/\n\s*([-•*])\s+/g, '\n$1 ')      // Preservar bullets
            .replace(/\n{3,}/g, '\n\n')                 // Máx 2 saltos de línea
            .trim();
    }

    // ─── Grounding Validator Inteligente ───────────────────────────────────

    /**
     * Valida que la respuesta NO invente entidades específicas ausentes en el contexto.
     *
     * SOLO bloquea cuando la respuesta contiene:
     *   - Artículos de ley con número específico NO presentes en contexto (Ej: "Artículo 45")
     *   - Fechas específicas inventadas (años que no aparecen en el contexto)
     *   - Nombres propios de personas inventados
     *
     * NO bloquea: parafraseo, síntesis, reformulación, lenguaje natural.
     *
     * @returns {{ blocked, reason, suspiciousTerm, groundingScore }}
     */
    _intelligentGroundingValidator(response, context, query) {
        const respLower = response.toLowerCase();
        const ctxLower  = context.toLowerCase();

        // ── Test 1: Artículos de ley con número específico ────────────────
        const articleMatches = response.match(/art[íi]culo\s+(\d+)/gi) || [];
        for (const art of articleMatches) {
            const artNorm = art.toLowerCase().replace(/\s+/g, ' ');
            if (!ctxLower.includes(artNorm)) {
                return {
                    blocked:        true,
                    reason:         'Artículo de ley no encontrado en documentos',
                    suspiciousTerm: art,
                    groundingScore: 0.0,
                };
            }
        }

        // ── Test 2: Años inventados (fuera de rango razonable) ────────────
        const yearMatches = response.match(/\b(19\d{2}|20\d{2})\b/g) || [];
        for (const year of yearMatches) {
            if (!ctxLower.includes(year)) {
                // Solo bloquear si parece una fecha de emisión o decreto, no un año genérico
                const yearContext = response.substring(
                    Math.max(0, response.indexOf(year) - 30),
                    response.indexOf(year) + 30
                ).toLowerCase();
                const isDateContext = /decreto|ley|resolución|expedid|promulgad|publicad/i.test(yearContext);
                if (isDateContext) {
                    return {
                        blocked:        true,
                        reason:         'Año/fecha de norma no encontrado en documentos',
                        suspiciousTerm: year,
                        groundingScore: 0.1,
                    };
                }
            }
        }

        // ── Test 3: Términos genéricos conocidos como alucinaciones ────────
        // (Lista reducida — solo los que producen respuestas completamente falsas)
        const criticalHallucinationTerms = [
            'según mis datos',
            'en internet',
            'basándome en mi conocimiento general',
            'según la ley colombiana en general',
        ];

        for (const term of criticalHallucinationTerms) {
            if (respLower.includes(term) && !ctxLower.includes(term)) {
                return {
                    blocked:        true,
                    reason:         'Frase indicadora de conocimiento externo detectada',
                    suspiciousTerm: term,
                    groundingScore: 0.0,
                };
            }
        }

        // ── Respuesta aprobada ────────────────────────────────────────────
        return {
            blocked:        false,
            reason:         null,
            suspiciousTerm: null,
            groundingScore: 1.0,
        };
    }

}

export default new RagService();
