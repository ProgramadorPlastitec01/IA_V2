import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Diccionario de variantes ortográficas conocidas ─────────────────────────
//
// Formato: 'variante_incorrecta_o_alternativa' → 'término_canónico'
//
// Reglas de uso:
//   - Las claves van SIEMPRE en minúsculas sin acentos (tal como llegan del usuario).
//   - El valor es el término canónico que existe en los documentos de Plastitec.
//   - Las frases compuestas (ej: "home office") se detectan sobre la query completa.
//   - Para ampliar el diccionario, agregar entradas directamente aquí.
//
export const SPELL_VARIANTS = {

    // ── Accidentes / Seguridad ────────────────────────────────────────────
    'acidentes':           'accidentes',
    'acidente':            'accidente',
    'acidentes laborales': 'accidentes laborales',
    'acidente laboral':    'accidente laboral',
    'lavorales':           'laborales',
    'laboral':             'laboral',            // variante ya canónica (no-op)

    // ── Licencias / Permisos ────────────────────────────────────────────
    'lisencia':            'licencia',
    'lisencias':           'licencias',
    'licencia':            'licencia',        // variante ya canónica (no-op)
    'licençia':            'licencia',
    'paternida':           'paternidad',
    'maternida':           'maternidad',

    // ── Reglamento / Normas ───────────────────────────────────────────────────
    'reglamentto':         'reglamento',
    'reglamneto':          'reglamento',

    // ── Teletrabajo / Home Office ─────────────────────────────────────────────
    'teletrabjo':          'teletrabajo',
    'teletrabao':          'teletrabajo',
    'homeoffice':          'teletrabajo',
    'home office':         'teletrabajo',     // frase compuesta

    // ── Dotación / Uniforme ───────────────────────────────────────────────────
    'dotacion':            'dotación',
    'dotasion':            'dotación',

    // ── Vacaciones / Descanso ─────────────────────────────────────────────────
    'vacasiones':          'vacaciones',
    'vacacion':            'vacación',

    // ── Incapacidad / Salud ───────────────────────────────────────────────────
    'incapasidad':         'incapacidad',
    'incapaciad':          'incapacidad',
    'eps':                 'EPS',
    'arl':                 'ARL',

    // ── Contrato / Nómina ────────────────────────────────────────────
    'nomina':              'nómina',
    'sueldo':              'salario',

    // ── Quejas / Reclamos ────────────────────────────────────────────
    'reclammos':           'reclamos',
    'reclamacion':         'reclamación',
    'reclamasion':         'reclamación',

    // ── Acrónimos (variantes de escritura) ────────────────────────────
    // Nota: La detección de hasAcronymMatch en acronymResolver.js ya usa
    // flag 'i' (case-insensitive), por lo que COPASST matchea 'Copast'.
    // Estas entradas garantizan que el embedding también reciba el término
    // canónico para BM25 en caso de que SPELL_VARIANTS se active primero.
    'copast':              'COPASST',
    'copasst':             'COPASST',
    'copaset':             'COPASST',
};

// Pre-calcular frases compuestas (claves con espacio) para búsqueda eficiente
const PHRASE_VARIANTS = Object.entries(SPELL_VARIANTS)
    .filter(([k]) => k.includes(' '))
    .sort((a, b) => b[0].length - a[0].length); // Las más largas primero (greedy)

const TOKEN_VARIANTS = Object.entries(SPELL_VARIANTS)
    .filter(([k]) => !k.includes(' '));

class QueryUnderstandingService {
    constructor() {
        this.vocabulary = { acronyms: {}, terms: {} };
        this._loadVocabulary();
    }

    _loadVocabulary() {
        try {
            const vocabPath = path.join(__dirname, '..', 'config', 'corporateVocabulary.json');
            if (fs.existsSync(vocabPath)) {
                const data = fs.readFileSync(vocabPath, 'utf8');
                this.vocabulary = JSON.parse(data);
            }
        } catch (error) {
            console.error('[QueryUnderstandingService] Error loading vocabulary:', error.message);
        }
    }

    /**
     * Normaliza ortográficamente una query aplicando SPELL_VARIANTS.
     *
     * Estrategia en dos pasos:
     *   1. Frases compuestas (ej: "home office") — reemplazadas sobre la query completa.
     *   2. Tokens individuales — reemplazados palabra a palabra.
     *
     * La normalización NO se activa para queries de más de 15 palabras
     * (mismo límite que la expansión de términos).
     *
     * @param {string} query  Query original (puede contener typos).
     * @returns {{ normalizedQuery: string, normalizedTerms: string[] }}
     *   normalizedQuery  — Query con typos corregidos.
     *   normalizedTerms  — Lista de correcciones aplicadas (para trazabilidad).
     */
    _normalizeSpelling(query) {
        const words = query.trim().split(/\s+/);

        // Respetar el límite de 15 palabras (igual que la expansión)
        if (words.length > 15) {
            return { normalizedQuery: query, normalizedTerms: [] };
        }

        let working = query;
        const normalizedTerms = [];

        // ── PASO 1: Frases compuestas (sobre la query completa) ───────────────
        // Se itera sobre las variantes ordenadas de más larga a más corta para
        // evitar reemplazos parciales que rompan frases más largas.
        for (const [variant, canonical] of PHRASE_VARIANTS) {
            const regex = new RegExp(
                variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), // escape regex
                'gi'
            );
            if (regex.test(working)) {
                working = working.replace(regex, canonical);
                normalizedTerms.push(`"${variant}" → "${canonical}"`);
            }
        }

