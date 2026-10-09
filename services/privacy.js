/**
 * PrivacyService
 *
 * Clasifica si una consulta o respuesta contiene datos sensibles
 * que NO deben almacenarse en la caché SQLite.
 *
 * CORRECCIÓN: Los RegExp ya NO usan flag `g` como literales de objeto.
 * Con el flag `g`, los objetos RegEx son stateful (lastIndex persiste entre
 * llamadas), lo que causaba que test() alternara entre true/false de forma
 * impredecible en invocaciones sucesivas con el mismo patrón.
 */

export const CATEGORIES = {
    REGLAMENTO: 'reglamento',
    CORPORATIVA: 'corporativa',
    CONFIDENCIAL: 'confidencial',
    FUERA_DE_DOMINIO: 'fuera_de_dominio',
    CASUAL: 'casual',
    MALICIOSA: 'maliciosa',
    ESTANDAR: 'estandar'
};

// ── Filtro de confidencialidad CONTEXTUAL (2026-10-08) ───────────────────────
// Antes: lista de palabras sueltas ('salario', 'nómina', 'mi contrato',
// 'mi telefono'...). Cualquier pregunta que las MENCIONARA se bloqueaba antes
// del RAG con "consulta con RRHH". En analytics, 14 de 21 bloqueos eran
// falsos positivos: "¿puedo usar mi teléfono celular?", "si mi contrato es de
// 6 meses, ¿cuántas vacaciones tengo?", "¿cómo se calcula el pago de horas
// extra?", la pregunta del Código de Ética sobre "dinero, regalos... salarios".
//
// Ahora se bloquea solo cuando la pregunta PIDE un dato confidencial:
//   A) datos personales identificables (cédula, cuenta bancaria, dirección...)
//   B) el salario/pago de una persona o cargo ("cuánto gana X", "salario de un operario")
//   C) el salario/pago PROPIO ("cuál es mi salario", "info sobre mi sueldo")
//   D) un MONTO de pago ("cuánto me pagan", "valor del salario"), salvo que
//      pregunte por recargos/porcentajes de política (dominical, nocturno,
//      horas extra) — eso está en el RIT y es público dentro de la empresa.
//   E) un cálculo personal con una cifra ("si mi salario es 2'500.000...").
// Las preguntas de política o procedimiento ("¿cada cuánto se paga la nómina?",
// "¿qué dice el reglamento sobre el salario integral?") pasan al RAG.

const PERSONAL_DATA_PATTERNS = [
    // Ojo: NO incluir "mis datos personales" — "¿cómo se protegen mis datos
    // personales si hago una denuncia?" es una pregunta de política legítima.
    /\bmis?\s+(cuentas?\s+bancarias?|n[uú]mero\s+de\s+cuenta|c[eé]dula|nit|direcci[oó]n\s+(de\s+residencia|personal)?|correo\s+personal|historia\s+cl[ií]nica)\b/,
    /\b(c[eé]dula|direcci[oó]n|tel[eé]fono|celular|correo)\s+de\s+(un|una|el|la|mi|otro|otra)\s+(compa[nñ]er|emplead|trabajador|jef|gerente|director|operari)/,
    /\b(desprendible|comprobante|colilla)s?\s+de\s+(pago|n[oó]mina)\b/,
];

// Incluye jerga de dinero (glosario, 2026-10-08): plata, billete, lucas, varos,
// biyuyo, quincena — sin ella "¿cuánta plata gana un operario?" evadía el filtro.
const PAY_TERM = '(salario|sueldo|n[oó]mina|pago|paga[nr]?|ingresos?|liquidaci[oó]n|bonificaci[oó]n|comisi[oó]n|devengo|devengad|plata|billete|lucas|varos|biyuyo|quincena)';

// "cuánto me pagan" NO va aquí: lo cubre la regla D, que exime preguntas de
// política ("¿cuánto me pagan por la prima / el dominical?").
const THIRD_PARTY_PAY_PATTERNS = [
    /\bcu[aá]nto\s+(gana|ganan|gano|devenga|devengan|devengo)\b/,
    /\blo\s+que\s+(gana|ganan|devenga)\b/,
    /\b(salario|sueldo)s?\s+(exacto\s+)?(de|del)\s+(un|una|el|la|los|las|mi|mis|otro|otra|cada)\b/,
    /\b(salario|sueldo)s?\s+(de|del)\s+(gerente|director|jefe|supervisor|operari|auxiliar|coordinador|analista|asistente|compa[nñ]er)/,
];

const OWN_PAY_PATTERNS = [
    new RegExp(`\\b(cu[aá]l|cual)\\s+es\\s+mis?\\s+${PAY_TERM}\\b`),
    new RegExp(`\\b(informaci[oó]n|datos|detalle|valor|monto)\\s+(sobre|de|del)\\s+mis?\\s+${PAY_TERM}\\b`),
    // Verbo de consulta pegado al dato ("dame mi salario", "ver mi nómina").
    // No usar un comodín amplio: "necesito saber cómo reclamo mi liquidación"
    // es una pregunta de procedimiento, no una petición del dato.
    new RegExp(`\\b(dime|dame|mu[eé]strame|consultar|ver)\\s+(cu[aá]l\\s+es\\s+)?mis?\\s+${PAY_TERM}\\b`),
    /\bmis\s+ingresos\b/,
];

