/**
 * RerankingService v1.0 — Plastitec AI
 *
 * Reranker puramente léxico-semántico en Node.js puro.
 * No requiere Python, ONNX, ni dependencias externas.
 *
 * Combina:
 *   1. BM25 local (término-frecuencia + IDF estimado)
 *   2. Keyword density score
 *   3. Exact phrase boost
 *   4. Section title relevance
 *   5. Acronym / entity exact-match boost
 *   6. RRF score semántico previo
 */

// ─── Constantes BM25 ───────────────────────────────────────────────────────

const BM25_K1 = 1.5;   // Saturación de frecuencia de término
const BM25_B  = 0.75;  // Penalización por longitud de documento
const AVG_DOC_LEN = 400; // Longitud promedio estimada de un chunk en caracteres

// ─── Frases de dominio Plastitec ───────────────────────────────────────────

const DOMAIN_EXACT_PHRASES = [
    // BPM / Higiene
    'cofia', 'polainas', 'overol', 'escafandra', 'uniforme', 'ropa de calle',
    'bolsa de polietileno', 'lavado de manos', 'hipoclorito', 'maquillaje',
    'visitantes', 'buenas prácticas de manufactura',
    // SST / COPASST
    'copasst', 'sg-sst', 'sgsst', 'sistema de gestión', 'salud en el trabajo',
    'seguridad y salud', 'comité paritario', 'epp', 'equipo de protección',
    'accidente de trabajo', 'riesgo laboral',
    // Corporativo
    'misión', 'visión', 'valores corporativos', 'cultura organizacional',
    'plastitec', 'sagrilaft', 'oea',
    // RRHH
    'reglamento interno', 'datos prohibidos', 'datos personales',
    'contrato de aprendizaje', 'aprendiz sena',
    // Salud Integral
    'salud integral', 'salud física', 'salud mental', 'salud social',
    // ── Código de Ética (Fase 2.4.2) ────────────────────────────────────────
    'código de ética', 'codigo de etica',
    'conducta ética', 'conducta etica',
    'conflicto de interés', 'conflicto de interes',
    'canal ético', 'canal etico',
    'principios éticos', 'principios eticos',
    'integridad', 'transparencia corporativa',
    'comportamiento ético', 'comportamiento etico',
    'medidas disciplinarias', 'denuncia ética',
    // ── SAGRILAFT / LAFT (Fase 2.4.2) ───────────────────────────────────────
    'lavado de activos', 'financiación del terrorismo', 'financiacion del terrorismo',
    'financiamiento del terrorismo', 'riesgo laft', 'prevención laft',
    'autocontrol', 'riesgo integral', 'la/ft', 'laft',
    'proliferación de armas', 'ofac',
];

// ── Keywords de dominio para boost especializado (Fase 2.4.2) ───────────────
const ETHICS_DOMAIN_KEYWORDS = [
    'etica', 'etico', 'etica', 'conducta', 'integridad', 'transparencia',
    'conflicto', 'soborno', 'corrupcion', 'regalo', 'denuncia',
    'canal etico', 'codigo de etica', 'principios', 'comportamiento',
];
const SAGRILAFT_DOMAIN_KEYWORDS = [
    'sagrilaft', 'laft', 'la/ft', 'lavado', 'activos', 'financiacion',
    'terrorismo', 'autocontrol', 'ofac', 'riesgo laft', 'riesgo integral',
];
const ETHICS_DOC_MARKERS   = ['i-rh-017', 'etica', 'codigo de etica', 'codigo'];
const SAGRILAFT_DOC_MARKERS = ['i-rh-017', 'etica', 'rit', 'reglamento'];

const ACRONYM_TERMS = ['copasst', 'sg-sst', 'sgsst', 'sagrilaft', 'oea', 'bpm', 'bpmm', 'rit', 'epp'];


// ─── Stopwords en español ───────────────────────────────────────────────────

