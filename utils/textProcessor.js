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