// Monto de pago: "cuánto/valor/monto" + término de pago en la misma pregunta.
// "cuánto tiempo/tarda/demora" pregunta por un plazo, no por un monto.
const AMOUNT_RE = /\b(cu[aá]nto(?!\s+(tiempo|tarda|tardan|demora|demoran|dura|antes|despu[eé]s))|cu[aá]nta\s+(plata|lana)|valor|monto|cifra|qu[eé]\s+tanto)\b/;
const FREQUENCY_RE = /\bcada\s+cu[aá]nto\b/;            // "¿cada cuánto se paga?" = frecuencia, no monto
// Conceptos cuyo "cuánto" lo fija la política/ley (porcentaje, días, regla),
// no el salario individual: el RIT los documenta y deben llegar al RAG.
// Nota 2026-10-09: se probó dejar pasar "salario/pago mínimo" (dato público),
// pero los documentos no traen la cifra y el 3B respondió "el pago mínimo
// mensual es de 1 salario". Se mantiene bloqueado hasta tener respuesta fija.
const POLICY_RATE_RE = /(%|\b(recargos?|porcentajes?|dominical(es)?|domingos?|festivos?|nocturnos?|horas?\s+extras?|extras|trabajo\s+suplementario|primas?|cesant[ií]as|vacaciones|incapacidad(es)?|licencias?|aprendi(z|ces)|sostenimiento)\b)/;
const PAY_RE = new RegExp(`\\b${PAY_TERM}`);
// Cifra de dinero explícita: 2'500.000, 2.500.000, 2500000, $1.300.000, "2 millones"
// Incluye jerga: "dos palos" / "2 melones" (millones), "800 lucas" / "barras" (miles).
const MONEY_FIGURE_RE = /(\$\s*\d|\b\d{1,3}(?:['.,]\d{3}){1,3}\b|\b\d{6,}\b|\b\d+(?:[.,]\d+)?\s*(millones|mill[oó]n|mil\s+pesos|pesos|palos|melones|lucas|barras)\b|\b(un|dos|tres|cuatro|cinco)\s+(palos|melones|millones)\b)/;

/**
 * true si la pregunta pide un dato confidencial (ver reglas A-E arriba).
 * `lowerText` ya viene en minúsculas y sin emojis.
 */
function requestsConfidentialData(lowerText) {
    if (PERSONAL_DATA_PATTERNS.some(r => r.test(lowerText))) return true;          // A
    if (THIRD_PARTY_PAY_PATTERNS.some(r => r.test(lowerText))) return true;        // B
    if (OWN_PAY_PATTERNS.some(r => r.test(lowerText))) return true;                // C
    if (PAY_RE.test(lowerText) && MONEY_FIGURE_RE.test(lowerText)) return true;    // E
    if (AMOUNT_RE.test(lowerText) && !FREQUENCY_RE.test(lowerText)
        && PAY_RE.test(lowerText) && !POLICY_RATE_RE.test(lowerText)) return true; // D
    return false;
}

const CASUAL_KEYWORDS = ['hola', 'buen día', 'buenos días', 'buenas tardes', 'buenas noches', 'gracias', 'gracias!', 'ok', 'perfecto', 'quién eres', 'quien eres',
    // Saludos coloquiales (glosario de jerga, 2026-10-08)
    'quiubo', 'quihubo', 'qué más', 'que mas', 'qué hubo', 'que hubo', 'bien o qué', 'bien o que', 'qué cuenta', 'que cuenta', 'listo', 'de una', 'hágale', 'hagale', 'sisas'];

class PrivacyService {
    /**
     * Clasifica el contenido en uno de los 5 niveles.
     * @param {string} text Texto a analizar.
     * @param {string} aiClassification Clasificación sugerida por la IA (opcional).
     * @returns {string} Categoría final.
     */
    static classify(text, aiClassification = null) {
        if (!text || typeof text !== 'string') return CATEGORIES.MALICIOSA;

        // Normalizar antes del keyword check: quitar emojis y símbolos decorativos
        // Unicode para que "🔥 salario 🤑" se evalúe igual que "salario".
        const lowerText = text
            .toLowerCase()
            .replace(/[\u{1F300}-\u{1FFFF}]/gu, ' ')
            .replace(/[\u{2600}-\u{26FF}]/gu, ' ')
            .replace(/[\u{2700}-\u{27BF}]/gu, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        // 1. Detección de Malicia (Heurística simple ante inyecciones o comandos)
        if (lowerText.includes('drop table') || lowerText.includes('delete from') || lowerText.includes('<script') || lowerText.startsWith('/')) {
            return CATEGORIES.MALICIOSA;
        }

        // 2. Si la IA ya clasificó, confiamos en su juicio semántico si coincide con nuestros tiers
        if (aiClassification && Object.values(CATEGORIES).includes(aiClassification)) {
            return aiClassification;
        }

        // 3. Verificación contextual: ¿la pregunta PIDE un dato confidencial?
        if (requestsConfidentialData(lowerText)) return CATEGORIES.CONFIDENCIAL;

        for (const casual of CASUAL_KEYWORDS) {
            if (lowerText === casual || lowerText.startsWith(casual + ' ')) {
                // Solo si es predominantemente casual
                if (lowerText.length < casual.length + 10) return CATEGORIES.CASUAL;
            }
        }

        // Por defecto, si llegamos aquí y no hay una consulta del RIT clara, 
        // la IA debería haber determinado si es reglamento, corporativa o fuera_de_dominio.
        return CATEGORIES.REGLAMENTO;
    }

    /**
     * Determina si un par pregunta+respuesta es seguro para persistir en SQLite.
     * SOLO la categoría 'reglamento' es segura para el Knowledge DB.
     *
     * @param {string} category Categoría detectada
     * @returns {boolean} true = seguro para guardar
     */
    static isSafeToCache(category) {
        return category === CATEGORIES.REGLAMENTO;
    }
}

export default PrivacyService;