const STOPWORDS = new Set([
    'el', 'la', 'los', 'las', 'de', 'del', 'que', 'como', 'puede', 'pueden',
    'durante', 'empresa', 'para', 'por', 'una', 'un', 'en', 'y', 'es', 'se',
    'su', 'sus', 'con', 'al', 'lo', 'no', 'si', 'más', 'pero', 'o', 'qué',
    'cuál', 'cuáles', 'cómo', 'debe', 'deben', 'son', 'hay', 'entre', 'sobre',
    'este', 'esta', 'estos', 'estas', 'ser', 'tiene', 'tienen', 'vez', 'según',
    'cual', 'cuales', 'como', 'qué', 'que', 'cuál', 'cuales'
]);

// ─── Clase principal ────────────────────────────────────────────────────────

class RerankingService {

    /**
     * Reordena candidatos RAG usando scoring multi-factor.
     *
     * @param {Array}  candidates - Array de resultados con { id, score, payload, rrfScore, searchType }
     * @param {string} query      - Query original del usuario
     * @param {Array}  keywords   - Keywords extraídas de la query
     * @param {object} docPriority - { boost: [], penalize: [] } para documentos prioritarios
     * @param {Array}  foundAcronyms - Acrónimos detectados en la query original
     * @returns {Array} - Candidatos reordenados con `finalScore` y detalle de scoring
     */
    rerank(candidates, query, keywords, docPriority = { boost: [], penalize: [] }, foundAcronyms = []) {
        if (!candidates || candidates.length === 0) return [];

        const queryLower   = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const keywordsNorm = keywords.map(k => this._normalize(k));

        // Calcular IDF estimado usando todos los candidatos como corpus
        const idfMap = this._estimateIDF(candidates, keywordsNorm);

        const scored = candidates.map(candidate => {
            const text       = candidate.payload?.texto_original || '';
            const textNorm   = this._normalize(text);
            const source     = (candidate.payload?.fuente || '').toLowerCase();
            const sectionTitle = (candidate.payload?.section_title || candidate.payload?.metadata?.section_title || '').toLowerCase();
            const rrfScore   = candidate.rrfScore || 0;

            // 1. BM25 Score
            const bm25 = this._bm25Score(textNorm, keywordsNorm, idfMap);

            // 2. Keyword Density — % de keywords presentes en el texto
            const kwPresent   = keywordsNorm.filter(kw => textNorm.includes(kw)).length;
            const kwDensity   = keywordsNorm.length > 0 ? kwPresent / keywordsNorm.length : 0;

            // 3. Exact Phrase Boost
            const phraseBoost = this._exactPhraseBoost(queryLower, textNorm);

            // 4. Acronym Exact Match Boost
            const acronymBoost = this._acronymBoost(foundAcronyms, textNorm);

            // 5. Section Title Relevance
            const sectionBoost = this._sectionRelevanceBoost(keywordsNorm, sectionTitle, textNorm);

            // 6. Document Priority Boost/Penalize
            let docBoost = 0;
            let boostReason = '';
            if (docPriority.boost.some(b => source.includes(b))) {
                docBoost = 0.25;
                boostReason = `DocBoost:${source}`;
            }
            if (docPriority.penalize.some(p => source.includes(p))) {
                docBoost = -0.25;
                boostReason = `DocPenalty:${source}`;
            }

            // 7. Proximidad de keywords en texto (pares de keywords cercanas = más relevante)
            const proximityScore = this._keywordProximityScore(textNorm, keywordsNorm);

            // 8. Domain-Specific Boost — Ética / SAGRILAFT (Fase 2.4.2)
            const domainBoost = this._domainSpecificBoost(queryLower, source, textNorm);

            // Boost trackers
            const phraseActive  = phraseBoost > 0;
            const acronymActive = acronymBoost > 0;
            const sectionActive = sectionBoost > 0;
            const domainActive  = domainBoost > 0;
            if (phraseActive)  boostReason = boostReason || `Phrase`;
            if (acronymActive) boostReason = boostReason || `Acronym`;
            if (sectionActive) boostReason = boostReason || `Section`;
            if (domainActive)  boostReason = boostReason || `DomainBoost`;

            // ── Fórmula final combinada ────────────────────────────────────
            // Pesos calibrados para documentos SST/RRHH en español
            const finalScore = (
                (rrfScore * 10  * 0.35) +   // Semántico (RRF base)
                (bm25           * 0.25) +   // BM25 léxico
                (kwDensity      * 0.20) +   // Cobertura de keywords
                (phraseBoost    * 0.50) +   // Frases exactas de dominio
                (acronymBoost   * 0.50) +   // Acrónimos exactos
                (sectionBoost   * 0.30) +   // Relevancia de título de sección
                (proximityScore * 0.10) +   // Proximidad de keywords
                docBoost                    // Boost/penalización de documento
            );

            return {
                ...candidate,
                finalScore:    Math.max(0, finalScore),
                keywordScore:  kwDensity, // Para retrievalConfidence
                boosted:       phraseActive || acronymActive || sectionActive || domainActive || docBoost > 0,
                boostReason,
                scoreDetail: {
                    rrf:        (rrfScore * 10 * 0.35).toFixed(4),
                    bm25:       (bm25 * 0.25).toFixed(4),
                    kwDensity:  (kwDensity * 0.20).toFixed(4),
                    phrase:     (phraseBoost * 0.50).toFixed(4),
                    acronym:    (acronymBoost * 0.50).toFixed(4),
                    section:    (sectionBoost * 0.30).toFixed(4),
                    proximity:  (proximityScore * 0.10).toFixed(4),
                    domain:     domainBoost.toFixed(4),
                    docBoost:   docBoost.toFixed(4),
                }
            };
        });

        return scored.sort((a, b) => b.finalScore - a.finalScore);
    }

