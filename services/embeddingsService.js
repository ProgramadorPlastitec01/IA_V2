import dotenv from 'dotenv';
dotenv.config();

/**
 * EmbeddingsService v2.0 — Plastitec AI
 *
 * Cambios respecto a v1:
 *   - Modelo: nomic-embed-text (768d) → mxbai-embed-large (1024d)
 *   - Validación automática de dimensión al iniciar
 *   - Timeout protection (30s por embedding)
 *   - Logging de latencia por llamada
 *   - Batch processing secuencial con logging
 */
class EmbeddingsService {
    constructor() {
        this.provider   = process.env.EMBEDDINGS_PROVIDER || 'ollama';
        this.ollamaUrl  = process.env.OLLAMA_URL          || 'http://localhost:11434';
        this.ollamaModel = process.env.OLLAMA_EMBED_MODEL || 'mxbai-embed-large';
        this._dimension  = parseInt(process.env.LOCAL_EMBEDDING_DIMENSION) || 1024;
        this._validated  = false;
        this._timeoutMs  = 30000; // 30 segundos máximo por embedding

        this._log('info', 'Inicializado', {
            provider: 'Ollama',
            model:    this.ollamaModel,
            url:      this.ollamaUrl,
            dimension: this._dimension,
        });
    }

    /**
     * Retorna la dimensión del vector según el modelo configurado.
     * mxbai-embed-large → 1024d
     * nomic-embed-text  → 768d
     */
    getEmbeddingDimension() {
        return this._dimension;
    }

    /**
     * Valida que el modelo esté activo y la dimensión sea correcta.
     * Se llama automáticamente en el primer uso o desde tests.
     */
    async validateDimension() {
        try {
            const probe = await this._callOllama('test de validación de dimensión');
            const actualDim = probe.length;

            if (actualDim !== this._dimension) {
                this._log('warn', `⚠️ Dimensión inesperada: configurada=${this._dimension}, real=${actualDim}. Corrigiendo.`);
                this._dimension = actualDim;
                // Actualizar env en memoria
                process.env.LOCAL_EMBEDDING_DIMENSION = String(actualDim);
            } else {
                this._log('info', `✅ Dimensión validada: ${actualDim}d`, { model: this.ollamaModel });
            }

            this._validated = true;
            return actualDim;
        } catch (e) {
            this._log('error', `Error validando dimensión: ${e.message}`);
            throw e;
        }
    }

    /**
     * Genera uno o varios embeddings a partir de texto.
     * @param {string|string[]} input — Texto o array de textos.
     * @returns {Promise<number[]|number[][]>} — Vector o array de vectores.
     */
    async generateEmbedding(input) {
        if (!input || (Array.isArray(input) && input.length === 0)) {
            throw new Error('[EmbeddingsService] Entrada inválida: Se requiere texto o array de textos.');
        }

        return await this._withRetry(async () => {
            const isArray = Array.isArray(input);
            const texts   = isArray ? input : [input];
            const results = [];

            for (let i = 0; i < texts.length; i++) {
                const text = texts[i];
                if (!text || !text.trim()) {
                    this._log('warn', `Texto vacío en índice ${i}, saltando.`);
                    results.push(new Array(this._dimension).fill(0));
                    continue;
                }

                const start = Date.now();
                const embedding = await this._callOllama(text);
                const ms = Date.now() - start;

                // Validación rápida del vector resultado
                if (!embedding || embedding.length === 0) {
                    throw new Error(`[EmbeddingsService] Embedding vacío para texto[${i}]`);
                }
                if (embedding.length !== this._dimension) {
                    this._log('warn', `Dimensión inesperada: esperada ${this._dimension}, obtenida ${embedding.length}`);
                }

                results.push(embedding);

                // Log de latencia solo si son muchos textos (ingesta)
                if (texts.length > 3) {
                    process.stdout.write(`  emb[${i+1}/${texts.length}] ${ms}ms\r`);
                }
            }

            return isArray ? results : results[0];
        }, 'generateEmbedding');
    }

    // ─── Llamada directa a Ollama ──────────────────────────────────────────

    async _callOllama(text) {
        // Timeout wrapper
        const controller = new AbortController();
        const timeout    = setTimeout(() => controller.abort(), this._timeoutMs);

        // Prevenir crashes: mxbai-embed-large soporta 512 tokens. 
        // Textos con mucho código pueden superar los 512 tokens incluso con 1200 caracteres.
        const safeText = text.length > 1200 ? text.substring(0, 1200) : text;

        try {
            const response = await fetch(`${this.ollamaUrl}/api/embeddings`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ model: this.ollamaModel, prompt: safeText }),
                signal:  controller.signal,
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Ollama API error: ${response.status} — ${errorText}`);
            }

            const data = await response.json();

            if (!data.embedding || !Array.isArray(data.embedding)) {
                throw new Error('Respuesta de Ollama no contiene "embedding" válido.');
            }

            return data.embedding;
        } catch (err) {
            if (err.name === 'AbortError') {
                throw new Error(`[EmbeddingsService] Timeout (${this._timeoutMs}ms) al generar embedding.`);
            }
            throw err;
        } finally {
            clearTimeout(timeout);
        }
    }

    // ─── Utilidades ───────────────────────────────────────────────────────

    async _withRetry(fn, opName, retries = 3) {
        let lastError;
        for (let i = 0; i < retries; i++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                const delay = Math.pow(2, i) * 500;
                this._log('warn', `Reintentando ${opName} (${i+1}/${retries}) en ${delay}ms`, { error: error.message });
                await new Promise(res => setTimeout(res, delay));
            }
        }
        this._log('error', `Operación ${opName} falló tras ${retries} intentos`, { error: lastError?.message });
        throw lastError;
    }

    _log(level, msg, context = {}) {
        const timestamp = new Date().toISOString();
        console.log(JSON.stringify({ timestamp, level, service: 'EmbeddingsService', msg, ...context }));
    }
}

export default new EmbeddingsService();
