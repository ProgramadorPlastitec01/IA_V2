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
    // Política de uso de dispositivos
    'celular', 'telefono celular', 'telefonos celulares', 'telefono movil',
    'dispositivos moviles', 'dispositivo movil',
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
    // Jornada laboral / horarios / horas extras (CAPITULO VII-VIII RIT)
    'jornada laboral', 'jornada de trabajo', 'horario de trabajo',
    'trabajo por turnos', 'turno de trabajo', 'jornada por turnos',
    'horas extras', 'hora extra', 'trabajo suplementario', 'trabajo nocturno',
    'recargo nocturno', 'jornada máxima', 'jornada maxima',
    'descanso remunerado', 'jornada flexible', 'horas semanales',
    'jornada sucesiva', 'horario administrativo', 'personal operativo',
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
    // ── Alcohol / Sustancias Psicoactivas (2026-08-03) ──────────────────────
    'estado de embriaguez', 'efectos del alcohol', 'sustancias psicoactivas',
    'sustancias sicoactivas', 'sustancia psicoactiva', 'ingesta de alcohol',
    // ── Acoso Laboral / Acoso Sexual (2026-08-03) ────────────────────────────
    'acoso laboral', 'acoso sexual', 'comité de convivencia laboral',
    'maltrato laboral', 'persecución laboral', 'contacto físico no solicitado',
    'favores sexuales', 'invitaciones o presiones',
    // ── Terminación con Justa Causa (2026-08-03) ─────────────────────────────
    'terminación con justa causa', 'justa causa', 'causales de terminación',
    // ── Teletrabajo / Trabajo Remoto (2026-08-03) ────────────────────────────
    'teletrabajo', 'teletrabajador', 'trabajo en casa', 'trabajo remoto',
    // ── Dotación Laboral / Uso Tecnología (2026-08-03) ───────────────────────
    'dotación laboral', 'suministro de dotación', 'calzado y vestido de labor',
    'uso de redes sociales', 'auditoría y monitoreo de herramientas tecnológicas',
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

// ── Admisión de Personal / Prohibiciones a Aspirantes (2026-08-14) ──────────
// Gap confirmado por pruebas NotebookLM: la pregunta "¿qué información está
// prohibido exigir a los aspirantes...?" recupera semánticamente chunks de
// confidencialidad (Art. 84/85, más cercanos por embedding) en vez del chunk
// correcto (Art. 2, Parágrafo Primero — estado civil, embarazo, VIH, libreta
// militar), que queda fuera del top-6 pese a tener buen BM25/keyword density.
// Mismo patrón que ETHICS/SAGRILAFT: la query pregunta por el TEMA general
// (aspirantes/selección/admisión) pero el boost fuerte solo se activa si el
// TEXTO del chunk contiene los marcadores literales y específicos del
// artículo correcto — así no se sobre-dispara con cualquier chunk de RIT.
const ADMISION_DOMAIN_KEYWORDS = [
    'aspirante', 'aspirantes', 'proceso de seleccion', 'seleccion de personal',
    'admision de personal', 'condiciones de admision', 'prohibido exigir',
    'requisitos de ingreso', 'vinculacion laboral',
];
const ADMISION_TEXT_MARKERS = [
    'estado civil', 'libreta militar', 'examen de sida', 'prueba de gravidez',
    'prueba de embarazo', 'partido politico', 'ley 13 de 1972',
];

// ── Horario Personal Administrativo (2026-08-14) ─────────────────────────
// Gap confirmado por pruebas NotebookLM: el Art. 23 del RIT está fragmentado
// en muchas sub-cláusulas (horas extras, sedes, turnos, etc.) que compiten
// por el mismo phrase-boost genérico de "jornada"/"horario", diluyendo la
// señal del chunk que SÍ tiene la tabla de horario administrativo específica
// (lunes-jueves 7:30-5:00, viernes 7:30-4:30, vigente desde el 14 de julio
// de 2026) — quedaba en la posición #8, justo fuera del top-6.
const HORARIO_ADMIN_DOMAIN_KEYWORDS = [
    'personal administrativo', 'horario administrativo', 'jornada administrativa',
    '14 de julio',
];
const HORARIO_ADMIN_TEXT_MARKERS = [
    '14 de julio de 2026', '7:30 am', '4:30 pm', '5:00 pm',
];