        // ── PASO 2: Tokens individuales ───────────────────────────────────────
        // Divide la query (ya con frases corregidas) en tokens y reemplaza
        // cada uno si existe en el diccionario. La capitalización original
        // de tokens NO presentes en el diccionario se preserva intacta.
        //
        // La puntuación adyacente (ej: "reclammos.", "¿Copast?") se separa
        // del núcleo antes de buscar en el diccionario y se reconstruye
        // después, para que "reclammos." matchee la clave "reclammos".
        const correctedTokens = working.split(/(\s+)/).map(segment => {
            // Preservar espacios/separadores sin modificar
            if (/^\s+$/.test(segment)) return segment;

            // Separar prefijo/sufijo de puntuación del núcleo del token.
            // \p{L}\p{N} cubre letras Unicode (á, ñ, ü) y dígitos.
            const parts = segment.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u);
            const [, prefix, core, suffix] = parts;

            if (!core) return segment; // Token de pura puntuación → intacto

            const lowerCore = core.toLowerCase();
            const match = TOKEN_VARIANTS.find(([k]) => k === lowerCore);
            if (match) {
                const [variant, canonical] = match;
                // Solo registrar si hay una corrección real
                if (lowerCore !== canonical.toLowerCase()) {
                    normalizedTerms.push(`"${variant}" → "${canonical}"`);
                }
                return prefix + canonical + suffix;
            }
            return segment; // Preservar capitalización original si no hay match
        });

        const normalizedQuery = correctedTokens.join('');

        if (normalizedTerms.length > 0) {
            console.log(`[QueryUnderstanding] Normalización ortográfica: ${normalizedTerms.join(', ')}`);
        }

        return { normalizedQuery, normalizedTerms };
    }

    /**
     * Interpreta la query antes del retrieval:
     *   1. Normalización ortográfica (NUEVA — SPELL_VARIANTS)
     *   2. Expansión de acrónimos y términos corporativos (original, intacta)
     *
     * @param {string} query The original user query.
     * @returns {{
     *   expanded_query:  string,
     *   expanded_terms:  string[],
     *   normalizedTerms: string[]
     * }}
     */
    understand(query) {
        if (!query || typeof query !== 'string') {
            return { expanded_query: query, expanded_terms: [], normalizedTerms: [] };
        }

        // ── PASO 0: Normalización ortográfica (antes del embedding) ──────────
        const { normalizedQuery, normalizedTerms } = this._normalizeSpelling(query.trim());

        // A partir de aquí, usar normalizedQuery en lugar del original
        const originalQuery = normalizedQuery;
        const lowerQuery    = originalQuery.toLowerCase();
        const words         = originalQuery.split(/\s+/);

        let expandedTermsSet = new Set();

        // Check acronyms
        for (const [acronym, expansions] of Object.entries(this.vocabulary.acronyms)) {
            const pattern = new RegExp(`\\b${acronym.replace(/[-]/g, '[\\-]')}\\b`, 'i');
            if (pattern.test(originalQuery)) {
                expandedTermsSet.add(acronym);
                expansions.forEach(exp => expandedTermsSet.add(exp));
            }
        }

        // Check terms
        for (const [term, expansions] of Object.entries(this.vocabulary.terms)) {
            if (lowerQuery.includes(term.toLowerCase())) {
                expandedTermsSet.add(term);
                expansions.forEach(exp => expandedTermsSet.add(exp));
            }
        }

        const expanded_terms = Array.from(expandedTermsSet);

        // Build expanded_query
        let expanded_query = originalQuery;
        if (expanded_terms.length > 0) {
            // Only add expansions if the query isn't too long to avoid excessive noise
            if (words.length <= 15) {
                const uniqueAdditions = expanded_terms.filter(t => !lowerQuery.includes(t.toLowerCase()));
                if (uniqueAdditions.length > 0) {
                    expanded_query = `${originalQuery} ${uniqueAdditions.join(' ')}`;
                }
            }
        }

        return {
            expanded_query,
            expanded_terms,
            normalizedTerms,
        };
    }
}

export default new QueryUnderstandingService();
