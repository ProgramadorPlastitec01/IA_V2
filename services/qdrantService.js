/**
 * QdrantService v4.0 — Plastitec AI
 *
 * Mejoras:
 *   - Índices para: fuente, chunk_index, metadata.category, metadata.ocr_used
 *   - searchKeyword() con scoring por frecuencia de términos (TF simulado)
 *   - score_threshold: 0.1 → 0.25
 *   - searchByFilter() para recuperar todos los chunks de una fuente
 *   - Mejor logging de operaciones
 */

import dotenv from 'dotenv';
import embeddingsService from './embeddingsService.js';

dotenv.config();

class QdrantService {
    constructor() {
        this.url        = process.env.QDRANT_URL        || 'http://localhost:6333';
        this.collection = process.env.QDRANT_COLLECTION || 'rrhh_docs';
    }

    // ─── Gestión de colección ──────────────────────────────────────────────

    async deleteCollection() {
        this._log('warn', `Eliminando colección ${this.collection}...`);
        const response = await fetch(`${this.url}/collections/${this.collection}`, {
            method: 'DELETE',
        });
        return response.ok;
    }

    /**
     * Crea la colección con configuración HNSW y los índices necesarios.
     * Idempotente: no falla si ya existe.
     */
    async createCollectionIfNotExists(vectorSize = null) {
        const finalVectorSize = vectorSize || embeddingsService.getEmbeddingDimension();

        return await this._withRetry(async () => {
            // ── Verificar si la colección existe ─────────────────────────
            const checkResp = await fetch(`${this.url}/collections/${this.collection}`);

            if (!checkResp.ok && checkResp.status !== 404) {
                throw new Error(`Error al verificar Qdrant: ${checkResp.statusText}`);
            }

            // ── Crear si no existe ────────────────────────────────────────
            if (checkResp.status === 404) {
                this._log('info', 'Creando colección con HNSW optimizado', { size: finalVectorSize });
                const createResp = await fetch(`${this.url}/collections/${this.collection}`, {
                    method:  'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        vectors: {
                            size:     finalVectorSize,
                            distance: 'Cosine',
                        },
                        optimizers_config: { default_segment_number: 2 },
                        hnsw_config:       { m: 16, ef_construct: 100 },
                    }),
                });
                if (!createResp.ok) throw new Error(await createResp.text());
            }

            // ── Crear/verificar índices ───────────────────────────────────
            await this._ensureIndexes();

