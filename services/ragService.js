/**
 * RagService v7.1 — Plastitec AI
 *
 * Cambios respecto a v7.0:
 *   - Fase 2.5.1: Integra neuralRerankingService (Cross-Encoder bge-reranker-base)
 *   - Activación mediante flag ENABLE_NEURAL_RERANKER=true en .env
 *   - Pipeline de producción INTACTO si el flag está desactivado
 *   - Flujo Neural: Top-15 Qdrant → Top-8 Cross-Encoder → Top-4 LLM
 *
 * Cambios respecto a v6.5:
 *   - MAX_BASE_CHUNKS: 3 → 6
 *   - MAX_CONTEXT_LENGTH: 3500 → 6000
 *   - Integra rerankingService (BM25 + keyword density + phrase boost)
 *   - Integra ragLogger (logging estructurado completo)
 *   - _strictGroundingValidator reemplazado por _intelligentGroundingValidator
 *     (solo bloquea entidades/fechas/artículos inventados)
 *   - Section title boosting integrado en rerankingService
 *   - Neighbor retrieval con expansión 1-3 según score
 */

import embeddingsService from './embeddingsService.js';
import qdrantService from './qdrantService.js';
import llmService from './llmService.js';
import intentRoutingService from './intentRoutingService.js';
import rerankingService from './rerankingService.js';
import neuralRerankingService from './neuralRerankingService.js';
import ragLogger from './ragLogger.js';
import queryUnderstandingService from './queryUnderstandingService.js';
import acronymResolver from './acronymResolver.js';
import retrievalConfidence from './retrievalConfidence.js';
import { cleanResponse, polarityAwareClean } from '../utils/textProcessor.js';
import responseTypeResolver from './responseTypeResolver.js';
import responseBuilderService from './responseBuilderService.js';
import citationValidator from './citationValidator.js';
import { SYSTEM_MESSAGES } from '../config/systemMessages.js';

// ─── Vocabulario conocido para detección de gibberish ─────────────────────
// Palabras HR/español que indican que la query tiene sentido.
// Construido de: DOC_PRIORITY_MAP keywords (más abajo) + léxico HR frecuente.
// Las entradas con tilde y sin tilde coexisten para cubrir escritura informal.
const KNOWN_VOCAB_EXTRA = new Set([
    // Trabajo / empleado
    'trabajo', 'trabajar', 'trabajador', 'trabajadores', 'empleado', 'empleados',
    'empresa', 'laboral', 'laborales', 'cargo', 'puesto', 'jefe', 'supervisor',
    // Documentos / normas
    'reglamento', 'norma', 'normas', 'regla', 'reglas', 'politica', 'política',
    'procedimiento', 'instructivo', 'manual', 'ley', 'articulo', 'artículo',
    // Jornada / tiempo
    'jornada', 'horario', 'turno', 'turnos', 'hora', 'horas', 'semana', 'dia', 'día',
    'descanso', 'vacaciones', 'permiso', 'licencia', 'ausencia', 'falta',
    // Pago / nómina
    'salario', 'sueldo', 'pago', 'nomina', 'nómina', 'quincena', 'subsidio',
    'auxilio', 'prestacion', 'prestación', 'prestaciones', 'cesantias', 'cesantías',
    'beneficio', 'beneficios', 'extralegal', 'extralegales',
    // Dotación / uniforme
    'uniforme', 'uniformes', 'dotacion', 'dotación', 'ropa', 'calzado', 'zapatos',
    'guante', 'guantes', 'casco', 'cofia', 'overol', 'polainas', 'escafandra',
    // Higiene / BPM
    'higiene', 'lavado', 'sanitizacion', 'sanitización', 'inocuidad', 'manufactura',
    'planta', 'produccion', 'producción', 'area', 'área', 'zona', 'comedor',
    // SST / seguridad
    'accidente', 'incidente', 'riesgo', 'riesgos', 'emergencia', 'seguridad', 'salud',
    'epp', 'proteccion', 'protección', 'peligro', 'incapacidad', 'incapacidades',
    // RRHH / procesos
    'contrato', 'despido', 'renuncia', 'queja', 'reclamo', 'capacitacion', 'capacitación',
    'induccion', 'inducción', 'evaluacion', 'evaluación', 'sancion', 'sanción',
    'disciplinario', 'amonestacion', 'amonestación', 'suspension', 'suspensión',
    // Objetos / comportamiento (queries de política de uso)
    'celular', 'telefono', 'teléfono', 'camara', 'cámara', 'reloj', 'audifono', 'audífono',
    'fumar', 'tabaco', 'cigarrillo', 'alcohol', 'bebida', 'comer', 'alimentos',
    // Higiene corporal (evitar falso positivo de gibberish)
    'defecar', 'orinar', 'sanitario', 'bano', 'baño', 'lavamanos',
    // Conectividad / teletrabajo
    'teletrabajo', 'remoto', 'casa', 'virtual', 'digital', 'desconexion', 'desconexión',
    // Valores / ética
    'etica', 'ética', 'etico', 'ético', 'integridad', 'conducta', 'denuncia',
    'corrupcion', 'corrupción', 'soborno', 'transparencia',
    // Preguntas con sustantivo válido
    'cuantas', 'cuántas', 'cuantos', 'cuántos', 'aplica', 'aplican', 'permite', 'pueden',
    // Glosario RIT 2026 (2026-08-14) — vocabulario/sinónimos entregados por el
    // usuario a partir del propio RIT. Cierra gaps de gate confirmados: sin
    // estos términos, preguntas legítimas sobre contratación, disciplina o
    // confidencialidad caían en "No encontré información" pese a existir en
    // el RIT (mismo patrón de bug que período de prueba/aspirantes).
    'prorroga', 'prórroga', 'jornal', 'estipendio', 'remuneracion', 'remuneración',
    'postulante', 'candidato', 'candidatos',
    'calamidad', 'domestica', 'doméstica',
    'descargo', 'descargos', 'proceso disciplinario',
    'confidencialidad', 'reserva', 'discrecion', 'discreción', 'sigilo',
    'indumentaria', 'infraccion', 'infracción', 'penalidad',
    'justificaciones', 'dispensa',
]);

// ─── Constantes de dominio ─────────────────────────────────────────────────

const SPANISH_STOPWORDS = new Set([
    'el', 'la', 'los', 'las', 'de', 'del', 'que', 'como', 'puede', 'pueden',
    'durante', 'empresa', 'para', 'por', 'una', 'un', 'en', 'y', 'es', 'se',
    'su', 'sus', 'con', 'al', 'lo', 'no', 'si', 'más', 'pero', 'o', 'qué',
    'cuál', 'cuáles', 'cómo', 'debe', 'deben', 'son', 'hay', 'entre', 'sobre',
    'este', 'esta', 'estos', 'estas', 'ser', 'tiene', 'tienen', 'vez',
]);

const EXACT_ACRONYMS = ['copasst', 'sg-sst', 'sgsst', 'sagrilaft', 'oea', 'bpm', 'rit'];

