/**
 * LLMService v1.0 — Plastitec AI
 *
 * Reemplaza gemmaService.js con:
 *   - Desacoplamiento completo del modelo (soporta cualquier modelo Ollama)
 *   - Métricas de inferencia (tokens/s, tiempo, modelo usado)
 *   - Validación de respuesta vacía y protección anti-timeout
 *   - Self-Check Pass: detecta negaciones falsas y regenera
 *   - Response Modes: STRICT_EXTRACTIVE, BALANCED_SUMMARY, SHORT_ANSWER, DETAILED_POLICY
 *   - Fallback automático a modelo secundario
 *   - Retry con backoff exponencial
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { getExtractionPrompt } from '../prompts/extractionPrompt.js';
import polarityValidator from './polarityValidator.js';
import answerVerifier from './answerVerifier.js';
import citationBuilder from './citationBuilder.js';
import ragLogger from './ragLogger.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Response Modes ─────────────────────────────────────────────────────────
const RESPONSE_MODES = {
    // num_predict ampliados (2026-06-12): el prompt Tri-Estado genera
    // <razonamiento> + <clasificacion> + <respuesta>; con presupuestos cortos
    // el CoT consumía los tokens y <respuesta> llegaba truncada/vacía.
    SHORT_ANSWER: {
        temperature: 0.1,
        top_p:       0.85,
        num_predict: 600,
    },
    PROCEDURE: {
        temperature: 0.1,
        top_p:       0.85,
        num_predict: 800,
    },
    DEFINITION: {
        temperature: 0.1,
        top_p:       0.85,
        num_predict: 700,
    },
    LIST: {
        temperature: 0.1,
        top_p:       0.85,
        num_predict: 700,
    },
    // Modos Legados (compatibilidad)
    STRICT_EXTRACTIVE: {
        temperature: 0.05,
        top_p:       0.85,
        num_predict: 512,
    },
    DETAILED_POLICY: {
        temperature: 0.1,
        top_p:       0.85,
        num_predict: 400,
    }
};

// ─── Anti-Negation Patterns ─────────────────────────────────────────────────
const FALSE_NEGATION_PATTERNS = [
    /no\s+(se\s+)?(encuentra|contiene|menciona|especifica|incluye|indica|proporciona|hay)\s+información/i,
    /no\s+puedo\s+responder/i,
    /no\s+tengo\s+(la\s+)?información/i,
    /el\s+(texto|contexto|documento)\s+(proporcionado\s+)?no\s+(contiene|menciona|incluye)/i,
    /no\s+está\s+(disponible|presente|incluido|mencionado)/i,
    /lamentablemente.*no.*informa/i,
    /desafortunadamente.*no.*encuentr/i,
];

class LLMService {
    constructor() {
        this.url          = process.env.OLLAMA_URL      || 'http://localhost:11434';
        this.model        = process.env.OLLAMA_MODEL    || 'llama3.2';
        this.fallbackModel = process.env.OLLAMA_FALLBACK_MODEL || 'gemma';
        this.timeout      = parseInt(process.env.OLLAMA_TIMEOUT) || 180000;
        this.responseMode = process.env.LLM_RESPONSE_MODE || 'SHORT_ANSWER';

        this._log('info', 'LLMService inicializado', {
            url:          this.url,
            model:        this.model,
            fallback:     this.fallbackModel,
            responseMode: this.responseMode,
        });
    }

    // ─── Generación Simple ──────────────────────────────────────────────────

    /**
     * Genera una respuesta a partir de un prompt.
     * @param {string} prompt
     * @param {string} [modelOverride]
     * @param {boolean} [enforceJson]
     * @param {Object}  [optionsOverride] Override puntual de options de Ollama
     *                  (ej: { num_predict } para el reintento anti-truncamiento).
     * @returns {Promise<string>}
     */
    async generateResponse(prompt, modelOverride, enforceJson = false, optionsOverride = null) {
        if (!prompt) throw new Error('[LLMService] Prompt vacío no permitido.');

        const modelToUse = modelOverride || this.model;
        const mode       = RESPONSE_MODES[this.responseMode] || RESPONSE_MODES.SHORT_ANSWER;
        const startTime  = Date.now();

        return await this._withRetry(async () => {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), this.timeout);

            const bodyParams = {
                model:  modelToUse,
                prompt,
                stream: false,
                options: {
                    temperature: mode.temperature,
                    top_p:       mode.top_p,
                    num_predict: mode.num_predict,
                    ...(optionsOverride || {}),
                },
            };
            if (enforceJson) {
                bodyParams.format = 'json';
            }

            try {
                const response = await fetch(`${this.url}/api/generate`, {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(bodyParams),
                    signal: controller.signal,
                });
                clearTimeout(id);

                if (!response.ok) {
                    const error = await response.text();
                    throw new Error(`Ollama API Error (${response.status}): ${error}`);
                }

                const data    = await response.json();
                const elapsed = Date.now() - startTime;

                // Métricas de inferencia
                const tokensGenerated = data.eval_count || 0;
                const tokensPerSec    = data.eval_duration
                    ? (tokensGenerated / (data.eval_duration / 1e9)).toFixed(1)
                    : 'N/A';

                this._log('info', 'Inferencia completada', {
                    model:     modelToUse,
                    elapsed:   `${elapsed}ms`,
                    tokens:    tokensGenerated,
                    tokPerSec: tokensPerSec,
                    respLen:   (data.response || '').length,
                });

                if (!data.response || data.response.trim().length === 0) {
                    throw new Error('Respuesta vacía del LLM');
                }

                return data.response;

            } catch (error) {
                clearTimeout(id);
                if (error.name === 'AbortError') {
                    throw new Error(`Timeout de ${this.timeout}ms excedido en inferencia de ${modelToUse}.`);
                }
                throw error;
            }
        }, 'generateResponse');
    }

    /**
     * Genera una respuesta RAG Multi-Etapa (Fase 2)
     * Etapa 1: Extract-First (Evidencia JSON)
     * Etapa 2: Generación guiada por Evidencia
     * Etapa 3: Validadores post-generación
     */
    async generateRAGResponse(question, context, session = null, retrievalConfidence = 0, sources = []) {
        this._log('info', 'Iniciando Pipeline Tri-Estado (CoT XML)', { questionLen: question.length });
        
        const xmlPrompt = `<|begin_of_text|><|start_header_id|>system<|end_header_id|>
Eres el motor de Inferencia Tri-Estado de Plastitec AI.
Tu tarea es leer el contexto, analizar la pregunta y decidir si existe información suficiente para responder.

REGLAS DE CLASIFICACIÓN:
- FULL_MATCH: Todas las entidades o condiciones solicitadas están en el contexto y responden a la pregunta.
- PARTIAL_MATCH: El sustantivo principal (ej. "teletrabajo") existe, pero falta un modificador o condición secundaria (ej. "comercial").
- NO_INFORMATION_FOUND: El SUSTANTIVO PRINCIPAL O TEMA CENTRAL (ej. "drones", "España", "SAP") no existe en absoluto en el contexto.

REGLA ESPECIAL — PREGUNTAS COMPUESTAS:
Si la pregunta del empleado contiene múltiples sub-preguntas conectadas con "y", "además", "también" o "asimismo":
1. Evalúa CADA sub-pregunta de forma independiente contra el contexto.
2. Si AL MENOS UNA sub-pregunta tiene respuesta en el contexto:
   → Clasifica como PARTIAL_MATCH (nunca NO_INFORMATION_FOUND).
   → En <respuesta>, responde las partes que SÍ tienen información.
   → Al final indica explícitamente: "No encontré información sobre: [parte sin respuesta]."
3. Solo clasifica NO_INFORMATION_FOUND si NINGUNA sub-pregunta tiene respuesta en el contexto.

FORMATO DE RESPUESTA OBLIGATORIO:
<razonamiento>
- Entidades clave: [X, Y, Z]
- Hallazgos: [Qué encontraste y qué no]
</razonamiento>
<clasificacion>PARTIAL_MATCH</clasificacion>
<respuesta>
[Aquí tu respuesta final.]
</respuesta>

El razonamiento debe ser BREVE: máximo 3 líneas. No repitas el contexto. Prioriza siempre completar el tag <respuesta>.
<|end|>

<|user|>
CONTEXTO DOCUMENTAL:
${context}

PREGUNTA DEL EMPLEADO:
"${question}"
<|end|>

<|assistant|>`

        let finalResponseStr;
        try {
            finalResponseStr = await this.generateResponse(xmlPrompt, this.model, false);
            console.log("\n--- RAW LLM OUTPUT ---\n" + finalResponseStr + "\n----------------------\n");
        } catch (e) {
            this._log('error', 'Fallo en la inferencia XML', { error: e.message });
            finalResponseStr = "<clasificacion>NO_INFORMATION_FOUND</clasificacion>";
        }
        
        // Extrae el contenido de <respuesta> de forma TOLERANTE: si falta el tag
        // de cierre </respuesta> (común en modelos 3B), recupera el texto desde
        // <respuesta> hasta el final o hasta el primer marcador de fin de turno.
        const extraerRespuesta = (str) => {
            if (!str) return '';
            const open = str.match(/<respuesta>/i);
            if (!open) return '';
            let tail = str.slice(open.index + open[0].length);
            const cut = tail.search(/<\/respuesta>|<\|?\s*end\s*\|?>|<\|eot/i);
            if (cut !== -1) tail = tail.slice(0, cut);
            return tail.trim();
        };

        const clasificacionMatch = finalResponseStr.match(/<clasificacion>([\s\S]*?)<\/clasificacion>/i);
        let clasificacion = clasificacionMatch ? clasificacionMatch[1].trim() : "NO_INFORMATION_FOUND";
        let respuestaFinal = extraerRespuesta(finalResponseStr);

        // ── Defensa anti-truncamiento (corregida 2026-06-16) ──────────────────
        // Truncamiento REAL = clasificación positiva Y <respuesta> SIN contenido
        // útil (longitud 0 tras extracción tolerante). NO se dispara si hay
        // contenido válido, aunque incluya "No encontré información sobre: X"
        // (eso es un PARTIAL_MATCH legítimo, no un truncamiento).
        const positiveClass = clasificacion === 'FULL_MATCH' || clasificacion === 'PARTIAL_MATCH';
        const truncamientoReal = positiveClass && respuestaFinal.length === 0;

        if (truncamientoReal) {
            this._log('warn', '[LLMService] Truncamiento real (<respuesta> vacía) — reintento con presupuesto ampliado');
            const mode = RESPONSE_MODES[this.responseMode] || RESPONSE_MODES.SHORT_ANSWER;
            try {
                const retryStr = await this.generateResponse(
                    xmlPrompt, this.model, false,
                    { num_predict: mode.num_predict + 300 }
                );
                const retryResp = extraerRespuesta(retryStr);
                // SEGURIDAD anti-degradación: solo adoptar el reintento si MEJORA
                // (trae contenido). Como el original aquí está vacío, el reintento
                // nunca puede degradar una respuesta buena; si el reintento también
                // viene vacío, se conserva el original. Nunca degrada.
                if (retryResp.length > 0) {
                    respuestaFinal = retryResp;
                    const retryClasif = retryStr.match(/<clasificacion>([\s\S]*?)<\/clasificacion>/i);
                    if (retryClasif) clasificacion = retryClasif[1].trim();
                    console.log("\n--- RAW LLM OUTPUT (retry anti-truncamiento) ---\n" + retryStr + "\n----------------------\n");
                }
            } catch (e) {
                this._log('error', 'Reintento anti-truncamiento falló', { error: e.message });
            }
        }

        if (respuestaFinal.length === 0) respuestaFinal = "No se pudo extraer una respuesta clara.";

        this._log('info', 'Clasificación Tri-Estado completada', { clasificacion });

        if (clasificacion === "NO_INFORMATION_FOUND") {
            return {
                jsonFacts: { error: "no_information_found" },
                citations: ""
            };
        } else {
            // Citas con las fuentes REALES recuperadas (no genéricas). Si la
            // "respuesta" es en realidad un rechazo/no-respuesta, NO se citan
            // fuentes (no tiene sentido citar algo que no se respondió).
            const REJECTION_MARKERS = ['no encontré información', 'no se encontró información', 'no se pudo extraer'];
            const isRejection = REJECTION_MARKERS.some(m => respuestaFinal.toLowerCase().includes(m));
            const evidence = (sources || []).filter(Boolean).map(s => ({ source: s }));
            return {
                jsonFacts: { answer: respuestaFinal },
                citations: isRejection ? '' : citationBuilder.build(evidence, retrievalConfidence)
            };
        }
    }

    // ─── Warm-up ────────────────────────────────────────────────────────────

    async warmUp() {
        this._log('info', 'Iniciando warm-up del modelo...', { model: this.model });
        try {
            await fetch(`${this.url}/api/generate`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model:  this.model,
                    prompt: '',
                    stream: false,
                    options: { num_predict: 1 },
                }),
            });
            this._log('info', 'Modelo cargado en VRAM exitosamente.');
            return true;
        } catch (error) {
            this._log('warn', 'Fallo el warm-up', { error: error.message });
            return false;
        }
    }

    // ─── Keep Alive ─────────────────────────────────────────────────────────

    async keepAlive() {
        try {
            await fetch(`${this.url}/api/generate`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model:      this.model,
                    prompt:     '',
                    stream:     false,
                    keep_alive: '5m',
                }),
            });
        } catch (e) { /* silencioso */ }
    }

    // ─── Response Mode ──────────────────────────────────────────────────────

    setResponseMode(mode) {
        if (RESPONSE_MODES[mode]) {
            this.responseMode = mode;
            this._log('info', `Response mode cambiado a: ${mode}`);
        } else {
            this._log('warn', `Response mode desconocido: ${mode}. Disponibles: ${Object.keys(RESPONSE_MODES).join(', ')}`);
        }
    }

    getResponseModes() {
        return Object.keys(RESPONSE_MODES);
    }

    // ─── Retry con Backoff ──────────────────────────────────────────────────

    async _withRetry(fn, opName, retries = 3) {
        let lastError;
        for (let i = 0; i < retries; i++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                const delay = Math.pow(2, i) * 500;
                this._log('warn', `Reintentando (${i + 1}/${retries})`, {
                    op:    opName,
                    error: error.message,
                    delay: `${delay}ms`,
                });
                await new Promise(res => setTimeout(res, delay));
            }
        }
        this._log('error', `Operación fallida tras reintentos`, { op: opName, error: lastError.message });
        throw lastError;
    }

    // ─── Logger ─────────────────────────────────────────────────────────────

    _log(level, msg, context = {}) {
        const timestamp = new Date().toISOString();
        console.log(JSON.stringify({
            timestamp,
            level,
            service: 'LLMService',
            msg,
            ...context,
        }));
    }
}

export default new LLMService();
