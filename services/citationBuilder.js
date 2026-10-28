/**
 * Citation Builder — Fase 3.0
 *
 * Comportamiento:
 *  - Siempre muestra fuentes (2026-10-09). Antes se ocultaban con confianza
 *    ≥ 0.70 ("experiencia conversacional"), pero la UI pasó a formato
 *    pregunta→respuesta con sección "Información extraída de", y la confianza
 *    de retrieval no predice la calidad (regresión SQLite: r≈0.19; 24
 *    respuestas salieron sin fuentes, varias incorrectas).
 *  - Si showSources=true (petición explícita del usuario): etiqueta "Fuente:".
 */

const CONFIDENCE_THRESHOLD = Infinity; // fuentes siempre visibles (ver arriba)

// Mapeo de nombre técnico de archivo → nombre humano legible (un solo lugar).
// El match es por subcadena del código de documento, robusto a sufijos de
// versión (ej. "_V006") y de planta (ej. "_Planta2").
const DOC_DISPLAY_NAMES = [
    { match: 'rit_plastitec', name: 'Reglamento Interno de Trabajo (RIT)' },
    { match: 'i-rh-001',      name: 'Conocimiento de Plastitec' },
    { match: 'i-rh-003',      name: 'Buenas Prácticas de Manufactura (BPM)' },
    { match: 'i-rh-004',      name: 'Inducción SST' },
    { match: 'i-rh-006',      name: 'Ingreso/Salida de Visitas - Planta 2' },
    { match: 'i-rh-009',      name: 'Ingreso a Áreas Grises' },
    { match: 'i-rh-010',      name: 'Ingreso a Áreas Negras' },
    { match: 'i-rh-011',      name: 'Ingreso a Áreas Blancas' },
    { match: 'i-rh-012',      name: 'Instructivo de Lavado de Manos' },
    { match: 'i-rh-017',      name: 'Código de Ética' },
];

class CitationBuilder {

    /**
     * Mapea un nombre de archivo fuente a su nombre humano legible.
     * Fallback: el nombre del archivo sin la extensión .md.
     */
    _displayName(src) {
        if (!src) return null;
        const lower = String(src).toLowerCase();
        const hit = DOC_DISPLAY_NAMES.find(d => lower.includes(d.match));
        return hit ? hit.name : String(src).replace(/\.md$/i, '');
    }

    /** Tokens distintivos (≥5 letras, sin tildes) de un texto. */
    _tokens(text) {
        const out = new Set();
        String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
            .split(/[^a-z0-9ñ]+/)
            .forEach(w => { if (w.length >= 5) out.add(w); });
        return out;
    }

    /**
     * Fuentes que realmente respaldan la respuesta (2026-10-28).
     * `sources` trae TODOS los documentos del top-6 recuperado, aunque el LLM
     * solo haya usado uno (prueba de técnicos: Visitas Planta 2 citaba
     * "Áreas Blancas" y BPM; Celular citaba Conocimiento y BPM). Se mide qué
     * fracción de las palabras distintivas de la respuesta aparece en el texto
     * de cada documento y se conservan los que llegan al 60% del mejor.
     *
     * @param {string} answerText   - respuesta del LLM (con o sin bloque de citas)
     * @param {Object} sourceTexts  - { fuente: texto de sus chunks en el contexto }
     * @param {string[]} sources    - fuentes recuperadas
     * @returns {string[]} fuentes usadas (nunca vacío si `sources` no lo estaba)
     */
    selectUsed(answerText, sourceTexts, sources) {
        const list = (sources || []).filter(Boolean);
        if (list.length <= 1 || !sourceTexts) return list;
        const answerTokens = this._tokens(String(answerText || '').split(/\n\n---\n/)[0]);
        if (answerTokens.size < 5) return list;

        const coverage = list.map(src => {
            const srcTokens = this._tokens(sourceTexts[src] || '');
            let hits = 0;
            answerTokens.forEach(w => { if (srcTokens.has(w)) hits++; });
            return { src, cov: hits / answerTokens.size };
        });
        const best = Math.max(...coverage.map(c => c.cov));
        if (best === 0) return list;
        return coverage.filter(c => c.cov >= best * 0.6).map(c => c.src);
    }

    /**
     * Construye un bloque de citas a partir de la evidencia JSON extraída.
     *
     * @param {Array}   evidenceArray  - Array de objetos de evidencia extraída
     * @param {number}  [confidence]   - Score de confianza del retrieval (0-1)
     * @param {boolean} [showSources]  - true si el usuario pidió las fuentes explícitamente
     * @returns {string} - Texto de citas o string vacío
     */
    build(evidenceArray, confidence = 1.0, showSources = false) {
        if (!evidenceArray || !Array.isArray(evidenceArray) || evidenceArray.length === 0) {
            return '';
        }

        // Solo mostrar fuentes si: el usuario las pide O la confianza es baja
        const shouldShow = showSources || confidence < CONFIDENCE_THRESHOLD;
        if (!shouldShow) return '';

        // Deduplicar fuentes ya mapeadas a su nombre legible (varios chunks del
        // mismo documento → una sola entrada humana).
        const displaySources = new Set();
        evidenceArray.forEach(ev => {
            const dn = this._displayName(ev.source);
            if (dn) displaySources.add(dn);
        });

        if (displaySources.size === 0) return '';

        const label = showSources
            ? '\n\n---\n**Fuente:**\n'
            : '\n\n---\n📎 *Información extraída de:*\n';

        let citationText = label;
        Array.from(displaySources).forEach(name => {
            citationText += `- ${name}\n`;
        });

        return citationText;
    }

    /**
     * Construye un bloque de citas detallado (con extracto literal) para cuando
     * el usuario pregunta explícitamente "¿De dónde sale esa información?".
     *
     * @param {Array} evidenceArray
     * @returns {string}
     */
    buildDetailed(evidenceArray) {
        if (!evidenceArray || !Array.isArray(evidenceArray) || evidenceArray.length === 0) {
            return 'No hay evidencia documental registrada para esta respuesta.';
        }

        let text = '**Fuentes y extractos documentales:**\n\n';
        evidenceArray.slice(0, 3).forEach((ev, i) => {
            text += `**${i + 1}. ${ev.source || 'Documento interno'}**\n`;
            if (ev.exact_quote) {
                text += `> "${ev.exact_quote}"\n`;
            }
            text += '\n';
        });

        return text;
    }
}

export default new CitationBuilder();
