/**
 * Utilidades para limpieza y reconstrucción de texto OCR
 */

/**
 * Une palabras partidas por guiones al final de línea o espacios incorrectos.
 * Ej: "UNI FORME" -> "UNIFORME", "POLA INAS" -> "POLAINAS"
 */
export function mergeFragmentedWords(text) {
    const domainTerms = [
        'UNIFORME', 'UNIFORMES', 'ESCAFANDRA', 'POLAINAS', 'VISITANTES', 
        'REGLAMENTO', 'PLASTITEC', 'COPASST', 'SAGRILAFT', 'MANUFACTURA',
        'CONTRATO', 'APRENDIZAJE', 'HIPOCLORITO', 'DESINFECCIÓN', 'SANITIZACIÓN'
    ];

    let cleaned = text;

    // 1. Unir guiones al final de línea: "palabra-\n continua" -> "palabracontinua"
    cleaned = cleaned.replace(/(\w)-\n\s*(\w)/g, '$1$2');

    // 2. Unir palabras con espacios internos: "UNI FORME" -> "UNIFORME"
    // Buscamos patrones de palabras en mayúsculas que al unirse formen un término de dominio
    domainTerms.forEach(term => {
        // Crear una regex que busque las partes de la palabra separadas por espacios
        // Ej para UNIFORME: \bU\s*N\s*I\s*F\s*O\s*R\s*M\s*E\b
        const spacedPattern = term.split('').join('\\s*');
        const regex = new RegExp(`\\b${spacedPattern}\\b`, 'gi');
        cleaned = cleaned.replace(regex, term);
    });

    return cleaned;
}

/**
 * Intenta reconstruir listas que el OCR rompió
 */
export function reconstructLists(text) {
    return text
        // Asegurar que bullets y números tengan una nueva línea si parecen pegados
        .replace(/([^\n])\s*([•\-\*]|[\d]+\.)\s+/g, '$1\n$2 ')
        // Limpiar múltiples espacios antes de los bullets
        .replace(/\n\s+([•\-\*]|[\d]+\.)/g, '\n$1');
}

/**
 * Detecta títulos (líneas cortas en mayúsculas) y los preserva con formato
 */
export function preserveTitles(text) {
    const lines = text.split('\n');
    return lines.map(line => {
        const trimmed = line.trim();
        // Si es una línea corta (< 60 chars) y es mayoritariamente mayúsculas
        if (trimmed.length > 4 && trimmed.length < 60 && /^[A-Z0-9\sÁÉÍÓÚÑ¿?¡!.,:;()\-]+$/.test(trimmed)) {
            return `\n### ${trimmed} ###\n`;
        }
        return line;
    }).join('\n');
}

/**
 * Limpieza general de ruido OCR
 */
export function cleanOCRNoise(text) {
    return text
        .replace(/[|¦]/g, 'I') // Confusión común de l/I/|
        .replace(/0/g, (match, offset, fullText) => {
            // Si está rodeado de letras, probablemente es una 'O'
            const prev = fullText[offset-1];
            const next = fullText[offset+1];
            if (/[a-zA-Z]/.test(prev) && /[a-zA-Z]/.test(next)) return 'O';
            return '0';
        })
        .replace(/\n{3,}/g, '\n\n') // Eliminar saltos excesivos
        .trim();
}