const DOC_PRIORITY_MAP = [
    {
        keywords:     ['visitante', 'visita', 'overol', 'polaina', 'ropa de calle',
                       'escafandra', 'cofia', 'maquillaje', 'uniforme', 'lavado',
                       'hipoclorito', 'planchado'],
        boostDocs:    ['bpm', 'bpmm', 'visita', 'higiene', 'induccion'],
        penalizeDocs: ['rit', 'reglamento', 'comunicado'],
    },
    {
        keywords:     ['aprendiz', 'sena', 'contrato aprendizaje', 'contrato de aprendizaje',
                       'pasantia', 'pasantía', 'practicante', 'pasante'],
        boostDocs:    ['rit', 'reglamento'],
        penalizeDocs: ['bpm'],
    },
    {
        keywords:     ['copasst', 'comité paritario', 'funciones copasst'],
        boostDocs:    ['induccion', 'sst'],
        penalizeDocs: ['bpm', 'etica'],
    },
    {
        keywords:     ['misión', 'visión', 'valores', 'historia', 'quiénes somos', 'plastitec'],
        boostDocs:    ['conocimiento', 'visual', 'empresa'],
        penalizeDocs: ['comunicado'],
    },
    // ── SAGRILAFT / LAFT ────────────────────────────────────────────────────
    {
        keywords:     [
            'sagrilaft', 'laft', 'la/ft', 'riesgo laft',
            'lavado de activos', 'lavado activos',
            'financiación del terrorismo', 'financiacion del terrorismo',
            'financiación terrorismo', 'financiacion terrorismo',
            'terrorismo', 'autocontrol', 'prevención laft', 'prevencion laft',
            'ofac', 'riesgo integral', 'datos prohibidos', 'datos personales',
        ],
        boostDocs:    ['i-rh-017', 'etica', 'rit', 'reglamento'],
        penalizeDocs: ['bpm', 'induccion'],
    },
    // ── CÓDIGO DE ÉTICA / CONDUCTA ÉTICA ─────────────────────────────────────
    {
        keywords:     [
            'etica', 'ética', 'etico', 'ético',
            'conducta', 'conducta ética', 'conducta etica',
            'comportamiento etico', 'comportamiento ético',
            'integridad', 'transparencia',
            'conflicto de interes', 'conflicto de interés',
            'soborno', 'corrupción', 'corrupcion',
            'denuncia', 'canal etico', 'canal ético',
            'código de ética', 'codigo de etica',
            'valores corporativos', 'principios corporativos',
            'regalo', 'beneficio indebido', 'conflicto interes',
        ],
        boostDocs:    ['i-rh-017', 'etica', 'codigo'],
        penalizeDocs: ['bpm', 'induccion'],
    },
    // ── Ingreso/acceso a áreas (2026-06-15) ──────────────────────────────────
    // Prioriza los instructivos dedicados de ingreso (I-RH-009/010/011) sobre el
    // BPM general, que puntúa muy alto semánticamente pero describe las áreas a
    // nivel de prácticas, no del procedimiento de ingreso paso a paso.
    {
        keywords:     [
            'ingreso a areas', 'ingreso a áreas', 'ingreso a area', 'ingreso a área',
            'acceso a areas', 'acceso a áreas', 'ingreso a zona', 'proceso de ingreso',
            'areas blancas', 'áreas blancas', 'areas grises', 'áreas grises',
            'areas negras', 'áreas negras', 'area blanca', 'área blanca',
            'area gris', 'área gris', 'area negra', 'área negra',
        ],
        boostDocs:    ['i-rh-009', 'i-rh-010', 'i-rh-011', 'ingreso_areas'],
        penalizeDocs: ['bpm'],
    },
    // ── Procedimiento de incapacidad / ausencia por enfermedad (2026-06-15) ───
    // El procedimiento accionable (reporte, soportes) vive en el RIT; I-RH-004
    // (Inducción SST) domina por score semántico pero es contexto general de SST.
    // Keywords acotadas a ausencia/incapacidad para NO capturar queries generales
    // de "enfermedades laborales" donde I-RH-004 sí es la fuente correcta.
    {
        keywords:     [
            'incapacidad', 'incapacidades', 'faltar por enfermedad',
            'ausencia por enfermedad', 'permiso por enfermedad',
            'licencia por enfermedad', 'reporte de incapacidad', 'justificar ausencia',
        ],
        boostDocs:    ['rit', 'reglamento'],
        penalizeDocs: ['induccion', 'i-rh-004'],
    },
    // ── Debido Proceso / Descargos (2026-08-14) ───────────────────────────────
    // Diligencia de descargos previa a sanción disciplinaria (citación con
    // antelación mínima, derecho a defensa/pruebas/acompañamiento sindical).
    // Sin regla, "descargos"/"debido proceso" comparte vocabulario genérico
    // con "sanción"/"disciplinario" y puede atraer chunks de faltas/escala
    // sancionatoria en vez del procedimiento de citación en sí.
    {
        keywords:     [
            'descargo', 'descargos', 'debido proceso', 'citacion a descargos',
            'citación a descargos', 'derecho de defensa', 'presentar descargos',
            'diligencia de descargos',
        ],
        boostDocs:    ['rit', 'reglamento'],
        penalizeDocs: ['induccion', 'bpm'],
    },
    // ── Calamidad Doméstica (2026-08-14) ──────────────────────────────────────
    {
        keywords:     [
            'calamidad domestica', 'calamidad doméstica', 'permiso por calamidad',
            'licencia por calamidad',
        ],
        boostDocs:    ['rit', 'reglamento'],
        penalizeDocs: ['induccion', 'bpm'],
    },
    // ── Tipos de Contrato (2026-08-14) ────────────────────────────────────────
    // Distingue de queries genéricas de "contrato" (palabra muy frecuente en
    // todo el corpus) cuando la pregunta apunta a la clasificación misma.
    {
        keywords:     [
            'contrato a termino fijo', 'contrato a término fijo',
            'contrato a termino indefinido', 'contrato a término indefinido',
            'contrato por obra o labor', 'contrato de obra o labor',
            'tipos de contrato', 'clases de contrato', 'prorroga del contrato',
            'prórroga del contrato',
        ],
        boostDocs:    ['rit', 'reglamento'],
        penalizeDocs: ['induccion', 'bpm'],
    },
    // ── Quejas y reclamos (2026-06-15) ───────────────────────────────────────
    // El trámite de reclamos está en el RIT (Cap. XXIV, Art. 110-111). Refuerza
    // el ranking además de la expansión sinonímica del vocabulario.
    {
        keywords:     [
            'quejas y reclamos', 'queja', 'reclamo', 'reclamos',
            'procedimiento de reclamo', 'tramite de reclamo', 'trámite de reclamo',
        ],
        boostDocs:    ['rit', 'reglamento'],
        penalizeDocs: ['induccion', 'bpm'],
    },
    // ── Jornada laboral / horarios / horas extras (2026-07-09) ───────────────
    // El CAPITULO VII del RIT (Art. 23-28) regula horarios; CAPITULO VIII (Art.
    // 29-33) regula horas extras. Sin esta regla, queries de "horas laborales"
    // o "turno" atraen chunks de SST/BPM que hablan de "turnos de riesgo".
    {
        keywords:     [
            'jornada', 'jornada laboral', 'jornada de trabajo',
            'horario', 'horario de trabajo', 'horario laboral',
            'horas laborales', 'horas de trabajo', 'horas semanales',
            'turno', 'turnos', 'trabajo por turnos', 'turno de trabajo',
            'hora extra', 'horas extras', 'trabajo suplementario', 'trabajo nocturno',
            'recargo nocturno', 'jornada maxima', 'jornada máxima',
            'descanso remunerado', 'jornada flexible',
        ],
        boostDocs:    ['rit', 'reglamento'],
        penalizeDocs: ['induccion', 'i-rh-004', 'bpm'],
    },
    // ── Alcohol / Embriaguez / Sustancias Psicoactivas (2026-08-03) ──────────
    // Contenido disperso en 4 documentos (RIT Art. 81.2 + faltas graves 14/40,
    // I-RH-004 política SST, I-RH-017 código de ética punto 10, BPM higiene).
    // Sin regla, la consulta llega al reranking sin ningún boost léxico/documental
    // (ver diagnostico_rag.md sección 4-5: confidence_score 0.0000 → Fast Reject).
    {
        keywords:     [
            'embriaguez', 'embriagado', 'embriagada', 'borracho', 'borracha',
            'tomado', 'tomada', 'ebrio', 'ebria', 'alicorado', 'alicorada',
            'trago', 'tragos', 'licor', 'drogado', 'drogada', 'colgado', 'colgada',
            'alcohol', 'sustancias psicoactivas', 'sustancias sicoactivas',
            'sustancia psicoactiva', 'ingesta de alcohol',
        ],
        boostDocs:    ['rit', 'reglamento', 'i-rh-004', 'i-rh-017', 'i-rh-003', 'bpm'],
        penalizeDocs: [],
    },
    // ── Acoso Laboral / Acoso Sexual (2026-08-03) ─────────────────────────────
    // Cap. XXIX-XXXI del RIT. Dominio altamente sensible/disciplinario sin
    // ninguna cobertura previa en vocabulario, frases de dominio ni prioridad
    // documental — mismo patrón de gap que alcohol/embriaguez.
    {
        keywords:     [
            'acoso laboral', 'acoso sexual', 'hostigamiento', 'maltrato laboral',
            'bullying', 'me acosan', 'me está acosando', 'me tocó sin permiso',
            'chantaje sexual', 'comité de convivencia', 'persecución laboral',
            'discriminación laboral', 'favores sexuales', 'insinuaciones',
            'mi jefe me maltrata', 'me humillan', 'me hostigan',
        ],
        boostDocs:    ['rit', 'reglamento'],
        penalizeDocs: ['induccion', 'bpm'],
    },
    // ── Período de Prueba / Selección y Admisión de Personal (2026-08-14) ────
    // Gap confirmado por pruebas NotebookLM: ambos temas existen en el RIT
    // (Cap. IV período de prueba; Art. 2 Parágrafo 1 prohibiciones de admisión)
    // con retrieval score 0.72-0.77 en Qdrant, pero ningún token de la query
    // ("período de prueba", "aspirantes", "selección") estaba en el vocabulario
    // curado → hasTopicalSignal=false → SYSTEM_MESSAGES.NO_MATCH antes del LLM.
    {
        keywords:     [
            'periodo de prueba', 'período de prueba', 'periodo de prueba laboral',
            'duracion del periodo de prueba', 'duración del período de prueba',
            'aspirante', 'aspirantes', 'proceso de seleccion', 'proceso de selección',
            'seleccion de personal', 'selección de personal',
            'admision de personal', 'admisión de personal', 'proceso de admision',
            'proceso de admisión', 'requisitos de ingreso', 'requisitos de vinculacion',
            'requisitos de vinculación', 'vinculacion laboral', 'vinculación laboral',
            'prohibido exigir', 'prueba de embarazo', 'examen de sida',
            'libreta militar',
        ],
        boostDocs:    ['rit', 'reglamento'],
        penalizeDocs: ['induccion', 'bpm'],
    },
    // ── Terminación con Justa Causa / Despido (2026-08-03) ────────────────────
    {
        keywords:     [
            'despido', 'me despiden', 'me pueden despedir', 'echar del trabajo',
            'terminación con justa causa', 'justa causa', 'terminar mi contrato',
            'causales de terminación', 'me pueden echar',
        ],
        boostDocs:    ['rit', 'reglamento'],
        penalizeDocs: [],
    },
    // ── Teletrabajo / Trabajo Remoto / Trabajo en Casa (2026-08-03) ───────────
    {
        keywords:     [
            'teletrabajo', 'teletrabajador', 'trabajo en casa', 'trabajo remoto',
            'home office', 'trabajar desde la casa', 'trabajar virtual desde casa',
        ],
        boostDocs:    ['rit', 'reglamento'],
        penalizeDocs: ['induccion', 'bpm'],
    },
    // ── Dotación Laboral (prestación económica — Art. 58 RIT) (2026-08-03) ────
    // Distinto del uniforme/higiene de BPM (regla 1): aquí la consulta es sobre
    // la PRESTACIÓN (frecuencia, derecho, fechas de entrega), no el uso en planta.
    {
        keywords:     [
            'dotación laboral', 'cada cuanto dan dotacion', 'cada cuánto dan dotación',
            'derecho a dotacion', 'derecho a dotación', 'entrega de dotacion',
            'entrega de dotación', 'cuantas dotaciones al año', 'tres dotaciones al año',
            'suministro de dotación',
        ],
        boostDocs:    ['rit', 'reglamento'],
        penalizeDocs: [],
    },
    // ── Uso de Tecnología / Redes Sociales (2026-08-03) ───────────────────────
    {
        keywords:     [
            'redes sociales', 'whatsapp del trabajo', 'whatsapp corporativo',
            'me revisan el correo', 'revisan mi computador', 'monitoreo de herramientas',
            'publicar en facebook', 'hablar mal de la empresa en redes',
            'facebook', 'instagram', 'hablar mal de la empresa',
        ],
        boostDocs:    ['rit', 'reglamento'],
        penalizeDocs: ['induccion', 'bpm'],
    },
];

