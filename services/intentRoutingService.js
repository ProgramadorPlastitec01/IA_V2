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
                'obligaciones', 'faltas', 'disciplina', 'descargos', 'sst', 'ley'
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
