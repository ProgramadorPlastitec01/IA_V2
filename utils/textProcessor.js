/**
 * Limpia y parsea avanzado: Extrae el texto de la respuesta si la IA devuelve una estructura JSON
 * o tiene ruido de citas/caracteres especiales.
 */
export const cleanResponse = (text) => {
    if (!text) return "";
    let processed = text;

    try {
        const parsed = JSON.parse(text);
        if (parsed.answer) return String(parsed.answer);
        if (parsed.response) return String(parsed.response);
    } catch (e) {
        try {
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.answer) return String(parsed.answer);
                if (parsed.response) return String(parsed.response);
            }
        } catch (e2) {
            const manualMatch = text.match(/"answer"\s*:\s*"([\s\S]*?)"/);
            if (manualMatch && manualMatch[1]) {
                return manualMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
            }
        }
    }

    return processed
        .replace(/\[\d+\]/g, '')
        .replace(/^[ \t]*[\{\}][ \t]*$/gm, '')
        .replace(/^"([\s\S]+)"$/, '$1')   // Strip outer quotes if LLM wraps in quotes
        .trim();
};

// Informational question starters — these NEVER warrant "Sí" as opener
const INFORMATIONAL_PREFIXES = /^[¿]?(qué|cuáles|cuál|cómo|cuándo|cuánto|cuánta|por qué|quiénes|dónde)\b/i;

/**
 * Strips spurious "Sí[,./]" openers from responses to informational questions.
 * llama3.2 tends to open every response with "Sí, " regardless of question type.
 */
export const polarityAwareClean = (response, question) => {
    if (!response || !question) return response;
    const q = question.replace(/^¿/, '').trim();
    if (!INFORMATIONAL_PREFIXES.test(q)) return response; // only fix informational questions
    // Remove "Sí, " / "SÍ, " / '"Sí". ' at the very start
    return response
        .replace(/^["""']?Sí["""']?[,.\s]\s*/i, '')
        .replace(/^["""']?SÍ["""']?[,.\s]\s*/i, '')
        .trim();
};

/**
 * Valida si una respuesta de la IA es negativa o indica falta de información
 */
export const isResponseInvalid = (text) => {
    const invalidMarkers = [
        "no encuentro información",
        "no tengo acceso",
        "base de conocimientos actual",
        "no se menciona",
        "no tengo datos",
        "no tengo información disponible",
        "lo siento, no encuentro",
        "lo siento, no tengo",
        "no answer received"
    ];
    const lowerText = text.toLowerCase();
    return invalidMarkers.some(marker => lowerText.includes(marker));
};

/**
 * Reformula una consulta para mejorar la probabilidad de encontrar información
 */
export const reformulateQuery = (originalQuery) => {
    return `Respuesta directa y humana sobre: "${originalQuery}", consultando exclusivamente el Reglamento Interno de Trabajo y políticas de PLASTITEC. Sin introducciones.`;
};

/**
 * ¿La consulta trae dos o más preguntas? (2026-10-28)
 * Estricto a propósito: "ropa de calle y joyas" NO es compuesta; sí lo es
 * "¿qué área…? ¿qué consecuencia…?" (dos signos de pregunta) o
 * "¿qué hago en un accidente y cuántos días me dan?" (conector + segundo
 * interrogativo). Lo usan llmService (B2) y chatController para no borrar una
 * respuesta parcial ni la nota "No encontré información sobre: X" de la
 * sub-pregunta que sí falta.
 */
// Conector + interrogativo. El final usa (?!\p{L}) y no \b: en JS \b trata la
// "é" como no-letra, así que "y qué consecuencia" NUNCA coincidía (2026-11-24,
// pruebas TI Sección 15/Sección 5: la regla de compuestas no se activaba).
// Admite una preposición antes del interrogativo: "y con qué fines", "y a quién",
// "y en qué casos" (prueba TI "recursos de la empresa… y con qué fines…").
const COMPOUND_CONNECTOR_RE = /(?<!\p{L})(?:y|adem[áa]s|tambi[ée]n|asimismo)\s+(?=(?:(?:con|a|en|para|de|por|desde|hasta|ante)\s+)?(?:qu[ée]|cu[áa]l(?:es)?|c[óo]mo|cu[áa]ndo|cu[áa]nt[oa]s?|d[óo]nde|qui[ée]n(?:es)?|por\s+qu[ée]|puedo|debo|tengo|hay)(?!\p{L}))/iu;

export const isCompoundQuestion = (question) => {
    const q = String(question || '');
    if ((q.match(/\?/g) || []).length >= 2) return true;
    return COMPOUND_CONNECTOR_RE.test(q);
};

/**
 * Divide una pregunta compuesta en sub-preguntas autónomas (2026-11-24).
 * Conserva la introducción previa al primer "¿" en cada parte, para que
 * "Según la Sección 15 (…), ¿qué área…, y qué consecuencia…?" dé
 * "Según la Sección 15 (…), ¿qué área…?" + "Según la Sección 15 (…), ¿qué consecuencia…?".
 * Máximo 3 partes; devuelve [] si no hay al menos 2.
 */
export const splitCompoundQuestion = (question) => {
    const q = String(question || '').trim();
    const firstQ = q.indexOf('¿');
    const lead = firstQ > 0 ? q.slice(0, firstQ).trim() : '';
    const body = firstQ > 0 ? q.slice(firstQ) : q;
    const splitRe = new RegExp(`,?\\s*${COMPOUND_CONNECTOR_RE.source}`, 'giu');
    const parts = body
        .split('?')
        .flatMap(p => p.split(splitRe))
        .map(p => p.replace(/^[\s¿,;]+|[\s?,;.]+$/g, '').trim())
        .filter(p => p.split(/\s+/).length >= 3);
    if (parts.length < 2) return [];
    return parts.slice(0, 3).map(p => `${lead ? lead + ' ' : ''}¿${p}?`);
};
