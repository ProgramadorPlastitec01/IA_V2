/**
 * IntentRoutingService
 * 
 * Clasifica la intención de la consulta para optimizar los parámetros del RAG
 * y evitar ruido en respuestas corporativas críticas.
 */

export const INTENT_CATEGORIES = {
    CORPORATIVA: 'corporativa',  // Misión, visión, historia, valores
    NORMATIVA: 'normativa',      // Seguridad, EPP, reglamentos, sanciones
    PROCESOS: 'procesos',        // BPM, Calidad, Manufactura, Procedimientos
    ESTANDAR: 'estandar'         // Consultas generales de RRHH
};

// ─── Patrones para clasificación de tipo de respuesta (Fase 3.0) ─────────────
const PROCEDURE_PATTERNS = [
    /^cómo\b/i, /^como\b/i,
    /\b(cómo|como)\s+(reportar|solicitar|registrar|ingresar|realizar|hacer|tramitar|presentar|diligenciar|renovar|actualizar|obtener|gestionar|pedir|notificar|reporto|solicito)\b/i,
    /^¿?cómo\b/i,
    /\b(procedimiento|proceso|pasos|paso a paso|instrucciones)\b/i,
    /\b(qué (debo|hay que|tengo que|se debe|se tiene que) hacer)\b/i,
    /\b(reportar|solicitar|registrar|tramitar|diligenciar|presentar)\b.*(accidente|vacacion|permiso|licencia|incapacidad|certificado|queja|denuncia)/i,
];

const DETAILED_PATTERNS = [
    /\b(explica(me)?|describe|detalla|amplia|desarrolla|qué es)\s+(el|la|los|las|todo|completo)\b/i,
    /\b(qué es|qué son|define|definición de)\s+(el|la|los|las)?\s*(sagrilaft|sg-sst|copasst|bpm|rit|sena)\b/i,
    /\b(todo(s)? (los|las)|completo|completa|en detalle|información completa)\b/i,
    /\bexplícame (el|la|los|las)\b/i,
];

class IntentRoutingService {
    constructor() {
        this.keywords = {
            [INTENT_CATEGORIES.CORPORATIVA]: [
                'misión', 'mision', 'visión', 'vision', 'historia', 'fundación', 
                'quiénes somos', 'quienes somos', 'qué fabrica', 'que fabrica',
                'valores', 'empresa', 'plastitec', 'quién es plastitec', 'identidad'
            ],
            [INTENT_CATEGORIES.NORMATIVA]: [
                'seguridad', 'epp', 'casco', 'guantes', 'botas', 'gafas',
                'reglamento', 'normas', 'reglas', 'sanciones', 'prohibiciones',
                'obligaciones', 'faltas', 'disciplina', 'descargos', 'sst', 'ley',
                'copasst', 'sg-sst', 'sagrilaft', 'oea'
            ],
            [INTENT_CATEGORIES.PROCESOS]: [
                'bpm', 'calidad', 'proceso', 'procedimiento', 'manufactura',
                'inocuidad', 'higiene', 'limpieza', 'sanitización', 'auditoría',
                'pasos', 'cómo se hace', 'como se hace'
            ],
            [INTENT_CATEGORIES.ESTANDAR]: [
                'vacaciones', 'permisos', 'licencia', 'salario', 'pago', 'nómina',
                'contrato', 'beneficios', 'auxilio', 'incapacidad', 'certificado'
            ]
        };
    }

    /**
     * Detecta la intención de la consulta basándose en palabras clave.
     * @param {string} query 
     * @returns {string} Categoría detectada
     */
    detectIntent(query) {
        const lowerQuery = query.toLowerCase();
        
        // Prioridad 1: Corporativa
        if (this.keywords[INTENT_CATEGORIES.CORPORATIVA].some(k => lowerQuery.includes(k))) {
            return INTENT_CATEGORIES.CORPORATIVA;
        }

        // Prioridad 2: Procesos (específicos de planta)
        if (this.keywords[INTENT_CATEGORIES.PROCESOS].some(k => lowerQuery.includes(k))) {
            return INTENT_CATEGORIES.PROCESOS;
        }

        // Prioridad 3: Normativa
        if (this.keywords[INTENT_CATEGORIES.NORMATIVA].some(k => lowerQuery.includes(k))) {
            return INTENT_CATEGORIES.NORMATIVA;
        }

        // Prioridad 4: Estándar
        if (this.keywords[INTENT_CATEGORIES.ESTANDAR].some(k => lowerQuery.includes(k))) {
            return INTENT_CATEGORIES.ESTANDAR;
        }

        return INTENT_CATEGORIES.ESTANDAR;
    }

    /**
     * Clasifica el tipo de respuesta necesario para determinar el modo LLM.
     * Fase 3.0: SHORT_ANSWER | PROCEDURE | DETAILED_POLICY
     * @param {string} query
     * @returns {'SHORT_ANSWER'|'PROCEDURE'|'DETAILED_POLICY'}
     */
    classifyResponseType(query) {
        if (DETAILED_PATTERNS.some(p => p.test(query))) {
            return 'DETAILED_POLICY';
        }
        if (PROCEDURE_PATTERNS.some(p => p.test(query))) {
            return 'PROCEDURE';
        }
        return 'SHORT_ANSWER';
    }

    /**
     * Retorna los parámetros de búsqueda específicos para una intención.
     * @param {string} intent 
     */
    getParams(intent) {
        switch (intent) {
            case INTENT_CATEGORIES.CORPORATIVA:
                return {
                    topK: 4,
                    minScore: 0.50,
                    prioritizeCategory: 'CORPORATIVA',
                    boostValue: 0.25
                };
            case INTENT_CATEGORIES.PROCESOS:
                return {
                    topK: 6,
                    minScore: 0.45,
                    prioritizeCategory: 'PROCESOS',
                    boostValue: 0.20
                };
            case INTENT_CATEGORIES.NORMATIVA:
                return {
                    topK: 15, // Aumentado para máximo recall en seguridad
                    minScore: 0.30,
                    prioritizeCategory: 'SEGURIDAD',
                    boostValue: 0.15
                };
            default:
                return {
                    topK: 12,
                    minScore: 0.40,
                    prioritizeCategory: null,
                    boostValue: 0
                };
        }
    }
}

export default new IntentRoutingService();


