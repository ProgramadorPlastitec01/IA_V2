/**
 * Reglas de jerga colombiana → términos de los documentos (2026-10-08).
 *
 * Fuente: config/glosario_jerga_colombiana.json (entregado por desarrollo).
 *
 * Por qué REGLAS y no una lista de palabras: casi toda la jerga es polisémica
 * y una lista plana desvía la búsqueda (ver el bug de "tomar" → alcohol que
 * rompió "si mi hijo se enferma, puedo tomar esto como incapacidad"):
 *   - "me echaron" = me despidieron, pero "me echaron la culpa" no.
 *   - "prendido" = algo borracho, pero "deje la máquina prendida" no.
 *   - "marica" = insulto (posible acoso) o vocativo entre amigos ("marica,
 *     ¿cuántos días de vacaciones tengo?").
 *   - "me abro" = renuncio ("me abro de la empresa") o me voy temprano.
 * Cada regla exige TODOS sus patrones (`all`), ninguno de sus `none`, y añade
 * `expansions` — que deben ser términos que EXISTEN en el corpus, si no la
 * expansión no aporta nada a la búsqueda.
 *
 * Los textos se evalúan en minúsculas y sin tildes (ver queryUnderstandingService).
 */

// Fragmentos reutilizables (sin tildes)
const FAMILIAR = String.raw`(hij[oa]s?|nin[oa]s?|bebe|chin[oa]s|mi\s+chin[oa]|pelad[oa]s?|mama|papa|madre|padre|mi\s+cuch[oa]|mi\s+viej[oa]|mi\s+ama|mi\s+apa|espos[oa]|conyuge|companer[oa]\s+permanente|herman[oa]s?|abuel[oa]s?|familiar(es)?)`;
// Sin "grave": "falta grave" + "padre" dispararía la regla sin hablar de salud.
const ENFERMEDAD = String.raw`(enferm\w*|hospital\w*|urgencias|clinica|cirugia|operaci[oa]n\w*|se\s+puso\s+mal\w*|esta\s+mal\w*|accidente\w*|cita\s+medica|incapacidad\w*)`;
const INSULTO = String.raw`(marica|maricon|huevon|guevon|gamin|nero|corroncho|sapo|lamb[oa]n|lagarto|bob[oa]|idiota|estupid[oa]|bruto|bruta|negro|indio|gordo|gorda)`;

