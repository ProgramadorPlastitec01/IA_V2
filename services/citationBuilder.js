/**
 * Citation Builder — Fase 3.0
 *
 * Comportamiento:
 *  - Por defecto: NO muestra fuentes (experiencia conversacional natural).
 *  - Si confidence < CONFIDENCE_THRESHOLD: muestra fuentes automáticamente.
 *  - Si showSources=true (petición explícita del usuario): muestra fuentes detalladas.
 */

const CONFIDENCE_THRESHOLD = 0.70; // Por debajo de esto se muestran fuentes automáticamente

class CitationBuilder {

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

        // Deduplicar fuentes
        const sources = new Set();
        evidenceArray.forEach(ev => {
            if (ev.source) sources.add(ev.source);
        });

        if (sources.size === 0) return '';

        const label = showSources
            ? '\n\n---\n**Fuente:**\n'
            : '\n\n---\n📎 *Información extraída de:*\n';

        let citationText = label;
        Array.from(sources).forEach(src => {
            citationText += `- ${src}\n`;
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