// ─── Configuración de retrieval ─────────────────────────────────────────────
const MAX_BASE_CHUNKS    = 6;    // Era 3
const MAX_CONTEXT_LENGTH = 6000; // Era 3500
const MIN_SCORE_THRESHOLD = 0.08;

// ─── Clase principal ───────────────────────────────────────────────────────

class RagService {

    async processQuery(query) {
        const session = ragLogger.startSession(query);
        const metrics = { expansion_ms: 0, embedding_ms: 0, retrieval_ms: 0, rerank_ms: 0, llm_ms: 0, total_ms: 0 };
        const startTotal = Date.now();

        try {
            // ── ETAPA 1: Query Understanding & Expansión ──────────────────
            const startExpansion = Date.now();
            const intent         = intentRoutingService.detectIntent(query);
            const intentParams   = intentRoutingService.getParams(intent);
            
            const { expanded_query, expanded_terms, normalizedTerms, interpretation_hints = [] } = queryUnderstandingService.understand(query);

            // spellCorrectedQuery: query con typos corregidos, usada para todo lo que
            // compara contra el texto canónico del corpus: Embedding primario, keywords,
            // reranking léxico (BM25/keyword density) y exactPhraseSearch.
            // La query original (query) se conserva para: logs, acronymResolver
            // (case-insensitive, debe ver el texto tal como vino) y el conteo de
            // tokens de especificidad del Confidence Engine.
            const { normalizedQuery: spellCorrectedQuery } = queryUnderstandingService._normalizeSpelling(query.trim());


            const foundAcronyms  = acronymResolver.resolveAcronyms(query);

            const keywords       = this._extractKeywords(spellCorrectedQuery);
            const docPriority    = this._detectDocPriority(query);
            metrics.expansion_ms = Date.now() - startExpansion;

            ragLogger.logExpansion(session, {
                expandedQuery:   expanded_query,
                expandedTerms:   expanded_terms,
                normalizedTerms,
                spellCorrected:  spellCorrectedQuery !== query ? spellCorrectedQuery : null,
                keywords,
                intent,
                expansionMs:     metrics.expansion_ms,
            });

            // ── ETAPA 2: Dual Embedding ───────────────────────────────────
            // Embedding 1: query con typos corregidos (spellCorrectedQuery) — NO la raw.
            //   Esto garantiza que la normalización ortográfica llegue al índice vectorial.
            // Embedding 2: expanded_query — incluye expansión de acrónimos y términos.
            const startEmbedding  = Date.now();
            if (spellCorrectedQuery !== query) {
                console.log(`[Embedding] Usando query normalizada: "${query}" → "${spellCorrectedQuery}"`);
            }
            // (2026-10-08) Si se reconoció jerga (interpretation_hints), el modelo
            // de embeddings no sabe qué es "mi cucha" o "me echaron": el canal
            // semántico principal usa también la query expandida con los
            // términos de los documentos. Sin esto "mi cucha está enferma,
            // ¿puedo faltar?" daba similarity 0.33 → confidence 0.189 < 0.20 →
            // "No encontré información", aunque la expansión era correcta.
            const primaryEmbeddingText = interpretation_hints.length > 0 ? expanded_query : spellCorrectedQuery;
            const originalQueryEmbedding = await embeddingsService.generateEmbedding(primaryEmbeddingText);
            const expandedQueryEmbedding = await embeddingsService.generateEmbedding(expanded_query);
            metrics.embedding_ms  = Date.now() - startEmbedding;

            ragLogger.logEmbedding(session, {
                model:       process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text',
                dimension:   originalQueryEmbedding.length,
                embeddingMs: metrics.embedding_ms,
            });

            // ── ETAPA 3: Hybrid Retrieval V2 ──────────────────────────────
            const startRetrieval = Date.now();
            const topK = intentParams.topK || 20;

            // BUG CORREGIDO (2026-10-08): si había expansión, BM25 buscaba SOLO
            // los términos expandidos y descartaba las palabras del usuario.
            // Caso real: "si mi hijo se enferma, puedo tomar esto como
            // incapacidad" → BM25 buscó "tomar alcohol embriaguez sustancias
            // psicoactivas" sin "hijo/enferma/incapacidad". Ahora se usan las
            // keywords de la query MÁS la expansión (sin duplicados).
            const cleanKeywordQuery = [...new Set([...keywords, ...expanded_terms])].join(' ');
            
            const [semanticResults, expandedSemanticResults, keywordResults, exactPhraseResults] = await Promise.all([
                qdrantService.searchSimilar(originalQueryEmbedding, topK),
                qdrantService.searchSimilar(expandedQueryEmbedding, topK),
                qdrantService.searchKeyword(cleanKeywordQuery, 15),
                qdrantService.searchExactPhrase(spellCorrectedQuery, 10),
            ]);

            metrics.retrieval_ms = Date.now() - startRetrieval;

            ragLogger.logRetrieval(session, {
                semanticResults,
                bm25_results: keywordResults,
                phrase_results: exactPhraseResults,
                subQueryCount: 0,
                retrievalMs:   metrics.retrieval_ms,
            });

            // ── ETAPA 4: Weighted Fusion Reranking ────────────────────────
            const startRerank = Date.now();

            // Weighted Fusion
            // Semantic = 0.45, BM25 = 0.25, Exact Phrase = 0.20, Expanded Query = 0.10
            const merged = this._weightedFusion(
                semanticResults, 0.45,
                keywordResults, 0.25,
                exactPhraseResults, 0.20,
                expandedSemanticResults, 0.10
            );

            // Reranking léxico multi-factor
            const lexicalReranked = rerankingService.rerank(merged, spellCorrectedQuery, keywords, docPriority, foundAcronyms, expanded_terms);

            // ── Fase 2.5.1: Neural Reranking (Cross-Encoder) ──────────────
            // Sólo activo si ENABLE_NEURAL_RERANKER=true — producción no afectada
            let reranked = lexicalReranked;
            let neuralMetrics = { skipped: true };

            if (neuralRerankingService.isEnabled) {
                const { results, metrics: nm } = await neuralRerankingService.rank(
                    query,
                    lexicalReranked
                );
                reranked = results;
                neuralMetrics = nm;
            }

            metrics.rerank_ms = Date.now() - startRerank;

            // ── Garantía de supervivencia semántica ──────────────────────────
            // Los top-2 del retrieval semántico puro deben quedar siempre
            // dentro del top-6 final. Si el reranking léxico los desplazó
            // (p.ej. phrase-boost en chunks genéricos), los reinsertamos al
            // final del top-6 reemplazando el slot menos relevante.
            //
            // BUG CORREGIDO (2026-08-14): el slot reemplazado se elegía por
            // posición fija (6 - rescued.length), sin mirar SI ese slot ya lo
            // ocupaba un chunk con domainBoost fuerte (Ética/SAGRILAFT/Admisión,
            // rerankingService._domainSpecificBoost). Caso confirmado: la query
            // de "aspirantes/selección" hacía que este rescate expulsara del
            // top-6 justo al chunk boosteado a propósito (Art. 2 RIT, +0.45),
            // reinsertando en su lugar un resultado semántico genérico — la
            // regla de dominio quedaba anulada por este rescate. Fix: al elegir
            // qué slot sacrificar, saltar los que tengan domainBoost > 0.
            {
                const top6Ids  = new Set(reranked.slice(0, 6).map(r => r.id));
                const displaced = semanticResults.slice(0, 2).filter(r => !top6Ids.has(r.id));
                if (displaced.length > 0) {
                    const displacedIds = new Set(displaced.map(r => r.id));
                    const rescued  = reranked.filter(r => displacedIds.has(r.id));
                    const rest     = reranked.filter(r => !displacedIds.has(r.id));
                    let evictFrom  = Math.max(0, 6 - rescued.length);
                    while (evictFrom < rest.length && parseFloat(rest[evictFrom]?.scoreDetail?.domain || 0) > 0) {
                        evictFrom++;
                    }
                    rest.splice(evictFrom, rescued.length, ...rescued);
                    reranked = rest;
                    console.log(`[SemanticSurvival] ${displaced.length} chunk(s) rescatados → posiciones ${evictFrom + 1}–${evictFrom + rescued.length}`);
                }
            }

            ragLogger.logReranking(session, {
                rankedChunks:  reranked,
                fusion_results: merged.length,
                rerankMs:      metrics.rerank_ms,
                neural_active: neuralRerankingService.isEnabled,
                neural_metrics: neuralMetrics,
            });

            // ── ETAPA 5: Construcción de contexto & Retrieval Confidence ──
            const startContext = Date.now();
            const { contextText, chunksUsed, sources, rawConfidence, bestKeywordScore, bestHasSectionRelevance, logDetails } =
                await this._buildContextExpanded(reranked, query, keywords, expanded_terms);
            const contextMs = Date.now() - startContext;

            // Retrieval Confidence Engine (V2 — Query Specificity Score activo)
            // 2026-08-03: similarity/keywordDensity/hasSectionRelevance ahora vienen
            // del "best chunk" entre los que REALMENTE entraron al contexto
            // (ver _buildContextExpanded), no ciegamente de reranked[0]. Antes, un
            // DocBoost plano podía empatar varios chunks y dejar el relevante en
            // una posición != 0, subestimando confidence aunque el contenido
            // correcto sí estuviera en contextText (Fast Reject injusto).
            const { confidence, querySpecificityTokens } = retrievalConfidence.calculateConfidence({
                similarity: rawConfidence,
                keywordDensity: bestKeywordScore || 0,
                hasPhraseMatch: exactPhraseResults.length > 0,
                hasAcronymMatch: foundAcronyms.length > 0,
                hasSectionRelevance: bestHasSectionRelevance || false,
                query,
            });

            ragLogger.logContext(session, {
                contextText,
                chunksUsed,
                sources,
                confidence_score: confidence,
                query_specificity_tokens: querySpecificityTokens,
                contextMs,
            });

            // ── Validación Determinística de Entidades (Layer 1.5) ────────
            let isEntityHallucination = false;
            /* DESACTIVADO PARA A/B TESTING - ESTRATEGIA A
            if (keywords.length > 0 && contextText) {
                const contextLower = contextText.toLowerCase();
                const mainWords = keywords.filter(k => k.length > 4);
                if (mainWords.length > 0) {
                    let missingCount = 0;
                    for (const w of mainWords) {
                        const root = w.substring(0, 5); 
                        if (!contextLower.includes(root)) {
                            missingCount++;
                        }
                    }
                    if (missingCount / mainWords.length >= 0.5) {
                        isEntityHallucination = true;
                    }
                }
            }
            */

            // ── Sin contexto → respuesta de no encontrado ─────────────────
            const safeConfidence = isNaN(confidence) ? 0 : confidence;
            console.log(`[ConfidenceEngine] similarity=${rawConfidence.toFixed(3)} specificityTokens=${querySpecificityTokens} finalConfidence=${safeConfidence.toFixed(3)}`);

            // ── Relevancia Temática Mínima (2026-08-03 — fix de seguridad) ────
            // BUG DE SEGURIDAD CONFIRMADO (seguimiento_3.md #1): preguntas
            // completamente fuera de dominio ("¿Cuál es la capital de Francia?",
            // "¿Cuánto es 2+2?") cruzaban el gate de confianza 0.20 y el LLM
            // alucinaba respuestas citando fuentes RIT/SST de forma espuria.
            // Causa: el Domain Referent Rule de retrievalConfidence.js exige solo
            // "algún sustantivo específico", sin verificar que ese sustantivo
            // pertenezca al dominio de Plastitec — palabras genéricas muy
            // frecuentes en el corpus ("más", "trabajo") inflan BM25/keywordDensity
            // sin relevancia temática real.
            // Fix: exigir que la query dispare AL MENOS UNA señal real de que
            // toca el dominio HR/Plastitec — expansión de vocabulario corporativo,
            // acrónimo detectado, regla de DOC_PRIORITY_MAP, o un token léxico
            // presente en el vocabulario HR curado (KNOWN_VOCAB_EXTRA/DOC_PRIORITY_MAP,
            // NO el vocabulario genérico de _isGibberishQuery que incluye stopwords).
            // Es un guardrail ADICIONAL (solo puede rechazar más, nunca aceptar
            // algo que antes se rechazaba) — no toca retrieval/reranking/confidence.
            // BUG (2026-08-13): este gate compara contra el vocabulario canónico HR,
            // así que debe usar spellCorrectedQuery — igual que embedding/keywords/
            // reranking (ver comentario en la construcción de spellCorrectedQuery
            // más arriba). Usar `query` (raw) hacía que un typo de dominio real
            // ("lisencia", "acidentes lavorales") nunca matcheara el vocabulario
            // aunque la corrección ortográfica ya lo hubiera arreglado para el
            // resto del pipeline, rechazando la pregunta antes del retrieval.
            // (2026-10-08) Excepción por similitud alta: preguntas del dominio
            // cuyo vocabulario no está en la lista curada se rechazaban aunque
            // el retrieval fuera excelente. Caso TI BPM-5 ("¿Cómo se debe
            // realizar una corrección en un registro?") tenía similarity=0.944
            // y se respondía "No encontré información"; igual D7 "¿A quién le
            // aviso si me accidento?" (0.603) y E10 "Reporte de ARL." (0.659).
            // Calibración (benchmark_100 + 12 fuera de dominio, colección p0):
            // fuera de dominio y trampas de categoría C ≤ 0.537; preguntas
            // válidas sin vocabulario ≥ 0.603. Umbral 0.60.
            const TOPICAL_SIMILARITY_BYPASS = 0.60;
            const hasTopicalSignal = expanded_terms.length > 0
                || foundAcronyms.length > 0
                || docPriority.boost.length > 0
                || this._hasHRDomainToken(spellCorrectedQuery)
                || rawConfidence >= TOPICAL_SIMILARITY_BYPASS;

            if (!contextText || chunksUsed === 0 || safeConfidence < 0.20 || isEntityHallucination || !hasTopicalSignal) {
                const noContextResp = {
                    answer:      SYSTEM_MESSAGES.NO_MATCH,
                    confidence:  0,
                    sources:     [],
                    metrics,
                    chunksUsed:  0,
                };
                ragLogger.logResponse(session, {
                    rawResponse:      noContextResp.answer,
                    finalResponse:    noContextResp.answer,
                    llmMs:            0,
                    modelUsed:        'N/A (sin contexto)',
                    confidenceAware:  false,
                });
                metrics.total_ms = Date.now() - startTotal;
                return { ...noContextResp, metrics };
            }

            // ── Guardrail pre-LLM ─────────────────────────────────────────
            // Dos condiciones que indican que invocar el LLM producirá alucinación:
            // 1. Gibberish: ningún token de la query original está en el vocabulario.
            // 2. Señal débil: el 2º candidato rerankeado tiene score 0 y el top < 0.5.
            // Mismo fix que hasTopicalSignal arriba: comparar contra vocabulario
            // canónico requiere la query ya corregida ortográficamente.
            const isGibberish = this._isGibberishQuery(spellCorrectedQuery);
            const hasWeakRetrieval = reranked.length >= 2
                && (reranked[1].finalScore ?? 0) === 0
                && (reranked[0].finalScore ?? 0) < 0.50;

            if (isGibberish || hasWeakRetrieval) {
                const guardrailReason = isGibberish ? 'gibberish_query' : 'weak_retrieval';
                console.log(`[Guardrail] Interceptado pre-LLM: ${guardrailReason} | query="${query}"`);
                const reformMsg = SYSTEM_MESSAGES.NOT_UNDERSTOOD;
                ragLogger.logResponse(session, {
                    rawResponse:     reformMsg,
                    finalResponse:   reformMsg,
                    llmMs:           0,
                    modelUsed:       'N/A (guardrail)',
                    confidenceAware: false,
                });
                metrics.total_ms = Date.now() - startTotal;
                return { answer: reformMsg, confidence: 0, sources: [], metrics, chunksUsed: 0 };
            }

            // ── ETAPA 6 & 7: Pipeline de Extracción Multi-Etapa (Fase 2) ──
            // Fase 3.1: Clasificar tipo de respuesta determinísticamente
            const responseType = responseTypeResolver.classify(query);
            llmService.setResponseMode(responseType);

            const startLLM = Date.now();
            let finalResponse;

            try {
                const { jsonFacts, citations } = await llmService.generateRAGResponse(query, contextText, session, confidence, sources, interpretation_hints);
                let builtText = responseBuilderService.build(jsonFacts, responseType);
                let finalCitations = citations;

                // ── Validación post-generación (2026-10-08) ──────────────────
                // Solo sobre respuestas con contenido (no sobre rechazos).
                // Corrige citas de artículo/ley sin respaldo en el contexto,
                // nombres de archivo filtrados y códigos I-RH ajenos a las
                // fuentes; y detecta premisas no respaldadas (término de la
                // pregunta que la respuesta repite y no existe en ningún
                // documento — ej. "cumpleaños").
                if (!jsonFacts?.error) {
                    const v = citationValidator.validate(builtText, contextText, sources, spellCorrectedQuery);
                    if (v.changes.length > 0) {
                        console.log(`[CitationValidator] ${v.changes.length} corrección(es): ${v.changes.map(c => `"${c.from}" → "${c.to}"`).join(' | ')}`);
                    }
                    builtText = v.text;
                    if (v.echoOnly) {
                        // La respuesta era solo la copia del ejemplo del prompt.
                        console.log(`[CitationValidator] Respuesta = eco del ejemplo del prompt → sin información | query="${query}"`);
                        builtText = SYSTEM_MESSAGES.INSUFFICIENT_CONTEXT;
                        finalCitations = '';
                    } else if (v.unsupportedTerms.length > 0) {
                        const p = citationValidator.applyPremiseCheck(
                            builtText, v.unsupportedTerms,
                            SYSTEM_MESSAGES.UNSUPPORTED_PREMISE_PREFIX, SYSTEM_MESSAGES.UNSUPPORTED_PREMISE_SUFFIX
                        );
                        if (p.removed > 0) {
                            console.log(`[CitationValidator] Premisa no respaldada: [${v.unsupportedTerms.join(', ')}] — ${p.replacedAll ? 'respuesta reemplazada' : `${p.removed} oración(es) quitada(s)`} | query="${query}"`);
                        }
                        builtText = p.text;
                        if (p.replacedAll) finalCitations = '';
                    }
                }

                finalResponse = builtText + finalCitations;
            } catch (err) {
                console.error(`   ❌ LLM primario falló: ${err.message}.`);
                finalResponse = "Lo siento, hubo un problema técnico extrayendo la información solicitada.";
            }
            
            metrics.llm_ms = Date.now() - startLLM;
            metrics.total_ms = Date.now() - startTotal;

            ragLogger.logResponse(session, {
                rawResponse: finalResponse,
                finalResponse: finalResponse,
                llmMs: metrics.llm_ms,
                modelUsed: process.env.OLLAMA_MODEL || 'llama3.2',
                confidenceAware: false
            });

            const cleanedResponse = polarityAwareClean(cleanResponse(finalResponse), query);

            return {
                answer:          cleanedResponse,
                expandedQuery:   expanded_query,
                normalizedTerms,
                keywords,
                chunksUsed,
                confidence:      safeConfidence,
                sources:         sources || [],
                metrics,
                retrievalLogs:   logDetails,
                context:         contextText,
            };

        } catch (error) {
            console.error('\n❌ [RagService v7.0] Error crítico:', error.message);
            ragLogger.logError(session, { stage: 'pipeline', error });
            return {
                answer:     'Hubo un problema interno procesando la solicitud. Por favor, intenta de nuevo.',
                confidence: 0,
                sources:    [],
                metrics,
            };
        }
    }

