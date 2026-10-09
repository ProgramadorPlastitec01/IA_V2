/**
 * Mensajes canónicos del sistema — un solo lugar para la redacción exacta
 * de cada respuesta "sin contenido real" que puede ver el usuario.
 *
 * Antes de este archivo, cada capa del pipeline (ragService, responseBuilder,
 * chatController) tenía su propia frase hardcodeada, incluyendo una en
 * chatController.js que nunca se disparaba en la práctica (ragService no
 * emite el campo que esa rama esperaba) — quedaba como una 5ª variante
 * fantasma. Consolidar aquí evita que una futura edición reintroduzca
 * inconsistencias de redacción entre capas.
 *
 * Regla de producto (2026-08-13): solo la categoría CONFIDENTIAL redirige a
 * RRHH. Las demás (sin match, no entendida, info parcial insuficiente) son
 * temas fuera del alcance documental, no algo que requiera intervención de
 * RRHH caso por caso.
 */
export const SYSTEM_MESSAGES = {
    // La pregunta no activó ninguna señal de dominio, o la confianza de
    // retrieval quedó por debajo del umbral mínimo.
    NO_MATCH: 'No encontré información sobre este tema en la documentación disponible.',

    // Guardrail pre-LLM: query gibberish o con retrieval demasiado débil
    // para intentar una respuesta con seguridad.
    NOT_UNDERSTOOD: 'No entendí tu pregunta, ¿puedes reformularla?',

    // Hubo retrieval (chunks con score suficiente) pero el LLM determinó,
    // en su clasificación tri-estado, que el contexto no responde la
    // pregunta con evidencia suficiente.
    INSUFFICIENT_CONTEXT: 'No se encontró información suficiente en los documentos consultados para responder esta pregunta.',

    // (2026-10-08) El LLM generó una respuesta que repite un término de la
    // pregunta que NO existe en ningún documento (premisa no respaldada, ej.
    // "El día de cumpleaños es libre"). Se usa como prefijo + «términos».
    UNSUPPORTED_PREMISE_PREFIX: 'No encontré información sobre',
    UNSUPPORTED_PREMISE_SUFFIX: 'en la documentación disponible.',

    // Preguntas sobre salarios, pagos, nómina o datos personales — la única
    // categoría que redirige explícitamente a RRHH.
    CONFIDENTIAL: 'No puedo proporcionar información confidencial sobre salarios, pagos o datos personales.\nPara conocer esta información, consulta directamente con RRHH.',
};

export default SYSTEM_MESSAGES;