    // ─── Domain-Specific Boost (Fase 2.4.2) ─────────────────────────────────────

    /**
     * Aplica un boost especializado cuando la query es claramente de dominio
     * Ética o SAGRILAFT Y el chunk pertenece a esos documentos.
     *
     * Boost: +0.45 (mayor que el DocBoost genérico de 0.25)
     * Esto permite que los chunks correctos escalen al Top-1/Top-3.
     */
    _domainSpecificBoost(queryNorm, sourceNorm, textNorm) {
        // ── Ethics Boost ───────────────────────────────────────────────
        const queryIsEthics = ETHICS_DOMAIN_KEYWORDS.some(kw => queryNorm.includes(kw));
        const sourceIsEthics = ETHICS_DOC_MARKERS.some(m => sourceNorm.includes(m));
        if (queryIsEthics && sourceIsEthics) {
            return 0.45; // Strong ethics-doc boost
        }
        // Boost parcial: el texto habla de ética aunque la query sea general
        if (queryIsEthics && ETHICS_DOMAIN_KEYWORDS.some(kw => textNorm.includes(kw))) {
            return 0.20;
        }

        // ── SAGRILAFT Boost ───────────────────────────────────────────
        const queryIsSagrilaft = SAGRILAFT_DOMAIN_KEYWORDS.some(kw => queryNorm.includes(kw));
        const sourceIsSagrilaft = SAGRILAFT_DOC_MARKERS.some(m => sourceNorm.includes(m));
        if (queryIsSagrilaft && sourceIsSagrilaft) {
            return 0.45; // Strong SAGRILAFT-doc boost
        }
        // Boost parcial: texto habla de SAGRILAFT aunque la fuente sea genérica
        if (queryIsSagrilaft && SAGRILAFT_DOMAIN_KEYWORDS.some(kw => textNorm.includes(kw))) {
            return 0.20;
        }

        return 0;
    }

    /**
     * Calcula un score BM25 aproximado para un documento dado keywords.
     */
    _bm25Score(textNorm, keywords, idfMap) {
        const words   = textNorm.split(/\s+/).filter(w => w.length > 1);
        const docLen  = words.length;
        const freqMap = {};
        for (const w of words) {
            freqMap[w] = (freqMap[w] || 0) + 1;
        }

        let score = 0;
        for (const kw of keywords) {
            const tf  = freqMap[kw] || 0;
            const idf = idfMap[kw] || 0.5; // Default IDF bajo para términos muy comunes
            const tfNorm = (tf * (BM25_K1 + 1)) / (tf + BM25_K1 * (1 - BM25_B + BM25_B * (docLen / AVG_DOC_LEN)));
            score += idf * tfNorm;
        }
        return Math.min(score / Math.max(keywords.length, 1), 1.0); // Normalizar a [0,1]
    }