    // ─── Extracción de Keywords ─────────────────────────────────────────────

    _extractKeywords(query) {
        return query
            .toLowerCase()
            .replace(/[¿?¡!]/g, '')
            .split(/\s+/)
            // Strip de puntuación al inicio/final del token ("laborales." → "laborales")
            // \p{L}\p{N} preserva letras Unicode españolas (á, é, ñ, ü) y dígitos.
            .map(w => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
            .filter(w => w.length > 2 && !SPANISH_STOPWORDS.has(w));
    }

    _detectDocPriority(query) {
        const lower = query.toLowerCase();

        // ── Área única (2026-10-08) ───────────────────────────────────────────
        // La regla de "Ingreso a áreas" del mapa subía por igual I-RH-009/010/011
        // con mencionar cualquier área. Sus textos son casi idénticos ("Póngase
        // la blusa blanca", "Quítese la ropa de calle"), así que en una pregunta
        // de área GRIS los chunks de blancas/negras quedaban arriba y el de
        // grises fuera del top-6 (prueba TI GRI-1: "según el instructivo
        // I-RH-009" → I-RH-009 ni siquiera entró al contexto). Causa de la
        // mezcla de procedimientos entre áreas (blusa blanca en áreas negras,
        // pasos de grises respondidos como de negras). Si la pregunta nombra
        // EXACTAMENTE un área (o su código), se sube solo ese instructivo y se
        // bajan los otros dos. Con varias áreas o ninguna → reglas de siempre.
        const AREA_DOCS = [
            { doc: 'i-rh-009', re: /(?<![\p{L}\p{N}])(i-?rh-?0?09|(?:[aá]reas?|zonas?)\s+gris(?:es)?)(?![\p{L}\p{N}])/iu },
            { doc: 'i-rh-010', re: /(?<![\p{L}\p{N}])(i-?rh-?0?10|(?:[aá]reas?|zonas?)\s+negras?)(?![\p{L}\p{N}])/iu },
            { doc: 'i-rh-011', re: /(?<![\p{L}\p{N}])(i-?rh-?0?11|(?:[aá]reas?|zonas?)\s+blancas?)(?![\p{L}\p{N}])/iu },
        ];
        const areasHit = AREA_DOCS.filter(a => a.re.test(lower));
        if (areasHit.length === 1) {
            const target = areasHit[0].doc;
            return {
                boost:    [target],
                penalize: AREA_DOCS.map(a => a.doc).filter(d => d !== target),
            };
        }

        // ── Documento nombrado por su título (2026-10-08) ─────────────────────
        // DOC_PRIORITY_MAP es "primera coincidencia gana" y tiene reglas muy
        // amplias antes que las específicas: 'plastitec' (regla corporativa)
        // subía el documento de Conocimiento en CUALQUIER pregunta que dijera
        // PLASTITEC — incluidas las del Código de Ética—, y 'lavado' subía el
        // BPM antes que el propio instructivo de Lavado de Manos (prueba TI
        // LAV-1: el chunk de "Alcance" de I-RH-012 quedaba fuera). Si la
        // pregunta nombra EXACTAMENTE un documento por su título, se sube ese.
        const TITLE_DOCS = [
            // El BPM repite texto genérico de lavado ("el instructivo está expuesto
            // en todos los lugares…") que el LLM tomaba en vez del alcance real.
            { doc: 'i-rh-012',      re: /lavado\s+de\s+(las\s+)?manos/, penalize: ['bpm'] },
            { doc: 'i-rh-017',      re: /c[oó]digo\s+de\s+[eé]tica/ },
            { doc: 'i-rh-003',      re: /buenas\s+pr[aá]cticas\s+de\s+manufactura|(?<![\p{L}])bpm(?![\p{L}])|i-?rh-?0?03(?![\d])/u },
            { doc: 'i-rh-006',      re: /visitas?\s+(a\s+la\s+)?planta\s*2|i-?rh-?0?06(?![\d])/ },
            { doc: 'i-rh-004',      re: /inducci[oó]n\s+(en\s+)?(sst|seguridad)|i-?rh-?0?04(?![\d])/ },
            { doc: 'rit_plastitec', re: /reglamento\s+interno|(?<![\p{L}])rit(?![\p{L}])/u },
        ];
        const titlesHit = TITLE_DOCS.filter(t => t.re.test(lower));
        if (titlesHit.length === 1) {
            return { boost: [titlesHit[0].doc], penalize: titlesHit[0].penalize || [] };
        }

        for (const rule of DOC_PRIORITY_MAP) {
            if (rule.keywords.some(k => lower.includes(k))) {
                return { boost: rule.boostDocs, penalize: rule.penalizeDocs };
            }
        }
        return { boost: [], penalize: [] };
    }

    _dedup(results) {
        const seen = new Set();
        return results.filter(r => {
            if (seen.has(r.id)) return false;
            seen.add(r.id);
            return true;
        });
    }

    // ─── Weighted Fusion ───────────────────────────────────────────────────

    _weightedFusion(semantic, wSem, bm25, wBM25, exact, wExact, expanded, wExp) {
        const scores = new Map();

        const addResults = (results, weight, type) => {
            if (!results) return;
            results.forEach((res, rank) => {
                // Base score logic: either use their own score normalized or a rank-based score
                // In exact phrase and keyword, score is already partially calculated.
                // Qdrant semantic score is typical cosine (0-1).
                let itemScore = res.score || (1 / (rank + 1));
                if (itemScore > 1) itemScore = 1;

                const weightedScore = itemScore * weight;
                if (scores.has(res.id)) {
                    const entry   = scores.get(res.id);
                    entry.score  += weightedScore;
                    entry.types.push(type);
                } else {
                    scores.set(res.id, { res, score: weightedScore, types: [type] });
                }
            });
        };

        addResults(semantic, wSem, 'semantic');
        addResults(bm25, wBM25, 'bm25');
        addResults(exact, wExact, 'exact_phrase');
        addResults(expanded, wExp, 'expanded_semantic');

        return Array.from(scores.values())
            .sort((a, b) => b.score - a.score)
            .map(item => ({
                ...item.res,
                fusionScore: item.score,
                searchType:  item.types.join('+'),
                finalScore:  item.score // Initialize finalScore
            }));
    }



    // ─── Construcción de contexto con neighbor retrieval ─────────────────

    async _buildContextExpanded(results, query, keywords, expandedTerms = []) {
        const MAX_CONTEXT_CHARS = 10000;
        const topScore = results.length > 0 ? results[0].finalScore : 0;
        const minThreshold = Math.max(0.20, topScore * 0.15);

        const criticalChunks = []; // Top 1-2
        const supportChunks = [];  // Rank 3-6
        const sourcesSet = new Set();
        const logDetails = [];

        for (let i = 0; i < results.length; i++) {
            const res = results[i];
            if (i >= 2 && res.finalScore < minThreshold) continue;
            
            if (i < 2) {
                criticalChunks.push(res);
            } else if (i < 6) {
                supportChunks.push(res);
            } else {
                break;
            }
            
            sourcesSet.add(res.payload.fuente);
            logDetails.push({
                source:      res.payload.fuente,
                score:       res.finalScore,
                searchType:  res.searchType,
                boosted:     res.boosted,
                boostReason: res.boostReason,
            });
        }

        // ── Neighbor Retrieval solo para críticos ─────────────────────────
        const neighborIndicesBySource = new Map();
        criticalChunks.forEach(c => {
            const src = c.payload.fuente;
            const idx = c.payload.chunk_index;
            if (!neighborIndicesBySource.has(src)) neighborIndicesBySource.set(src, new Set());
            const indices = neighborIndicesBySource.get(src);
            indices.add(idx - 1);
            indices.add(idx + 1);

            // Section Reconstruction: si el chunk parece un título, traer los siguientes
            const text = (c.payload.texto_original || '').trim();
            const isShortHeader = text.length < 120 && /^[A-ZÁÉÍÓÚÑ\s\-:.]{5,}$/.test(text.split('\n')[0]);
            if (isShortHeader) {
                for (let r = 1; r <= 3; r++) indices.add(idx + r);
            }
        });

        // ── Artículo completo (críticos Y de soporte) ─────────────────────
        // (2026-10-14) Artículos largos del RIT quedan fragmentados en muchos
        // chunks consecutivos por `_semanticChunkingByArticle` (ej. Art. 23
        // "Horario de Trabajo": 12 fragmentos — horario administrativo,
        // personal operativo, casos especiales de embarazo/adolescentes,
        // parágrafos legales). El radio ±1 de arriba solo corre para los 2
        // chunks "críticos" (top rank); si el fragmento con más relevancia
        // léxica (ej. el horario vigente) rankea como SOPORTE (rank 3-6) en
        // vez de crítico, nunca dispara neighbor retrieval y el fragmento
        // relevante puede quedar a 3+ posiciones de distancia — fuera del
        // radio ±1 de todas formas. Hallazgo real (2026-10-14): "¿cuál es el
        // horario de trabajo?" respondía solo el horario administrativo, sin
        // mencionar personal operativo ni los descansos especiales de
        // embarazadas. Fix: para CUALQUIER chunk (crítico o soporte) que
        // pertenezca a un artículo numerado, traer TODOS sus fragmentos por
        // section_title — no solo los vecinos por índice.
        const articleGroupsFetched = new Set(); // "fuente::section_title" ya pedidos
        const articleSections = [];
        [...criticalChunks, ...supportChunks].forEach(c => {
            const src = c.payload.fuente;
            const sectionTitle = c.payload.metadata?.section_title || '';
            if (!/^ART[IÍ]CULO/i.test(sectionTitle)) return;
            const key = `${src}::${sectionTitle}`;
            if (articleGroupsFetched.has(key)) return;
            articleGroupsFetched.add(key);
            articleSections.push({ source: src, sectionTitle });
        });

        // ── Recuperar chunks vecinos ───────────────────────────────
        const neighborPayloads = [];
        for (const [source, indicesSet] of neighborIndicesBySource.entries()) {
            const indices = Array.from(indicesSet).filter(i => i >= 0);
            if (indices.length === 0) continue;
            try {
                const payloads = await qdrantService.fetchPointsByIndices(source, indices);
                neighborPayloads.push(...payloads);
            } catch (err) {
                console.error(`   ⚠️ Fallo neighbor retrieval para ${source}: ${err.message}`);
            }
        }
        for (const { source, sectionTitle } of articleSections) {
            try {
                const payloads = await qdrantService.fetchPointsBySectionTitle(source, sectionTitle);
                neighborPayloads.push(...payloads);
            } catch (err) {
                console.error(`   ⚠️ Fallo fetch de artículo completo (${sectionTitle}) para ${source}: ${err.message}`);
            }
        }

        // ── Ensamblaje Inteligente (Sin Truncamiento Bruto) ──────────────────
        let currentChars = 0;
        const assembledSources = new Map(); // source -> Map<text, {chunkIndex, isCritical}>

        const addChunkToContext = (source, text, chunkIndex, isCritical = false) => {
            const clean = this._cleanText(text || '');
            if (clean.length < 10) return true;

            if (!assembledSources.has(source)) assembledSources.set(source, new Map());
            const map = assembledSources.get(source);
            if (map.has(clean)) return true; // ya existe, continuar buscando espacio

            if (currentChars + clean.length > MAX_CONTEXT_CHARS && !isCritical) {
                return false; // No hay espacio
            }

            map.set(clean, { chunkIndex, isCritical });
            currentChars += clean.length;
            return true;
        };

        // 1. Agregar Chunks Críticos (siempre entran)
        criticalChunks.forEach(c => addChunkToContext(c.payload.fuente, c.payload.texto_original, c.payload.chunk_index, true));

        // 2. Agregar Vecinos de Críticos (si hay espacio)
        // BUG CORREGIDO (2026-08-14): `break` cortaba el ensamblaje entero apenas
        // un chunk no cabía, descartando también a los que venían después en la
        // lista aunque fueran más pequeños y sí cupieran — un chunk voluminoso de
        // baja prioridad podía así bloquear a uno relevante (boosteado a propósito
        // por domainBoost) que llegaba más tarde en el orden. `continue` prueba
        // todos los candidatos restantes contra el presupuesto disponible.
        for (const p of neighborPayloads) {
            addChunkToContext(p.fuente, p.texto_original, p.chunk_index, false);
        }

        // 3. Agregar Chunks de Soporte (si hay espacio) — ver mismo fix arriba.
        for (const c of supportChunks) {
            addChunkToContext(c.payload.fuente, c.payload.texto_original, c.payload.chunk_index, false);
        }

        // (2026-10-14) Antes el resto (vecinos + soporte) se escribía en orden
        // de inserción, lo que dejaba artículos fragmentados (ej. RIT Art. 23,
        // 12 chunks) salpicados fuera de orden ("ARTICULO 23." intercalado con
        // Art. 113/22/29, y "Personal operativo" lejos del horario
        // administrativo) — dificultaba que el LLM sintetizara una respuesta
        // completa aunque TODO el contenido ya estuviera en el contexto. Los
        // chunks CRÍTICOS (más relevantes) se mantienen primero, en su propio
        // orden de relevancia; el resto se ordena por chunk_index entre sí
        // para que los fragmentos del mismo artículo queden contiguos y en su
        // orden natural del documento, sin tocar QUÉ chunks entran (eso ya se
        // decidió arriba) ni degradar la prioridad de lo más relevante.
        let finalContextText = '';
        for (const [source, textMap] of assembledSources.entries()) {
            finalContextText += `\n[[ FUENTE: ${source} ]]\n`;
            const entries = Array.from(textMap.entries());
            const critical = entries.filter(([, info]) => info.isCritical);
            const rest = entries
                .filter(([, info]) => !info.isCritical)
                .sort(([, a], [, b]) => (a.chunkIndex ?? 0) - (b.chunkIndex ?? 0));
            [...critical, ...rest].forEach(([t]) => finalContextText += `\n${t}\n`);
            finalContextText += '\n' + '─'.repeat(50) + '\n';
        }

        // ── Best Chunk (2026-08-03) ───────────────────────────────────────────
        // BUG CORREGIDO: el Confidence Engine usaba SIEMPRE `results[0]` (posición 0
        // tras la fusión/reranking) para similarity/keywordDensity/hasSectionRelevance,
        // incluso cuando el chunk realmente relevante entraba al contexto en otra
        // posición (p.ej. empatado en score por un DocBoost plano de DOC_PRIORITY_MAP).
        // Esto subestimaba `confidence_score` y producía Fast Rejects (< 0.20)
        // aunque el contenido correcto SÍ estuviera en `contextText`.
        // Fix: elegir, entre los chunks que REALMENTE entraron al contexto
        // (criticalChunks + supportChunks), el de mayor finalScore — con
        // keywordScore como primer desempate y cantidad de canales de búsqueda
        // corroborantes (searchType, ej. "bm25+expanded_semantic") como segundo
        // desempate — y usar ESE chunk para las métricas de confianza, no
        // ciegamente el primero del array.
        // Nota: keywordScore se calcula en rerankingService contra los tokens
        // LITERALES de la query (no contra expanded_terms), así que en casos
        // donde el chunk correcto solo matchea vía sinónimos expandidos
        // (ej. "embriagado" en la query vs "alcohol"/"embriaguez" en el corpus),
        // keywordScore puede quedar en 0 para TODOS los chunks empatados — de
        // ahí el desempate adicional por número de canales corroborantes.
        const channelCount = (c) => (c.searchType || '').split('+').filter(Boolean).length;
        const usedChunks = criticalChunks.concat(supportChunks);
        const bestChunk = usedChunks.reduce((best, c) => {
            if (!best) return c;
            const bestScore = best.finalScore ?? 0;
            const cScore    = c.finalScore ?? 0;
            if (cScore > bestScore) return c;
            if (cScore === bestScore) {
                const bestKw = best.keywordScore || 0;
                const cKw    = c.keywordScore || 0;
                if (cKw > bestKw) return c;
                if (cKw === bestKw && channelCount(c) > channelCount(best)) return c;
            }
            return best;
        }, null);

        // ── keywordDensity contra términos expandidos (2026-08-03) ────────────
        // BUG CONFIRMADO (seguimiento_confidence_engine.md #1): bestChunk.keywordScore
        // viene de rerankingService y se calcula SOLO contra los tokens literales
        // de la query (`keywords`), nunca contra `expanded_terms` (sinónimos ya
        // generados por queryUnderstandingService, ej. "embriagado" → "embriaguez",
        // "alcohol"). Un chunk puede ser el más relevante y haber sido recuperado
        // vía el canal BM25/expandido usando esos sinónimos, pero su keywordScore
        // literal queda en 0 porque el texto del corpus usa el término canónico,
        // no la variante coloquial de la query. Esto subestimaba `confidence_score`
        // incluso después del fix de "mejor chunk" (mismo bestChunk, misma
        // subestimación, porque la métrica en sí no veía la señal).
        // Fix acotado: solo se AUMENTA (nunca se reduce) el keywordDensity
        // reportado al Confidence Engine, calculando una densidad adicional del
        // bestChunk contra expandedTerms y tomando el máximo con la literal.
        // No se toca el criterio de selección de bestChunk ni el finalScore de
        // reranking — el blast radius queda limitado a la métrica de confianza.
        const literalKeywordScore = bestChunk ? (bestChunk.keywordScore || 0) : 0;
        const expandedKeywordScore = bestChunk
            ? this._computeKeywordDensity(bestChunk.payload?.texto_original, expandedTerms)
            : 0;
        const bestKeywordScore = Math.max(literalKeywordScore, expandedKeywordScore);

        return {
            contextText: finalContextText.trim(),
            chunksUsed:  criticalChunks.length + supportChunks.length,
            sources:     Array.from(sourcesSet),
            rawConfidence:  bestChunk ? (bestChunk.finalScore ?? 0) : 0,
            bestKeywordScore,
            bestHasSectionRelevance: bestChunk ? (bestChunk.boostReason?.includes('Section') || false) : false,
            logDetails,
        };
    }

    /**
     * Densidad de coincidencia de `tokens` (case/acento-insensitive) en `text`.
     * Usada para medir keywordDensity contra expanded_terms (sinónimos), no
     * solo contra los tokens literales de la query original.
     */
    _computeKeywordDensity(text, tokens) {
        if (!tokens || tokens.length === 0 || !text) return 0;
        const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        const textNorm = norm(text);
        const tokensNorm = tokens.map(norm).filter(t => t.length > 0);
        if (tokensNorm.length === 0) return 0;
        const present = tokensNorm.filter(t => textNorm.includes(t)).length;
        return present / tokensNorm.length;
    }

    // ─── Detección de gibberish ────────────────────────────────────────────

    /**
     * Match tolerante a plural regular español ("horario"/"horarios",
     * "procedimiento"/"procedimientos"): compara el token tal cual y, si no
     * matchea, su forma con/sin "s" final. No es un stemmer real — solo cubre
     * el caso más común (bug 2026-08-13: KNOWN_VOCAB_EXTRA solo tiene formas
     * singulares, así que "Horarios." o "Procedimientos..." caían en
     * gibberish/fuera-de-dominio pese a que "horario"/"procedimiento" sí
     * están en el vocabulario).
     */
    _matchesVocab(token, vocabSet) {
        if (vocabSet.has(token)) return true;
        if (token.length > 3 && token.endsWith('s') && vocabSet.has(token.slice(0, -1))) return true;
        if (token.length > 2 && vocabSet.has(token + 's')) return true;
        return false;
    }

    /**
     * Devuelve true si NINGÚN token significativo de la query original
     * aparece en el vocabulario conocido (HR español + dominio corporativo).
     * Esto detecta queries como "xixx", "aaa", "zxqw" sin rechazar queries
     * válidas de una sola palabra como "uniformes" o "jornada".
     */
    _isGibberishQuery(query) {
        const normalize = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

        // Construir vocabulario unificado la primera vez (lazy singleton)
        if (!this._knownVocab) {
            const docPriorityKw = DOC_PRIORITY_MAP.flatMap(r => r.keywords).map(normalize);
            this._knownVocab = new Set([
                ...Array.from(SPANISH_STOPWORDS).map(normalize),
                ...Array.from(KNOWN_VOCAB_EXTRA).map(normalize),
                ...docPriorityKw,
                // EXACT_ACRONYMS existía declarado pero nunca se mezclaba aquí
                // (bug 2026-08-13) — "SG-SST", "COPASST", etc. caían en gibberish.
                ...EXACT_ACRONYMS.map(normalize),
            ]);
        }

        const tokens = normalize(query)
            .replace(/[¿?¡!.,;:()\[\]{}"']/g, ' ')
            .split(/\s+/)
            .filter(t => t.length > 2);

        if (tokens.length === 0) return false; // query vacía — no es gibberish

        // Si AL MENOS UN token está en el vocabulario → query comprensible
        return tokens.every(t => !this._matchesVocab(t, this._knownVocab));
    }

    // ─── Relevancia Temática Mínima (2026-08-03) ───────────────────────────

    /**
     * Devuelve true si AL MENOS UN token significativo (no-stopword) de la
     * query aparece en el vocabulario HR CURADO (KNOWN_VOCAB_EXTRA +
     * keywords de DOC_PRIORITY_MAP).
     *
     * Distinto de `_isGibberishQuery`: ese método considera "comprensible"
     * cualquier oración gramatical española (basta con que aparezca un
     * stopword como "el"/"más"/"cuál" para no ser gibberish) — sirve para
     * detectar ruido sin sentido ("xzq wblk"), NO para detectar si el TEMA
     * de la query es ajeno al dominio de Plastitec ("¿Cuál es la capital de
     * Francia?" es gramaticalmente válida pero no tiene ningún término HR).
     * Este método excluye SPANISH_STOPWORDS del vocabulario de comparación
     * a propósito, para que una query sin ningún término de dominio real
     * no cuente como relevante solo por tener palabras funcionales comunes.
     */
    _hasHRDomainToken(query) {
        const normalize = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

        // BUG CORREGIDO (2026-08-03, seguimiento_4.md): KNOWN_VOCAB_EXTRA incluye
        // un puñado de interrogativos/verbos genéricos ('cuantos', 'cuántas',
        // 'aplica', 'aplican', 'permite', 'pueden') agregados a propósito para
        // _isGibberishQuery (permisivo por diseño: evita falsos positivos de
        // gibberish en preguntas de una sola palabra). Reutilizar ese mismo set
        // aquí sin excluirlos permitía que preguntas fuera de dominio como
        // "¿Cuántos planetas tiene el sistema solar?" cruzaran este guardrail
        // solo por contener "cuantos" — exactamente el tipo de falso positivo
        // que este método existe para bloquear. Se excluyen explícitamente.
        const GENERIC_NON_DOMAIN_TERMS = new Set([
            'cuantas', 'cuántas', 'cuantos', 'cuántos',
            'aplica', 'aplican', 'permite', 'pueden',
        ].map(normalize));

        if (!this._hrVocabOnly) {
            const docPriorityKw = DOC_PRIORITY_MAP.flatMap(r => r.keywords).map(normalize);
            this._hrVocabOnly = new Set([
                ...Array.from(KNOWN_VOCAB_EXTRA).map(normalize),
                ...docPriorityKw,
                // Ver mismo fix en _isGibberishQuery: EXACT_ACRONYMS nunca se mezclaba.
                ...EXACT_ACRONYMS.map(normalize),
            ].filter(t => !GENERIC_NON_DOMAIN_TERMS.has(t)));
        }
        if (!this._normalizedStopwords) {
            this._normalizedStopwords = new Set(Array.from(SPANISH_STOPWORDS).map(normalize));
        }

        const tokens = normalize(query)
            .replace(/[¿?¡!.,;:()\[\]{}"']/g, ' ')
            .split(/\s+/)
            .filter(t => t.length > 2 && !this._normalizedStopwords.has(t));

        if (tokens.length === 0) return false;

        return tokens.some(t => this._matchesVocab(t, this._hrVocabOnly));
    }

    // ─── Limpieza de texto ─────────────────────────────────────────────────

    _cleanText(text) {
        return text
            .replace(/(\w)-\n(\w)/g, '$1$2')           // Unir palabras cortadas con guión
            .replace(/\n\s*(\d+\.)\s+/g, '\n$1 ')      // Preservar listas numeradas
            .replace(/\n\s*([-•*])\s+/g, '\n$1 ')      // Preservar bullets
            .replace(/\n{3,}/g, '\n\n')                 // Máx 2 saltos de línea
            .trim();
    }

    // ─── Grounding Validator Inteligente ───────────────────────────────────

    /**
     * Valida que la respuesta NO invente entidades específicas ausentes en el contexto.
     *
     * SOLO bloquea cuando la respuesta contiene:
     *   - Artículos de ley con número específico NO presentes en contexto (Ej: "Artículo 45")
     *   - Fechas específicas inventadas (años que no aparecen en el contexto)
     *   - Nombres propios de personas inventados
     *
     * NO bloquea: parafraseo, síntesis, reformulación, lenguaje natural.
     *
     * @returns {{ blocked, reason, suspiciousTerm, groundingScore }}
     */
    _intelligentGroundingValidator(response, context, query) {
        const respLower = response.toLowerCase();
        const ctxLower  = context.toLowerCase();

        // ── Test 1: Artículos de ley con número específico ────────────────
        const articleMatches = response.match(/art[íi]culo\s+(\d+)/gi) || [];
        for (const art of articleMatches) {
            const artNorm = art.toLowerCase().replace(/\s+/g, ' ');
            if (!ctxLower.includes(artNorm)) {
                return {
                    blocked:        true,
                    reason:         'Artículo de ley no encontrado en documentos',
                    suspiciousTerm: art,
                    groundingScore: 0.0,
                };
            }
        }

        // ── Test 2: Años inventados (fuera de rango razonable) ────────────
        const yearMatches = response.match(/\b(19\d{2}|20\d{2})\b/g) || [];
        for (const year of yearMatches) {
            if (!ctxLower.includes(year)) {
                // Solo bloquear si parece una fecha de emisión o decreto, no un año genérico
                const yearContext = response.substring(
                    Math.max(0, response.indexOf(year) - 30),
                    response.indexOf(year) + 30
                ).toLowerCase();
                const isDateContext = /decreto|ley|resolución|expedid|promulgad|publicad/i.test(yearContext);
                if (isDateContext) {
                    return {
                        blocked:        true,
                        reason:         'Año/fecha de norma no encontrado en documentos',
                        suspiciousTerm: year,
                        groundingScore: 0.1,
                    };
                }
            }
        }

        // ── Test 3: Términos genéricos conocidos como alucinaciones ────────
        // (Lista reducida — solo los que producen respuestas completamente falsas)
        const criticalHallucinationTerms = [
            'según mis datos',
            'en internet',
            'basándome en mi conocimiento general',
            'según la ley colombiana en general',
        ];

        for (const term of criticalHallucinationTerms) {
            if (respLower.includes(term) && !ctxLower.includes(term)) {
                return {
                    blocked:        true,
                    reason:         'Frase indicadora de conocimiento externo detectada',
                    suspiciousTerm: term,
                    groundingScore: 0.0,
                };
            }
        }

        // ── Respuesta aprobada ────────────────────────────────────────────
        return {
            blocked:        false,
            reason:         null,
            suspiciousTerm: null,
            groundingScore: 1.0,
        };
    }

}

export default new RagService();
