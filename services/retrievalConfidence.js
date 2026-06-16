// ─── Stopwords en español para cálculo de especificidad ─────────────────────
const SPECIFICITY_STOPWORDS = new Set([
    'el', 'la', 'los', 'las', 'de', 'del', 'en', 'y', 'o',
    'un', 'una', 'es', 'son', 'qué', 'que', 'cuál', 'cual',
    'cómo', 'como', 'me', 'mi', 'se', 'por', 'para', 'con',
    'si', 'al', 'le', 'hay',
]);

// ─── Vocabulario de la Domain Referent Rule ──────────────────────────────────

// Palabras interrogativas (con y sin acento, tal como puede escribirlas el usuario)
const INTERROGATIVE_WORDS = new Set([
    'qué', 'que', 'cómo', 'como', 'cuál', 'cual', 'cuáles', 'cuales',
    'cuándo', 'cuando', 'dónde', 'donde', 'quién', 'quien', 'quiénes', 'quienes',
    'cuánto', 'cuanto', 'cuánta', 'cuanta', 'cuántos', 'cuantos', 'cuántas', 'cuantas',
    'porqué', 'porque',
]);

// Raíces de verbos de acción/solicitud — cubren conjugaciones comunes
// (reportar/reporto/reporte, solicitar/solicito, pedir/pido, hacer/hago/haga,
//  presentar/presento, tramitar/tramito)
const ACTION_VERB_ROOTS = [
    'report', 'solicit', 'pedir', 'pido', 'pide', 'hacer', 'hago', 'hace', 'haga',
    'present', 'tramit',
];

// Sustantivos-documento: nombran el TIPO de documento pero no aportan dominio
// por sí solos ("Política.", "Reglas y procedimientos." son vagas).
const DOCUMENT_NOUNS = new Set([
    'política', 'politica', 'reglas', 'regla', 'reglamento',
    'procedimiento', 'procedimientos', 'protocolo', 'normas', 'norma',
    'requisitos', 'instructivo', 'manual', 'pasos',
]);

// Referentes genéricos: palabras tan ubicuas en el corpus que NO constituyen
// un referente válido para anclar una pregunta ("¿Cuál es la política?").
const GENERIC_REFERENTS = new Set([
    'política', 'politica', 'información', 'informacion', 'reglas',
    'procedimiento', 'esto', 'eso', 'tema', 'cosa', 'algo', 'documento', 'ayuda',
]);

