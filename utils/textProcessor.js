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
export const isCompoundQuestion = (question) => {
    const q = String(question || '');
    if ((q.match(/\?/g) || []).length >= 2) return true;
    return /\b(y|adem[áa]s|tambi[ée]n|asimismo)\s+(qu[ée]|cu[áa]l(es)?|c[óo]mo|cu[áa]ndo|cu[áa]nt[oa]s?|d[óo]nde|qui[ée]n(es)?|por\s+qu[ée]|puedo|debo|tengo|hay)\b/i.test(q);
};
