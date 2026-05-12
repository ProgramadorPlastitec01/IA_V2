/**
 * QueryExpansion Service
 *
 * Expande consultas cortas o con siglas antes de generar el embedding de búsqueda.
 * Esto mejora el recall del RAG para preguntas como "BPM", "RIT", "SST", etc.
 *
 * Estrategia:
 * 1. Detectar siglas conocidas en la query.
 * 2. Concatenar la expansión al final de la query original (no reemplaza).
 * 3. El embedding resultante captura tanto la sigla como su significado completo.
 */

// Diccionario de siglas y términos del dominio HR / Manufactura / Plastitec
const ACRONYM_DICTIONARY = {
  // ── Calidad y Manufactura ──────────────────────────────────────────────────
  'BPM':    'buenas prácticas de manufactura higiene producción calidad inocuidad manufactura',
  'BPMM':   'buenas prácticas de manufactura mejoramiento higiene producción calidad inocuidad',
  'BPA':    'buenas prácticas de almacenamiento bodega inventario',
  'HACCP':  'análisis de peligros puntos de control críticos inocuidad alimentos',
  'ISO':    'norma internacional organización estandarización calidad certificación',
  'POES':   'procedimientos operativos estandarizados sanitización limpieza higiene',

  // ── Recursos Humanos y Reglamento ────────────────────────────────────────
  'RIT':    'reglamento interno de trabajo normas disciplina laboral empleados obligaciones derechos sanciones prohibiciones reglamento interno',
  'RRHH':   'recursos humanos gestión personal talento humano empleados nómina compensación bienestar humano',
  'RR.HH':  'recursos humanos gestión personal talento humano empleados',

  // ── Seguridad y Salud ─────────────────────────────────────────────────────
  'SST':    'seguridad salud en el trabajo riesgos laborales accidentes prevención protección seguridad industrial higiene ocupacional',
  'SGSST':  'sistema gestión seguridad salud trabajo normas OSHA prevención riesgos accidentes laborales',
  'EPP':    'equipo de protección personal casco guantes botas seguridad industrial protección individual elementos de seguridad',
  'SST-EPP': 'seguridad industrial equipo protección personal elementos seguridad prevención riesgos',

  // ── Nómina y Legal ────────────────────────────────────────────────────────
  'VACACIONES': 'vacaciones días de descanso licencia remunerada periodo vacacional tiempo libre descanso remunerado',
  'CONTRATO': 'contrato de trabajo tipo vinculación indefinido fijo obra labor vinculación laboral relación de trabajo',
  'SMLV':   'salario mínimo legal vigente Colombia remuneración básica sueldo mínimo pago legal',

  // ── Corporativo ──────────────────────────────────────────────────────────
  'PLASTITEC': 'empresa plastitec información corporativa misión visión valores historia industria plásticos fabricación',
  'MISION': 'misión corporativa propósito fundamental objetivo principal razón de ser compromiso plastitec',
  'VISION': 'visión corporativa futuro metas largo plazo objetivos estratégicos proyección plastitec',
  'VALORES': 'valores corporativos ética principios comportamiento cultura organizacional plastitec',
};

// Términos sinónimos / reformulaciones semánticas en cadena
const TERM_EXPANSIONS = {
  'normas':            'reglas políticas directrices procedimientos reglamentos estatutos mandatos',
  'seguridad':         'prevención protección riesgos cuidado industrial SST accidentalidad',
  'accidente':         'lesión incidente riesgo laboral reporte emergencia urgencia ATEP',
  'sanciones':         'disciplina faltas llamados de atención suspensión descargos multas correcciones',
  'permisos':          'licencias ausencias justificaciones permisos remunerados no remunerados',
  'tarde':             'retraso llegada tarde demora retardo falta impuntualidad horario',
  'calidad':           'procesos BPM estándares excelencia mejora continua auditoría control',
  'BPM':               'buenas prácticas manufactura calidad inocuidad procesos producción higiene',
  'procedimientos':    'pasos manuales instrucciones guías protocolos flujos de trabajo métodos',
  'empresa':           'compañía organización corporación firma Plastitec negocio institución',
  'quiénes somos':     'historia origen fundadores trayectoria equipo nosotros identidad corporativa',
};

class QueryExpansionService {
  /**
   * Expande una query corta o con siglas antes del embedding.
   * @param {string} query - Query original del usuario.
   * @returns {string} - Query expandida (original + términos de expansión).
   */
  expand(query) {
    if (!query || typeof query !== 'string') return query;

    const originalQuery = query.trim();
    const lowerQuery = originalQuery.toLowerCase();
    const expansions = new Set();

    // 1. Buscar siglas conocidas (case-insensitive, palabra completa)
    for (const [acronym, expansion] of Object.entries(ACRONYM_DICTIONARY)) {
      const pattern = new RegExp(`\\b${acronym.replace(/[-]/g, '[\\-]')}\\b`, 'i');
      if (pattern.test(originalQuery)) {
        expansions.add(expansion);
        console.log(`[QueryExpansion] Sigla detectada: "${acronym}" → expansión agregada`);
      }
    }

    // 2. Buscar términos/frases simples
    for (const [term, expansion] of Object.entries(TERM_EXPANSIONS)) {
      if (lowerQuery.includes(term.toLowerCase())) {
        expansions.add(expansion);
        console.log(`[QueryExpansion] Término detectado: "${term}" → expansión agregada`);
      }
    }

    // 3. Si la query es muy corta (≤ 4 palabras) y no hay expansión aún,
    //    detectar siglas genéricas (2-5 letras mayúsculas consecutivas)
    const wordCount = originalQuery.split(/\s+/).length;
    if (wordCount <= 4 && expansions.size === 0) {
      const genericAcronyms = originalQuery.match(/\b[A-ZÁÉÍÓÚ]{2,5}\b/g);
      if (genericAcronyms && genericAcronyms.length > 0) {
        console.log(`[QueryExpansion] Posibles siglas sin diccionario: ${genericAcronyms.join(', ')} — query corta, se mantiene sin cambios.`);
      }
    }

    if (expansions.size === 0) {
      return originalQuery; // No hay nada que expandir
    }

    // Concatenar expansiones únicas a la query original
    const expandedPart = [...expansions].join(' ');
    const expandedQuery = `${originalQuery} ${expandedPart}`;

    console.log(`[QueryExpansion] Query original  : "${originalQuery}"`);
    console.log(`[QueryExpansion] Query expandida : "${expandedQuery.substring(0, 150)}${expandedQuery.length > 150 ? '...' : ''}"`);

    return expandedQuery;
  }

  /**
   * Retorna true si la query se beneficia de expansión.
   * @param {string} query
   * @returns {boolean}
   */
  needsExpansion(query) {
    if (!query) return false;
    const wordCount = query.trim().split(/\s+/).length;
    return wordCount <= 6;
  }
}

export default new QueryExpansionService();
