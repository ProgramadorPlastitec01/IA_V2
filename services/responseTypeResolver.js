/**
 * ResponseTypeResolver
 * 
 * Determina el formato de la respuesta (SHORT_ANSWER, PROCEDURE, DEFINITION, LIST)
 * de forma determinística utilizando reglas léxicas, sin depender del LLM.
 */

const PROCEDURE_PATTERNS = [
    /^cómo\b/i, /^como\b/i,
    /\b(cómo|como)\s+(reportar|solicitar|registrar|ingresar|realizar|hacer|tramitar|presentar|diligenciar|renovar|actualizar|obtener|gestionar|pedir|notificar|reporto|solicito)\b/i,
    /^¿?cómo\b/i,
    /\b(procedimiento|proceso|pasos|paso a paso|instrucciones)\b/i,
    /\b(qué (debo|hay que|tengo que|se debe|se tiene que) hacer)\b/i,
    /\b(reportar|solicitar|registrar|tramitar|diligenciar|presentar)\b.*(accidente|vacacion|permiso|licencia|incapacidad|certificado|queja|denuncia)/i,
];

const DEFINITION_PATTERNS = [
    /\b(explica(me)?|describe|detalla|amplia|desarrolla|qué es)\s+(el|la|los|las|todo|completo)\b/i,
    /\b(qué es|qué son|define|definición de)\s+(el|la|los|las)?\s*(sagrilaft|sg-sst|copasst|bpm|rit|sena)\b/i,
    /\b(todo(s)? (los|las)|completo|completa|en detalle|información completa)\b/i,
    /\bexplícame (el|la|los|las)\b/i,
    /^qué es\b/i, /^que es\b/i,
    /^¿?qué es\b/i,
];

const LIST_PATTERNS = [
    /\b(cuáles|cuales)\s+(son|los|las)\b/i,
    /\b(qué|que)\s+(elementos|requisitos|documentos|datos|equipos|epp|tipos)\b/i,
    /\b(enumera|lista|menciona|dime los)\b/i,
];

class ResponseTypeResolver {
    /**
     * @param {string} query
     * @returns {'SHORT_ANSWER'|'PROCEDURE'|'DEFINITION'|'LIST'}
     */
    classify(query) {
        if (DEFINITION_PATTERNS.some(p => p.test(query))) {
            return 'DEFINITION';
        }
        if (PROCEDURE_PATTERNS.some(p => p.test(query))) {
            return 'PROCEDURE';
        }
        if (LIST_PATTERNS.some(p => p.test(query))) {
            return 'LIST';
        }
        return 'SHORT_ANSWER';
    }
}

export default new ResponseTypeResolver();