const ACRONYM_TERMS = ['copasst', 'sg-sst', 'sgsst', 'sagrilaft', 'oea', 'bpm', 'bpmm', 'rit', 'epp'];

// ── Tokens que NO deben activar el partial phrase-boost ──────────────────────
// Son palabras tan frecuentes en el corpus que su presencia en la query no
// discrimina: "trabajo" aparece en "jornada de trabajo", "trabajo nocturno",
// "trabajo suplementario", etc., y provocaría que chunks de esas secciones
// se inflen aunque la query sea sobre celular, uniforme u otro tema.
const PHRASE_BOOST_SKIP_TOKENS = new Set([
    'trabajo', 'trabajador', 'trabajadores', 'trabajar',
    'empresa', 'empresas', 'puesto', 'lugar', 'area', 'zona',
    'personal', 'empleado', 'empleados',
]);


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
     * @param {Array}  expandedTerms - Sinónimos/términos expandidos de la query (queryUnderstandingService)
     * @returns {Array} - Candidatos reordenados con `finalScore` y detalle de scoring
     */
    rerank(candidates, query, keywords, docPriority = { boost: [], penalize: [] }, foundAcronyms = [], expandedTerms = []) {
        if (!candidates || candidates.length === 0) return [];

        const queryLower   = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const keywordsNorm = keywords.map(k => this._normalize(k));
        // Fix (2026-08-04, seguimiento_5.md #1): kwDensity para el ranking solo
        // miraba keywords literales, así que un chunk cuya única señal es un
        // sinónimo expandido (p.ej. query "facebook" → chunk que dice "redes
        // sociales") nunca acumulaba keyword score y quedaba fuera del top-6 de
        // contexto, sin importar qué tan bien reconectado esté rrfScore. Se
        // calcula aparte y se toma el máximo contra el literal por chunk —
        // complementa la señal literal, no la reemplaza.
        const expandedTermsNorm = expandedTerms.map(t => this._normalize(t)).filter(t => t.length > 0);

        // Calcular IDF estimado usando todos los candidatos como corpus
        const idfMap = this._estimateIDF(candidates, keywordsNorm);

        const scored = candidates.map(candidate => {
            const text       = candidate.payload?.texto_original || '';
            const textNorm   = this._normalize(text);
            const source     = (candidate.payload?.fuente || '').toLowerCase();
            const sectionTitle = (candidate.payload?.section_title || candidate.payload?.metadata?.section_title || '').toLowerCase();
            // BUG CORREGIDO (2026-08-03, seguimiento_4.md #1): `candidate.rrfScore`
            // nunca se asignaba en ningún punto del pipeline — ragService._weightedFusion
            // sí calcula un score de fusión real, pero lo expone como `fusionScore`
            // (y `finalScore` inicial), no como `rrfScore`. El componente semántico
            // de esta fórmula (peso 0.35, el mayor de todos) era código muerto: SIEMPRE 0.
            // Fix: leer `candidate.fusionScore` (ya normalizado 0-1, suma de pesos
            // semantic 0.45 + bm25 0.25 + exact_phrase 0.20 + expanded 0.10 = 1.0 en
            // ragService._weightedFusion) como la señal semántica real.
            const rrfScore   = candidate.fusionScore ?? candidate.rrfScore ?? 0;

            // 1. BM25 Score
            const bm25 = this._bm25Score(textNorm, keywordsNorm, idfMap);

            // 2. Keyword Density — % de keywords presentes en el texto
            const kwPresent      = keywordsNorm.filter(kw => textNorm.includes(kw)).length;
            const kwDensityLiteral = keywordsNorm.length > 0 ? kwPresent / keywordsNorm.length : 0;
            const kwPresentExpanded = expandedTermsNorm.filter(t => textNorm.includes(t)).length;
            const kwDensityExpanded = expandedTermsNorm.length > 0 ? kwPresentExpanded / expandedTermsNorm.length : 0;
            const kwDensity   = Math.max(kwDensityLiteral, kwDensityExpanded);

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
            // Nota (2026-08-03): se retira el "* 10" que multiplicaba rrfScore.
            // Ese factor estaba calibrado para una magnitud de RRF real (scores
            // típicos ~0.01-0.15 con constante k=60), nunca implementada. El valor
            // que SÍ llega ahora (`fusionScore`) ya está en escala 0-1, igual que
            // bm25/kwDensity/etc. — aplicar "* 10" además del peso 0.35 le daría
            // ~3.5x el peso documentado y rompería la escala de finalScore frente
            // al resto de componentes.
            // BUG CORREGIDO (2026-08-14): `domainBoost` (Ética/SAGRILAFT/Admisión/
            // Horario Admin) se calculaba y se exponía en scoreDetail/boostReason,
            // pero JAMÁS se sumaba aquí — mismo patrón que el bug histórico de
            // `rrfScore` (ver nota arriba). Cualquier regla de _domainSpecificBoost
            // era código muerto para el ranking real; solo afectaba el flag
            // `boosted` y el log. Confirmado con las pruebas NotebookLM: los
            // boosts de Admisión (+0.45) y Horario Admin (+0.65) no cambiaban
            // la posición final pese a aparecer en scoreDetail.domain.
            const finalScore = (
                (rrfScore       * 0.35) +   // Semántico (fusión ponderada real)
                (bm25           * 0.25) +   // BM25 léxico
                (kwDensity      * 0.20) +   // Cobertura de keywords
                (phraseBoost    * 0.50) +   // Frases exactas de dominio
                (acronymBoost   * 0.50) +   // Acrónimos exactos
                (sectionBoost   * 0.30) +   // Relevancia de título de sección
                (proximityScore * 0.10) +   // Proximidad de keywords
                domainBoost +                // Ética/SAGRILAFT/Admisión/Horario Admin
                docBoost                    // Boost/penalización de documento
            );

            return {
                ...candidate,
                finalScore:    Math.max(0, finalScore),
                keywordScore:  kwDensity, // Para retrievalConfidence
                boosted:       phraseActive || acronymActive || sectionActive || domainActive || docBoost > 0,
                boostReason,
                scoreDetail: {
                    rrf:        (rrfScore * 0.35).toFixed(4),
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

        // ── Admisión de Personal / Aspirantes Boost ───────────────────
        const queryIsAdmision = ADMISION_DOMAIN_KEYWORDS.some(kw => queryNorm.includes(kw));
        const textHasAdmisionMarker = ADMISION_TEXT_MARKERS.some(m => textNorm.includes(m));
        if (queryIsAdmision && textHasAdmisionMarker) {
            return 0.45;
        }

        // ── Horario Personal Administrativo Boost ─────────────────────
        // Boost más fuerte que el estándar (0.45): el Art. 23 del RIT está
        // fragmentado en ~10 sub-chunks que ya acumulan el máximo de phrase-
        // boost genérico (0.50 de peso) solo por contener "jornada"/"trabajo".
        // 0.45 no alcanzaba a compensar esa ventaja de partida (medido:
        // seguía en posición #8 con 0.9053 vs 1.0206 del 6º lugar).
        const queryIsHorarioAdmin = HORARIO_ADMIN_DOMAIN_KEYWORDS.some(kw => queryNorm.includes(kw));
        const textHasHorarioAdminMarker = HORARIO_ADMIN_TEXT_MARKERS.some(m => textNorm.includes(m));
        if (queryIsHorarioAdmin && textHasHorarioAdminMarker) {
            return 0.65;
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
        // Palabras significativas de la query para el partial boost:
        // excluye stopwords, tokens cortos (≤3) y tokens genéricos del dominio.
        const querySpecificWords = queryNorm
            .split(/\s+/)
            .filter(w =>
                w.length > 3 &&
                !STOPWORDS.has(w) &&
                !PHRASE_BOOST_SKIP_TOKENS.has(w)
            );

        let boost = 0;
        for (const phrase of DOMAIN_EXACT_PHRASES) {
            const phraseNorm = this._normalize(phrase);
            if (queryNorm.includes(phraseNorm) && textNorm.includes(phraseNorm)) {
                // Frase completa presente en query Y en chunk → boost fuerte
                boost += 0.60;
            } else if (textNorm.includes(phraseNorm) && querySpecificWords.length > 0) {
                // Partial boost solo si una palabra específica de la query coincide
                // con una palabra (completa, no substring) de la frase de dominio.
                const phraseWords = new Set(phraseNorm.split(/\s+/));
                if (querySpecificWords.some(w => phraseWords.has(w))) {
                    boost += 0.20;
                }
            }
        }
        return Math.min(boost, 1.0);
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