class RetrievalConfidenceEngine {
    /**
     * Calcula la confianza de retrieval para el resultado de una query.
     *
     * El score final combina dos capas:
     *
     * CAPA 1 — Confidence Base:
     *   confidence = (similarity × 0.45) + (keywordDensity × 0.25)
     *              + hasPhraseMatch    ? 0.15 : 0
     *              + hasAcronymMatch   ? 0.10 : 0
     *              + hasSectionRelevance ? 0.05 : 0
     *
     *   Fast Reject Semántico: si keywordDensity == 0 AND !hasPhraseMatch
     *   AND !hasAcronymMatch → confidence × 0.5
     *
     * CAPA 2 — Domain Referent Rule (unifica las antiguas Capas 2 y 3):
     *
     *   DECISIÓN DE PRODUCTO (2026-06-12): el asistente RESPONDE queries
     *   vagas-pero-respondibles ("Horarios.", "Reglas de higiene.") con
     *   contenido citado del corpus. Solo se rechazan queries SIN ningún
     *   referente de dominio ("¿Cuál es la política?", "¿Qué hago con esto?").
     *
     *   REFERENTE DE DOMINIO: token significativo que NO está en ninguna de:
     *     - SPECIFICITY_STOPWORDS
     *     - INTERROGATIVE_WORDS
     *     - ACTION_VERB_ROOTS (match por prefijo)
     *     - DOCUMENT_NOUNS
     *     - GENERIC_REFERENTS
     *
     *   Regla:
     *     hasAcronymMatch === true → sin penalización (bypass, precedencia total)
     *     domainReferents >= 1     → sin penalización estructural
     *     domainReferents === 0    → confidence × 0.3
     *
     * @param {Object}  params
     * @param {number}  params.similarity          Score de similitud vectorial (0-1)
     * @param {number}  params.keywordDensity      Densidad de keywords en top chunk (0-1)
     * @param {boolean} params.hasPhraseMatch      Si hubo match de frase exacta de dominio
     * @param {boolean} params.hasAcronymMatch     Si hubo match de acrónimo corporativo
     * @param {boolean} params.hasSectionRelevance Si el título de sección es relevante
     * @param {string}  [params.query='']          Query original del usuario
     * @returns {{
     *   confidence: number,
     *   querySpecificityTokens: number,
     *   domainReferents: number,
     *   vaguenessFlags: string[]
     * }}
     */
    calculateConfidence({
        similarity        = 0,
        keywordDensity    = 0,
        hasPhraseMatch    = false,
        hasAcronymMatch   = false,
        hasSectionRelevance = false,
        query             = '',
    }) {
        // ── CAPA 1: Confidence Base (fórmula original intacta) ────────────────

        let confidence = (similarity * 0.45) + (keywordDensity * 0.25);

        if (hasPhraseMatch) {
            confidence += 0.15;
        }

        if (hasAcronymMatch) {
            confidence += 0.10;
        }

        if (hasSectionRelevance) {
            confidence += 0.05;
        }

        // Fast Reject Semántico (Layer 1 — original)
        // Si no hay densidad léxica ni frase exacta ni acrónimo → 100% semántico.
        // Penalizamos para evitar falsos positivos de embeddings.
        if (keywordDensity === 0 && !hasPhraseMatch && !hasAcronymMatch) {
            confidence *= 0.5;
        }

        // ── CAPA 2: Domain Referent Rule ──────────────────────────────────────

        const querySpecificityTokens = this._countSignificantTokens(query);

        const rawTokens = this._tokenize(query);
        const domainReferents = rawTokens.filter(t =>
            !SPECIFICITY_STOPWORDS.has(t) &&
            !INTERROGATIVE_WORDS.has(t) &&
            !DOCUMENT_NOUNS.has(t) &&
            !GENERIC_REFERENTS.has(t) &&
            !ACTION_VERB_ROOTS.some(root => t.startsWith(root))
        ).length;

        const vaguenessFlags = [];

        if (hasAcronymMatch) {
            // Bypass: un acrónimo corporativo ya es altamente específico por definición.
            console.log(`[ConfidenceEngine] Bypass acrónimo corporativo (referentes: ${domainReferents})`);
        } else if (domainReferents === 0) {
            confidence *= 0.3;
            vaguenessFlags.push('NO_DOMAIN_REFERENT');
            console.log('[ConfidenceEngine] Sin referente de dominio → penalización × 0.3');
        }
        // domainReferents >= 1 → sin penalización estructural

        // ── Clamp final ───────────────────────────────────────────────────────
        return {
            confidence:             Math.min(Math.max(confidence, 0.00), 1.00),
            querySpecificityTokens,
            domainReferents,
            vaguenessFlags,
        };
    }

    /**
     * Tokeniza una query en minúsculas sin puntuación (incluye stopwords).
     *
     * @param {string} query
     * @returns {string[]}
     */
    _tokenize(query) {
        if (!query || typeof query !== 'string') return [];

        return query
            .toLowerCase()
            .replace(/[¿?¡!.,;:()\[\]{}"']/g, ' ')  // Eliminar puntuación
            .split(/\s+/)
            .filter(token => token.length > 0);
    }

    /**
     * Cuenta los tokens significativos de una query (excluye stopwords y puntuación).
     * Se mantiene como métrica informativa para logs y telemetría.
     *
     * @param {string} query
     * @returns {number} Cantidad de tokens significativos
     */
    _countSignificantTokens(query) {
        if (!query || typeof query !== 'string') return 0;

        return query
            .toLowerCase()
            .replace(/[¿?¡!.,;:()\[\]{}"']/g, ' ')  // Eliminar puntuación
            .split(/\s+/)
            .filter(token =>
                token.length > 0 &&
                !SPECIFICITY_STOPWORDS.has(token)
            ).length;
    }
}

export default new RetrievalConfidenceEngine();
