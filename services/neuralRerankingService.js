/**
 * neuralRerankingService.js
 * Fase 2.5.1 — Cross-Encoder Neural Reranking (POC)
 *
 * Usa @xenova/transformers con el modelo Xenova/bge-reranker-base
 * para reordenar candidatos RAG de forma semántica profunda.
 *
 * AISLAMIENTO DE PRODUCCIÓN:
 * - Este servicio sólo se activa si ENABLE_NEURAL_RERANKER=true en .env
 * - Si la variable está ausente o es false, el pipeline original no sufre ningún cambio.
 *
 * FLUJO ESPERADO:
 *   Top-15 Qdrant → Cross-Encoder evalúa Top-8 → Devuelve Top-3/4 al LLM
 */

import dotenv from 'dotenv';
dotenv.config();

const ENABLED = process.env.ENABLE_NEURAL_RERANKER === 'true';
const MODEL   = process.env.NEURAL_RERANKER_MODEL || 'Xenova/bge-reranker-base';
const TOP_INPUT  = parseInt(process.env.NEURAL_TOP_INPUT  || '6', 10);  // Optimizado: 8→6 (Fase 2.5.2)
const TOP_OUTPUT = parseInt(process.env.NEURAL_TOP_OUTPUT || '4', 10);  // Cuántos llegan al LLM

let pipelineInstance  = null;
let modelLoaded       = false;
let loadStartTime     = null;

const loadLogger = (...args) => console.log('[NeuralReranker]', ...args);

/**
 * Carga perezosa del modelo. Se llama una sola vez en el primer uso.
 * El modelo se cachea en memoria para peticiones posteriores.
 */
async function loadPipeline() {
    if (modelLoaded) return pipelineInstance;

    const { pipeline } = await import('@xenova/transformers');
    loadLogger(`Cargando modelo: ${MODEL} ...`);
    loadStartTime = Date.now();

    pipelineInstance = await pipeline('text-classification', MODEL, {
        // Opciones de rendimiento
        dtype: 'fp32',    // Usar fp32 en CPU para mayor compatibilidad
        device: 'cpu',
    });

    modelLoaded = true;
    loadLogger(`✅ Modelo cargado en ${Date.now() - loadStartTime}ms`);
    return pipelineInstance;
}

class NeuralRerankingService {

    get isEnabled() { return ENABLED; }

    /**
     * Realiza el Neural Reranking de candidatos RAG.
     *
     * @param {string} query         - La pregunta original del usuario
     * @param {Array}  candidates    - Array de objetos { id, score, payload, ... }
     * @param {number} topInput      - Cuántos candidatos se evalúan con el CE (default: TOP_INPUT)
     * @param {number} topOutput     - Cuántos devuelve tras el reranking (default: TOP_OUTPUT)
     * @returns {Promise<{ results: Array, metrics: object }>}
     */
    async rank(query, candidates, topInput = TOP_INPUT, topOutput = TOP_OUTPUT) {
        if (!ENABLED || !candidates || candidates.length === 0) {
            return { results: candidates.slice(0, topOutput), metrics: { skipped: true } };
        }

        const t0 = Date.now();

        try {
            const pipe = await loadPipeline();

            // Solo evaluamos los primeros N candidatos (post-lexical rerank)
            const pool = candidates.slice(0, topInput);

            // Puntuar cada candidato contra la query
            const scored = await Promise.all(pool.map(async (c) => {
                const text = (c.payload?.texto_original || '').substring(0, 512);
                try {
                    // Xenova text-classification acepta (query, { text_pair })
                    const result = await pipe(query, { text_pair: text });
                    const output = Array.isArray(result) ? result : [result];
                    // bge-reranker-base etiqueta: "LABEL_1" (relevante) o "1"
                    let neuralScore = 0;
                    const label1 = output.find(o => o.label === 'LABEL_1' || o.label === '1');
                    if (label1) {
                        neuralScore = label1.score;
                    } else {
                        const label0 = output.find(o => o.label === 'LABEL_0' || o.label === '0');
                        if (label0) {
                            neuralScore = 1 - label0.score;
                        }
                    }
                    return { ...c, neuralScore, finalScore: neuralScore };
                } catch (_) {
                    // Si falla un chunk individualmente, score 0
                    return { ...c, neuralScore: 0, finalScore: 0 };
                }
            }));

            // Ordenar por score neural descendente
            scored.sort((a, b) => b.neuralScore - a.neuralScore);

            const topResults = scored.slice(0, topOutput);
            const elapsed    = Date.now() - t0;
            loadLogger(`Reranking: ${pool.length} candidatos → Top ${topResults.length} | ${elapsed}ms | Top score: ${topResults[0]?.neuralScore?.toFixed(4)}`);

            return {
                results: topResults,
                metrics: {
                    elapsed_ms:       elapsed,
                    candidates_in:    pool.length,
                    candidates_out:   topResults.length,
                    top_neural_score: topResults[0]?.neuralScore?.toFixed(4) ?? '0',
                    model:            MODEL,
                },
            };

        } catch (err) {
            loadLogger(`❌ Error en Neural Reranking: ${err.message}`);
            // Fallback seguro: devolver candidatos léxicos sin modificar
            return {
                results:  candidates.slice(0, topOutput),
                metrics:  { error: err.message, elapsed_ms: Date.now() - t0 },
            };
        }
    }

    /**
     * Pre-carga el modelo en memoria. Útil para llamar al iniciar el servidor
     * y evitar latencia en la primera petición real.
     */
    async warmup() {
        if (!ENABLED) {
            loadLogger('Desactivado (ENABLE_NEURAL_RERANKER != true). Saltando warmup.');
            return;
        }
        loadLogger('Iniciando warmup del Cross-Encoder...');
        await loadPipeline();
        // Petición mínima de calentamiento
        await this.rank('test warmup', [
            { payload: { texto_original: 'texto de prueba para inicializar el modelo' }, score: 0.5 }
        ]);
        loadLogger('✅ Warmup completado.');
    }

    /**
     * Reporte de estado del servicio.
     */
    status() {
        return {
            enabled:     ENABLED,
            model:       MODEL,
            loaded:      modelLoaded,
            top_input:   TOP_INPUT,
            top_output:  TOP_OUTPUT,
        };
    }
}

export default new NeuralRerankingService();
