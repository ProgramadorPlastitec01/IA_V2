/**
 * Clave de "prefijo" de una oración ya normalizada (minúsculas, sin tildes,
 * espacios colapsados): sus 6 primeras palabras. Sirve para detectar bucles
 * casi idénticos del LLM 3B, donde la oración se repite cambiando solo el
 * final ("No se menciona si el frotado… debe ser realizado con agua / con
 * jabón / con…"). Devuelve null si la oración es corta (< 8 palabras): en
 * oraciones cortas 6 palabras ya son casi toda la oración.
 */
export function sentencePrefixKey(normalizedSentence) {
    const words = normalizedSentence.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
    if (words.length < 8) return null;
    return words.slice(0, 6).join(' ');
}
