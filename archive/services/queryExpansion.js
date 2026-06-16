/**
 * QueryExpansion Service v4.0 - Optimized
 * Expande siglas y términos específicos pero evita ruido en preguntas largas.
 */

// Diccionario de siglas y términos del dominio Plastitec
const ACRONYM_DICTIONARY = {
  // ── Calidad y Manufactura ──────────────────────────────────────────────────
  'BPM':    'buenas prácticas de manufactura higiene calidad',
  'BPMM':   'buenas prácticas de manufactura mejoramiento',
  'BPA':    'buenas prácticas de almacenamiento bodega',
  'HACCP':  'análisis de peligros puntos de control críticos inocuidad',
  'ISO':    'normas internacionales de calidad estandarización',
  'POES':   'procedimientos operativos estandarizados sanitización limpieza',
  
  // ── Recursos Humanos y Reglamento ────────────────────────────────────────
  'RIT':    'reglamento interno de trabajo normas disciplina sanciones prohibiciones',
  'RRHH':   'recursos humanos personal empleados talento humano',
  
  // ── Seguridad y Salud ─────────────────────────────────────────────────────
  'SST':    'seguridad salud en el trabajo riesgos laborales',
  'SGSST':  'sistema gestión seguridad salud trabajo riesgos',
  'SG-SST': 'sistema gestión seguridad salud trabajo riesgos',
  'COPASST': 'comité paritario seguridad salud trabajo copasst funciones integrantes',
  'EPP':    'equipo de protección personal casco guantes botas protección',
  
  // ── Legal y Cumplimiento ──────────────────────────────────────────────────
  'SAGRILAFT': 'sistema autocontrol gestión riesgo integral lavado activos financiación terrorismo',
  'OEA':    'operador económico autorizado seguridad cadena suministro comercio exterior',

  // ── Corporativo ──────────────────────────────────────────────────────────
  'PLASTITEC': 'empresa plastitec información corporativa plásticos',
  'MISION': 'misión corporativa propósito fundamental compromiso',
  'VISION': 'visión corporativa futuro metas largo plazo',
  'VALORES': 'valores corporativos ética principios comportamiento'
};

// Términos clave con expansiones mínimas
const TERM_EXPANSIONS = {
  'sanciones':         'disciplina faltas llamados atención suspensión descargos',
  'permisos':          'licencias ausencias permisos remunerados',
  'tarde':             'retraso llegada tarde demora retardo impuntualidad',
  'accidente':         'incidente laboral riesgo reporte emergencia',
};

class QueryExpansionService {
  /**
   * Expande una query corta o con siglas antes del embedding.
   */
  expand(query) {
    if (!query || typeof query !== 'string') return query;

    const originalQuery = query.trim();
    const words = originalQuery.split(/\s+/);
    
    // REGLA CRÍTICA: Si la pregunta es larga, ya tiene contexto suficiente. Omitiendo expansión para evitar ruido.
    if (words.length > 6) {
      console.log(`[QueryExpansion] Query larga detectada (${words.length} palabras). Omitiendo expansión.`);
      return originalQuery;
    }

    const lowerQuery = originalQuery.toLowerCase();
    const expansions = new Set();

    // 1. Buscar siglas conocidas
    for (const [acronym, expansion] of Object.entries(ACRONYM_DICTIONARY)) {
      const pattern = new RegExp(`\\b${acronym.replace(/[-]/g, '[\\-]')}\\b`, 'i');
      if (pattern.test(originalQuery)) {
        expansions.add(expansion);
        console.log(`[QueryExpansion] Sigla detectada: "${acronym}"`);
      }
    }

    // 2. Buscar términos específicos (solo si no hay siglas para no sobrecargar)
    if (expansions.size === 0) {
      for (const [term, expansion] of Object.entries(TERM_EXPANSIONS)) {
        if (lowerQuery.includes(term.toLowerCase())) {
          expansions.add(expansion);
        }
      }
    }

    if (expansions.size === 0) return originalQuery;

    // Concatenar expansiones únicas
    const expandedPart = [...expansions].join(' ');
    const expandedQuery = `${originalQuery} ${expandedPart}`;

    console.log(`[QueryExpansion] Query expandida : "${expandedQuery}"`);
    return expandedQuery;
  }
}

export default new QueryExpansionService();