    /**
     * Estima IDF de cada keyword usando el corpus de candidatos.
     */
    _estimateIDF(candidates, keywords) {
        const N = candidates.length || 1;
        const idfMap = {};
        for (const kw of keywords) {
            const df = candidates.filter(c => {
                const t = this._normalize(c.payload?.texto_original || '');
                return t.includes(kw);
            }).length;
            // IDF suavizado: log((N - df + 0.5) / (df + 0.5) + 1)
            idfMap[kw] = Math.log((N - df + 0.5) / (df + 0.5) + 1);
        }
        return idfMap;
    }

    // ─── Phrase Boost ──────────────────────────────────────────────────────

    _exactPhraseBoost(queryNorm, textNorm) {
        let boost = 0;
        for (const phrase of DOMAIN_EXACT_PHRASES) {
            const phraseNorm = this._normalize(phrase);
            if (queryNorm.includes(phraseNorm) && textNorm.includes(phraseNorm)) {
                boost += 0.60;
            } else if (textNorm.includes(phraseNorm) && queryNorm.split(' ').some(w => phraseNorm.includes(w))) {
                // Boost parcial: la frase está en el texto y al menos una palabra de la query la toca
                boost += 0.20;
            }
        }
        return Math.min(boost, 1.0); // Techo de 1.0
    }

    // ─── Acronym Boost ─────────────────────────────────────────────────────

    _acronymBoost(foundAcronyms, textNorm) {
        let boost = 0;
        for (const acr of foundAcronyms) {
            const acrNorm = this._normalize(acr);
            if (textNorm.includes(acrNorm)) {
                boost += 0.60;
                break; // Un acrónimo es suficiente
            }
        }
        return boost;
    }

    // ─── Section Relevance ──────────────────────────────────────────────────

    /**
     * Boost si el título de sección del chunk contiene keywords de la query.
     * Los documentos SST tienen secciones como "FUNCIONES DEL COPASST" — si
     * una pregunta sobre COPASST recupera ese chunk, el título confirma relevancia.
     */
    _sectionRelevanceBoost(keywordsNorm, sectionTitle, textNorm) {
        if (!sectionTitle) {
            // Detectar si la primera línea del chunk parece un título (corta, mayúsculas)
            const firstLine = textNorm.split('\n')[0].trim();
            if (firstLine.length > 3 && firstLine.length < 80 && firstLine === firstLine.toUpperCase()) {
                sectionTitle = firstLine.toLowerCase();
            }
        }
        if (!sectionTitle) return 0;

        const titleNorm = this._normalize(sectionTitle);
        const matches   = keywordsNorm.filter(kw => titleNorm.includes(kw)).length;
        return matches > 0 ? Math.min(matches * 0.30, 0.90) : 0;
    }

    // ─── Keyword Proximity ──────────────────────────────────────────────────

    /**
     * Score basado en cuántas keywords aparecen juntas (dentro de una ventana de 50 palabras).
     */
    _keywordProximityScore(textNorm, keywords) {
        if (keywords.length < 2) return 0;
        const words   = textNorm.split(/\s+/);
        const WINDOW  = 50;
        let maxScore  = 0;

        for (let i = 0; i < words.length - WINDOW; i++) {
            const window = words.slice(i, i + WINDOW).join(' ');
            const found  = keywords.filter(kw => window.includes(kw)).length;
            const ratio  = found / keywords.length;
            if (ratio > maxScore) maxScore = ratio;
        }
        return maxScore;
    }

    // ─── Normalización ──────────────────────────────────────────────────────

    /**
     * Normaliza texto: minúsculas, sin acentos, sin puntuación especial.
     */
    _normalize(text) {
        return text
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Quitar diacríticos
            .replace(/[¿?¡!.,;:()\[\]{}"']/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
}

export default new RerankingService();