            this._log('info', 'Colección e índices verificados/creados');
            return true;

        }, 'createCollectionIfNotExists');
    }

    /**
     * Crea todos los índices de payload necesarios para búsqueda eficiente.
     * Qdrant devuelve error silencioso si el índice ya existe.
     */
    async _ensureIndexes() {
        const indexDefs = [
            // Full-text index para búsqueda léxica en contenido
            {
                field_name:   'texto_original',
                field_schema: {
                    type:          'text',
                    tokenizer:     'word',
                    min_token_len: 2,
                    max_token_len: 25,
                    lowercase:     true,
                },
            },
            // Keyword index para filtrar por archivo fuente
            {
                field_name:   'fuente',
                field_schema: 'keyword',
            },
            // Integer index para recuperación de chunks vecinos
            {
                field_name:   'chunk_index',
                field_schema: 'integer',
            },
            // Keyword index para filtrar por categoría
            {
                field_name:   'metadata.category',
                field_schema: 'keyword',
            },
            // Bool index para filtrar chunks con OCR
            {
                field_name:   'metadata.ocr_used',
                field_schema: 'bool',
            },
            // Keyword index para filtrar por tipo de documento
            {
                field_name:   'metadata.doc_type',
                field_schema: 'keyword',
            },
        ];

        for (const indexDef of indexDefs) {
            try {
                await fetch(`${this.url}/collections/${this.collection}/index`, {
                    method:  'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify(indexDef),
                });
            } catch (e) {
                // No crítico: el índice puede ya existir
                this._log('warn', `Índice ${indexDef.field_name}: ${e.message}`);
            }
        }
    }

    // ─── Inserción ──────────────────────────────────────────────────────────

    async upsertBatch(items) {
        const points = items.map(item => {
            if (!item.payload.texto_original) {
                throw new Error('[QdrantService] Falta texto_original en el item.');
            }
            return {
                id:      item.id,
                vector:  item.vector,
                payload: {
                    ...item.payload,
                    indexed_at: new Date().toISOString(),
                },
            };
        });

        return await this._withRetry(async () => {
            const response = await fetch(
                `${this.url}/collections/${this.collection}/points?wait=true`,
                {
                    method:  'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ points }),
                }
            );
            if (!response.ok) throw new Error(await response.text());
            return await response.json();
        }, 'upsertBatch');
    }

    // ─── Búsqueda Semántica ─────────────────────────────────────────────────

    /**
     * Búsqueda vectorial (semántica) con threshold ajustado.
     */
    async searchSimilar(vector, topK = 20, collectionOverride = null) {
        const collectionToUse = collectionOverride || this.collection;
        return await this._withRetry(async () => {
            const response = await fetch(
                `${this.url}/collections/${collectionToUse}/points/search`,
                {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        vector,
                        limit:           topK,
                        with_payload:    true,
                        score_threshold: 0.25, // Subido de 0.10 para eliminar ruido
                    }),
                }
            );

            if (!response.ok) throw new Error(await response.text());
            const result = await response.json();
            return result.result || [];

        }, 'searchSimilar');
    }

    // ─── Búsqueda por Palabras Clave ───────────────────────────────────────

    /**
     * Búsqueda léxica mejorada.
     * Devuelve resultados con score basado en la cantidad de términos presentes.
     * Reemplaza el score fijo 0.8 anterior.
     *
     * Estrategia:
     *   1. Buscar cada término individualmente via full-text match
     *   2. Agregar resultados con score ponderado por cantidad de matches
     *   3. Deduplicar y ordenar por score
     */
    async searchKeyword(query, topK = 15, collectionOverride = null) {
        const collectionToUse = collectionOverride || this.collection;
        if (!query || query.trim().length === 0) return [];

        const terms = this._tokenizeQuery(query);
        if (terms.length === 0) return [];

        return await this._withRetry(async () => {
            // Buscar con todos los términos como match de texto
            const fullQuery = terms.join(' ');

            const response = await fetch(
                `${this.url}/collections/${collectionToUse}/points/scroll`,
                {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filter: {
                            should: terms.map(t => ({
                                key:   'texto_original',
                                match: { text: t },
                            })),
                        },
                        limit:        topK * 2, // Traer más para poder puntuar
                        with_payload: true,
                    }),
                }
            );

            if (!response.ok) throw new Error(await response.text());
            const result = await response.json();
            const points = result.result?.points || [];

            // Calcular score real por frecuencia de términos
            const scored = points.map(p => {
                const textNorm = (p.payload?.texto_original || '').toLowerCase()
                    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

                let matchCount = 0;
                let termScore  = 0;

                for (const term of terms) {
                    const termNorm = term.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                    // Contar ocurrencias del término
                    const occurrences = (textNorm.match(new RegExp(termNorm, 'g')) || []).length;
                    if (occurrences > 0) {
                        matchCount++;
                        // TF simple: log(1 + freq) normalizado
                        termScore += Math.log1p(occurrences);
                    }
                }

                // Score: % de términos presentes * TF normalizado
                const coverage  = terms.length > 0 ? matchCount / terms.length : 0;
                const tfNorm    = Math.min(termScore / terms.length, 1.0);
                const finalScore = (coverage * 0.7) + (tfNorm * 0.3);

                return {
                    id:      p.id,
                    score:   finalScore,
                    payload: p.payload,
                };
            })
            .filter(r => r.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);

            return scored;

        }, 'searchKeyword');
    }

    // ─── Búsqueda Exacta de Frase ──────────────────────────────────────────

    /**
     * Búsqueda léxica enfocada en coincidencia exacta de frase.
     * @param {string} phrase La frase exacta a buscar.
     * @param {number} topK Límite de resultados.
     */
    async searchExactPhrase(phrase, topK = 15, collectionOverride = null) {
        const collectionToUse = collectionOverride || this.collection;
        if (!phrase || phrase.trim().length === 0) return [];
        const cleanPhrase = phrase.trim().toLowerCase();

        return await this._withRetry(async () => {
            const response = await fetch(
                `${this.url}/collections/${collectionToUse}/points/scroll`,
                {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filter: {
                            must: [
                                {
                                    key:   'texto_original',
                                    match: { text: phrase },
                                },
                            ],
                        },
                        limit:        topK * 2,
                        with_payload: true,
                    }),
                }
            );

            if (!response.ok) throw new Error(await response.text());
            const result = await response.json();
            const points = result.result?.points || [];

            // Puntuar si la frase exacta existe
            const scored = points.map(p => {
                const textNorm = (p.payload?.texto_original || '').toLowerCase();
                let score = 0;
                
                if (textNorm.includes(cleanPhrase)) {
                    score = 1.0;
                } else {
                    // Partial match fallback if words are present close to each other
                    const words = cleanPhrase.split(/\s+/);
                    let matchCount = 0;
                    for (const word of words) {
                        if (textNorm.includes(word)) matchCount++;
                    }
                    score = (matchCount / words.length) * 0.5;
                }

                return {
                    id:      p.id,
                    score:   score,
                    payload: p.payload,
                };
            })
            .filter(r => r.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);

            return scored;

        }, 'searchExactPhrase');
    }

    // ─── Recuperación de Vecinos ─────────────────────────────────────────────

    /**
     * Recupera chunks por fuente e índices específicos (neighbor retrieval).
     */
    async fetchPointsByIndices(source, indices) {
        if (!indices || indices.length === 0) return [];

        return await this._withRetry(async () => {
            const response = await fetch(
                `${this.url}/collections/${this.collection}/points/scroll`,
                {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filter: {
                            must: [
                                { key: 'fuente', match: { value: source } },
                                {
                                    should: indices.map(idx => ({
                                        key:   'chunk_index',
                                        match: { value: idx },
                                    })),
                                },
                            ],
                        },
                        with_payload: true,
                        limit:        Math.max(indices.length + 5, 25),
                    }),
                }
            );

            if (!response.ok) throw new Error(await response.text());
            const result = await response.json();
            return (result.result?.points || []).map(p => p.payload);

        }, 'fetchPointsByIndices');
    }

    /**
     * Recupera todos los chunks de una fuente específica (ordenados por chunk_index).
     * Útil para reconstrucción de contexto completo.
     */
    async fetchAllChunksFromSource(source) {
        return await this._withRetry(async () => {
            const response = await fetch(
                `${this.url}/collections/${this.collection}/points/scroll`,
                {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filter: {
                            must: [{ key: 'fuente', match: { value: source } }],
                        },
                        with_payload: true,
                        limit:        500,
                    }),
                }
            );

            if (!response.ok) throw new Error(await response.text());
            const result = await response.json();
            const points = result.result?.points || [];
            return points
                .map(p => p.payload)
                .sort((a, b) => (a.chunk_index || 0) - (b.chunk_index || 0));

        }, 'fetchAllChunksFromSource');
    }

    /**
     * Cuenta el total de puntos en la colección.
     */
    async countPoints() {
        try {
            const response = await fetch(`${this.url}/collections/${this.collection}`);
            if (!response.ok) return 0;
            const data = await response.json();
            return data.result?.points_count || 0;
        } catch {
            return 0;
        }
    }

    // ─── Utilidades ──────────────────────────────────────────────────────────

    /**
     * Tokeniza una query para búsqueda léxica.
     * Elimina stopwords y palabras muy cortas.
     */
    _tokenizeQuery(query) {
        const STOPWORDS = new Set([
            'cual', 'cuales', 'como', 'que', 'son', 'los', 'las', 'para',
            'con', 'del', 'una', 'uno', 'por', 'mas', 'sus', 'este',
            'esta', 'hay', 'el', 'la', 'de', 'en', 'y', 'es', 'se',
        ]);

        return query
            .replace(/[¿?¡!.,;:()"']/g, ' ')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 2 && !STOPWORDS.has(w));
    }

    /**
     * Reintento con backoff exponencial.
     */
    async _withRetry(fn, opName, retries = 3) {
        let lastError;
        for (let i = 0; i < retries; i++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                const delay = Math.pow(2, i) * 500;
                this._log('warn', `Reintento ${i+1}/${retries} en ${opName}`, { error: error.message });
                await new Promise(res => setTimeout(res, delay));
            }
        }
        throw lastError;
    }

    _log(level, msg, ctx = {}) {
        const ctxStr = Object.keys(ctx).length ? ` ${JSON.stringify(ctx)}` : '';
        console.log(`[Qdrant][${level.toUpperCase()}] ${msg}${ctxStr}`);
    }
}

export default new QdrantService();