export const SLANG_RULES = [
    {
        name: 'familiar_enfermo',
        // Caso reportado: "si mi hijo se enferma, ¿puedo tomar esto como incapacidad?"
        // La incapacidad es solo del propio trabajador; para un familiar aplica el
        // permiso por grave calamidad doméstica (RIT) / calamidades domésticas
        // remuneradas (beneficio I-RH-001).
        all:  [new RegExp(`\\b${FAMILIAR}\\b`), new RegExp(`\\b${ENFERMEDAD}`)],
        expansions: ['calamidad doméstica', 'permiso', 'familiar'],
        // Redacción directa (2026-10-09): la versión condicional ("si el contexto
        // distingue…") llevó a qwen2.5 a NEGAR la calamidad doméstica.
        hint: 'La enfermedad, accidente o emergencia es de un FAMILIAR del trabajador (hijo/a, padre/madre, cónyuge u otro familiar), no del propio trabajador. La incapacidad médica corresponde solo a la enfermedad del propio trabajador, así que aquí no aplica. Responde con lo que el contexto dice sobre el permiso por grave calamidad doméstica u otros permisos para atender a un familiar.',
    },
    {
        name: 'despido',
        all:  [/\b(me|lo|la|nos|los|las|te)\s+(echaron|botaron|echan|botan|van\s+a\s+(echar|botar)|quieren\s+(echar|botar)|pueden\s+(echar|botar)|piensan\s+(echar|botar))\b|\b(me|le|les)\s+dieron\s+la\s+carta\b|\bdar(me|le)?\s+de\s+baja\b|\bme\s+sacaron\s+de\s+(la\s+empresa|plastitec|el\s+trabajo)\b/],
        none: [/\b(echaron|echan|botaron|botan)\s+(la\s+culpa|de\s+menos|una\s+mano|un\s+ojo|los\s+perros|agua|al\s+agua|la\s+basura|a\s+la\s+basura)\b/, /\bbot(e|aron|o)\s+(el|la|mi|los|las)\s+(carne|carnet|celular|llaves|tarjeta)\b/],
        expansions: ['despido', 'terminación del contrato', 'justa causa'],
        hint: 'En Colombia "me echaron", "me botaron" o "me dieron la carta" significa que despidieron al trabajador (terminación del contrato).',
    },
    {
        name: 'renuncia',
        all:  [/\b(me\s+abro|abrirme|me\s+vuelo|volarme|me\s+zafo|zafarme|tirar\s+la\s+toalla|me\s+quiero\s+ir|me\s+voy)\b.{0,25}\b(de\s+la\s+empresa|del\s+trabajo|del\s+camello|de\s+plastitec|de\s+aca|de\s+aqui|de\s+este\s+trabajo)\b/],
        expansions: ['renuncia', 'terminación del contrato'],
        hint: '"Abrirse", "volarse" o "zafarse" de la empresa significa renunciar al trabajo.',
    },
    {
        name: 'alcohol',
        all:  [/\b(jinch[oa]|enguayabad[oa]|guayabo|guaro|aguardiente|polas?|birras?|cervezas?|con\s+tragos|rumba|farra|parranda)\b|\b(lleg\w*|vin\w*|vengo|estoy|estaba|esta|trabaj\w*|ir\s+a\s+trabajar)\s+(prendid[oa]|entonad[oa]|rascad[oa]|jinch[oa]|enguayabad[oa]|con\s+guayabo|borrach[oa])\b/],
        none: [/\b(maquina|equipo|luz|luces|horno|inyectora|extrusora)\s+\w*\s*prendid[oa]/],
        expansions: ['alcohol', 'embriaguez', 'sustancias psicoactivas'],
        hint: 'La jerga usada ("prendido", "jincho", "guayabo", "polas", "guaro"...) se refiere a consumo de alcohol o a estar bajo sus efectos.',
    },
    {
        name: 'insulto_acoso',
        // Insulto DIRIGIDO a alguien (no como vocativo entre amigos).
        all:  [new RegExp(`\\b(me|le|nos|les)\\s+(dijo|dice|dicen|dijeron|trata|trato|tratan|llama|llamo|llaman|grita|grito|gritan)\\s+(de\\s+)?${INSULTO}\\b|\\b(me|lo|la|nos)\\s+(tratan?|trato)\\s+como\\s+(un\\s+|una\\s+)?${INSULTO}\\b`)],
        expansions: ['acoso laboral', 'maltrato', 'comité de convivencia', 'discriminación'],
        hint: 'El empleado describe un insulto o trato ofensivo dirigido a una persona en el trabajo: puede ser maltrato, discriminación o acoso laboral. Responde con lo que el contexto diga sobre acoso laboral, el Comité de Convivencia y cómo reportarlo.',
    },
    {
        name: 'burla_hostigamiento',
        all:  [/\b(de\s+parche|cogieron\s+de|tienen\s+de|boletear\w*|boletearon|me\s+la\s+montan|la\s+monta[nr]?|me\s+la\s+tiene\s+montada|me\s+humill\w*|me\s+ridiculiz\w*)\b/],
        expansions: ['acoso laboral', 'hostigamiento', 'comité de convivencia'],
        hint: '"Coger de parche", "boletear" o "montársela" a alguien significa burlarse de forma repetida o exponerlo públicamente: puede ser hostigamiento o acoso laboral.',
    },
    {
        name: 'acoso_sexual',
        all:  [/\b(echando|echar|echa|echo|tirando|tirar|tira)\s+los\s+perros\b|\bme\s+(cae|caia|cayo|esta\s+cayendo)\s+(el|la|mi)\s+(jefe|jefa|supervisor\w*|companer\w*)\b/],
        expansions: ['acoso sexual', 'comité de convivencia'],
        hint: '"Echar (o tirar) los perros" significa insinuarse o cortejar a alguien; en el trabajo, si no es bienvenido, puede constituir acoso sexual.',
    },
    {
        name: 'favoritismo',
        all:  [/\b(por\s+palanca|por\s+rosca|de\s+la\s+rosca|tiene\s+palanca|tienen\s+palanca|por\s+enchufe|por\s+padrino)\b/],
        expansions: ['igualdad', 'discriminación'],
        hint: '"Palanca", "rosca" o "padrino" significa favoritismo o influencias para obtener un cargo o beneficio.',
    },
    {
        name: 'robo',
        all:  [/\b(me|le|nos|les)\s+(tumbaron|robaron|raponearon|voltearon|bajaron)\b/],
        none: [/\b(bajaron|voltearon)\s+(el|la)\s+(sueldo|salario|turno|horario|pago)\b/],
        expansions: ['robo', 'sustraer'],
        hint: '"Tumbar", "raponear" o "voltear" algo significa robarlo.',
    },
    {
        name: 'comida_planta',
        all:  [/\b(mecato|onces|tinto|tintico|empanada\w*|galleta\w*|chicle)\b/],
        expansions: ['alimentos', 'comer', 'bebidas', 'descanso'],
        hint: '"Mecato", "onces" y "tinto" son comida, merienda y café: la pregunta es sobre consumir alimentos o bebidas.',
    },
    {
        name: 'objetos_personales',
        all:  [/\b(corotos|checheres|cacharros|trastos|mis\s+cosas|mis\s+vainas)\b/],
        expansions: ['objetos personales', 'locker'],
        hint: '"Corotos", "chécheres" o "mis vainas" significa objetos personales o pertenencias.',
    },
    {
        name: 'trabajo',
        all:  [/\b(camello|camellar|camellando|camelle|chamba|chambear|chambeando)\b/],
        expansions: ['trabajo'],
        hint: '"Camello" o "chamba" significa trabajo o empleo.',
    },
    {
        name: 'dinero_pago',
        all:  [/\b(quincena|lucas|varos|biyuyo|billete|la\s+plata|mi\s+plata|sin\s+plata|mas\s+plata|plata\s+extra)\b/],
        expansions: ['salario', 'pago'],
        hint: '"Quincena", "lucas", "varos" o "plata" se refieren al dinero o al pago del salario.',
    },
];

/** Normaliza igual que se evalúan las reglas: minúsculas y sin tildes. */
export const normalizeForSlang = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Devuelve { rules, expansions, hints } para una pregunta.
 *   expansions → se suman a la búsqueda (BM25 + embedding expandido).
 *   hints      → notas de interpretación que ragService pasa al LLM (qué
 *                significa la jerga / de quién se habla). Orientan, no
 *                aportan hechos: la respuesta sigue saliendo del contexto.
 */
export function matchSlangRules(query) {
    const q = normalizeForSlang(query);
    const rules = [];
    const expansions = new Set();
    const hints = [];
    for (const r of SLANG_RULES) {
        if (r.all.every(re => re.test(q)) && !(r.none || []).some(re => re.test(q))) {
            rules.push(r.name);
            r.expansions.forEach(e => expansions.add(e));
            if (r.hint) hints.push(r.hint);
        }
    }
    return { rules, expansions: [...expansions], hints };
}
