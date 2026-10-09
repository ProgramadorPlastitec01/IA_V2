/**
 * CitationValidator — validación post-generación de la respuesta del LLM
 * contra el CONTEXTO que realmente recibió (2026-10-08).
 *
 * Motivación (prueba de TI + auditoría de hr_cache.db):
 *   - 40% de las respuestas citaban un número de artículo, y una parte
 *     significativa era inventada o atribuida a la norma equivocada:
 *     "artículo 35 de la Ley 2101" (el recargo dominical está en el Art. 35
 *     del RIT, no en esa ley), "artículo 46 de la Ley 2101" para la licencia
 *     por luto, "artículo 86 del documento" en un instructivo sin artículos.
 *   - El nombre técnico del archivo se filtraba a la respuesta
 *     ("I-RH-010_Ingreso_Areas_Negras.md").
 *   - El modelo confirmaba premisas del usuario que no existen en los
 *     documentos: "El día de cumpleaños es libre" → "Según el artículo 35
 *     del RIT, el día de cumpleaños es un día libre…" (la palabra
 *     "cumpleaños" no aparece en ningún documento).
 *
 * Este módulo NO llama al LLM: es determinístico y barato.
 *   1. fixFileNames        → nombre de archivo .md ⇒ nombre legible del documento.
 *   2. fixArticleCitations → cita de artículo sin respaldo en el contexto ⇒ se
 *                            reemplaza por el nombre del documento fuente.
 *   3. fixDocumentCodes    → código I-RH-0xx que no está entre las fuentes ⇒ se quita.
 *   4. findUnsupportedTerms → términos de la pregunta que la respuesta repite
 *                            pero que NO existen en el contexto (premisa no
 *                            respaldada). El llamador decide qué hacer.
 */

import fs from 'fs';
import path from 'path';
import citationBuilder from './citationBuilder.js';
import { DOCS_DIR, isCorpusFile } from '../config/corpusFiles.js';
import { sentencePrefixKey } from '../utils/sentenceKey.js';

const norm = (s) => String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

// ─── Vocabulario del corpus completo ─────────────────────────────────────
// El chequeo de premisa solo actúa cuando un término NO existe en NINGÚN
// documento (no basta con que falte del contexto recuperado: palabras de la
// pregunta como "menciona", "establece", "correcto" faltan del contexto pero
// existen en el corpus, y eran la mayoría de falsos positivos). Calibrado
// sobre las 160 respuestas de hr_cache.db: solo-contexto disparaba en 45,
// corpus completo en ~10, casi todas respuestas inventadas.
let CORPUS_TEXT = '';
let CORPUS_WORDS = [];
try {
    const files = fs.readdirSync(DOCS_DIR).filter(f => isCorpusFile(f) && !f.endsWith('.pdf'));
    CORPUS_TEXT = norm(files.map(f => fs.readFileSync(path.join(DOCS_DIR, f), 'utf8')).join('\n'));
    CORPUS_WORDS = [...new Set(CORPUS_TEXT.split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 4))];
} catch (e) {
    console.error('[CitationValidator] No se pudo cargar el corpus:', e.message);
}

// Palabras del glosario de jerga colombiana (config/glosario_jerga_colombiana.json):
// son vocabulario legítimo del usuario aunque no aparezcan en los documentos
// ("¿puedo comer mecato en la planta?"). Sin esta lista, el chequeo de premisa
// reemplazaba la respuesta por "No encontré información sobre «mecato»".
let GLOSSARY_WORDS = new Set();
try {
    const g = JSON.parse(fs.readFileSync(path.join(DOCS_DIR, '..', 'config', 'glosario_jerga_colombiana.json'), 'utf8'));
    const raw = [
        ...(g.polisemicas || []).map(p => p.palabra),
        ...(g.sinonimos || []).flatMap(s => s.variantes || []),
    ];
    GLOSSARY_WORDS = new Set(raw
        .flatMap(w => String(w).replace(/\(.*?\)/g, ' ').split(/[\s/]+/))
        .map(w => norm(w).replace(/[^\p{L}]/gu, ''))
        .filter(w => w.length >= 3));
} catch (e) {
    console.error('[CitationValidator] No se pudo cargar el glosario de jerga:', e.message);
}

// Distancia de edición acotada (corta en cuanto supera `max`).
function withinEdit(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return false;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        let rowMin = i;
        for (let j = 1; j <= b.length; j++) {
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            if (cur[j] < rowMin) rowMin = cur[j];
        }
        if (rowMin > max) return false;
        prev = cur;
    }
    return prev[b.length] <= max;
}

// Palabras de la pregunta que NO cuentan como "tema" para el chequeo de
// premisa (interrogativos, verbos de petición, genéricos de RRHH que pueden
// faltar en el contexto sin que la respuesta sea inventada).
const PREMISE_STOPWORDS = new Set([
    'cuanto', 'cuanta', 'cuantos', 'cuantas', 'cuales', 'donde', 'cuando', 'porque',
    'quisiera', 'necesito', 'necesitaria', 'podria', 'podrian', 'deberia', 'debemos',
    'puedes', 'pueden', 'tienen', 'tenemos', 'existe', 'existen', 'quiero', 'quieren',
    'saber', 'informacion', 'explicar', 'explicame', 'explica', 'decirme', 'dime',
    'plastitec', 'empresa', 'trabajo', 'trabajar', 'trabajador', 'trabajadores',
    'empleado', 'empleados', 'colaborador', 'colaboradores', 'persona', 'personas',
    'reglamento', 'interno', 'documento', 'documentos', 'normas', 'norma', 'reglas',
    'favor', 'gracias', 'buenos', 'buenas', 'tardes', 'noches', 'entonces', 'tambien',
    'ademas', 'actualmente', 'siempre', 'normalmente', 'general', 'especifico',
    'segun', 'respecto', 'acerca', 'sobre', 'mismo', 'misma', 'alguna', 'alguno',
    'algun', 'todos', 'todas', 'ningun', 'ninguna', 'puedo', 'tengo', 'tiene',
    'hacer', 'debo', 'deben', 'dentro', 'fuera', 'mientras', 'durante', 'despues',
    'antes', 'nuestra', 'nuestro', 'nuestros', 'nuestras', 'ustedes', 'ellos',
]);

// Si se quitó la primera oración, la que queda puede empezar con un conector
// ("Sin embargo, no se menciona…") → se quita y se pone mayúscula.
const stripLeadingConnector = (s) =>
    s.replace(/^(sin embargo|adem[aá]s|por lo tanto|tambi[eé]n),?\s*(\p{L})/iu, (_, _c, l) => l.toUpperCase());

// Preposiciones, artículos, pronombres y conectores: si la palabra anterior al
// término es una de estas, el término NO es modificador de un sustantivo.
const PREMISE_FUNCTION_WORDS = new Set([
    'para', 'sobre', 'entre', 'desde', 'hasta', 'hacia', 'contra', 'segun', 'sin', 'con',
    'como', 'cuando', 'donde', 'porque', 'pero', 'aunque', 'mientras', 'esta', 'este',
    'esto', 'esos', 'esas', 'estos', 'estas', 'unos', 'unas', 'mis', 'tus', 'sus',
    'nuestro', 'nuestra', 'cual', 'cuales', 'algun', 'alguna', 'cada', 'otro', 'otra',
    'todo', 'toda', 'todos', 'todas', 'mucho', 'mucha', 'poco', 'poca', 'muy', 'tambien',
]);

// Cualificadores que siguen a "artículo N" y apuntan al propio documento.
const INTERNAL_QUALIFIER_RE = /^\s*,?\s*(de\s+la|del|de)\s+(reglamento\s+interno\s+de\s+trabajo(\s*\(rit\))?(\s+de\s+plastitec)?|rit\b(_[\w.]+)?|mismo\s+reglamento|reglamento(\s+de\s+plastitec)?|documento|instructivo|c[oó]digo\s+de\s+[eé]tica|presente\s+reglamento)/i;
// Cualificadores que apuntan a una norma externa.
const EXTERNAL_QUALIFIER_RE = /^\s*,?\s*(de\s+la|del|de)\s+(ley\s+(\d{2,4})(\s+de\s+\d{4})?|decreto\s+(\d{1,4})(\s+de\s+\d{4})?|c[oó]digo\s+sustantivo\s+del\s+trabajo|c\.?\s*s\.?\s*t\.?(?![\p{L}]))/iu;
const SUBDIVISION_RE = /^((\s*,?\s*(numeral|literal|par[aá]grafo|inciso|ordinal)\s+[\w\d]+)+)/i;
const ARTICLE_RE = /\b(art[ií]culos?|art\.)\s+(\d{1,3})((?:\.\d{1,2})?)\b/gi;

class CitationValidator {

    /**
     * Valida y corrige la respuesta. Devuelve el texto corregido y el detalle
     * de lo que cambió (para logs/auditoría).
     *
     * @param {string}   answer   Respuesta del LLM (sin bloque de citas).
     * @param {string}   context  Texto de contexto que recibió el LLM.
     * @param {string[]} sources  Nombres de archivo de las fuentes del contexto.
     * @param {string}   query    Pregunta (ya corregida ortográficamente).
     */
    validate(answer, context, sources = [], query = '') {
        const changes = [];
        let text = String(answer || '');
        const ctxNorm = norm(context);
        const blocks = this._splitContextBySource(context);

        const echo = this.removePromptEcho(text, query, changes);
        text = echo.text;
        text = this.removeRepeatedSentences(text, changes);
        text = this.fixFileNames(text, changes);
        text = this.fixArticleCitations(text, ctxNorm, sources, changes, blocks);
        text = this.fixDocumentCodes(text, ctxNorm, sources, changes);
        const unsupportedTerms = this.findUnsupportedTerms(query, text, ctxNorm);

        return { text, changes, unsupportedTerms, echoOnly: echo.echoOnly };
    }

    // ─── 0a. Eco del ejemplo del prompt ────────────────────────────────────
    // El prompt de llmService trae un ejemplo de jornada ("42 horas… Ley 2101
    // de 2021, vigente a partir de 2026"). Sin ese ejemplo el 3B cita peor
    // (prueba 2026-10-09), pero con él lo copia en preguntas que no son de
    // jornada: 10/150 en la regresión SQLite, p. ej. "¿cuánto es el mínimo?" →
    // solo esa frase, o "luto: 5 días hábiles, de acuerdo con la Ley 2101".
    // Si la pregunta NO trata de jornada/horas, se quitan la cláusula y las
    // oraciones del ejemplo; echoOnly=true si no queda respuesta real.
    removePromptEcho(text, query, changes) {
        const q = norm(query);
        // También se omite si la pregunta pide un artículo concreto ("descríbeme
        // el artículo 23"): la respuesta sale de ese artículo, no del ejemplo.
        if (/jornada|hora|semana|horario|turno|2101|reduccion|\bart(iculo|\.)/.test(q)) return { text, echoOnly: false };
        const CLAUSE = /,?\s*(de acuerdo con|conforme a|seg[uú]n|establecid[oa] por)\s+(la\s+)?(reducci[oó]n\s+establecida\s+por\s+(la\s+)?)?ley\s+2101(\s+de\s+2021)?(,?\s+vigente\s+a\s+partir\s+de(l)?\s+(a[nñ]o\s+)?2026)?/gi;
        // Incluye "jornada laboral" a secas: en preguntas que no son de jornada,
        // el modelo también comenta el ejemplo ("no se menciona específicamente
        // la jornada laboral en el contexto de esta pregunta").
        const ECHO_SENTENCE = /jornada\s+(laboral\s+)?semanal\s+(es|ser[aá])\s+de\s+42\s+horas|42\s+horas\s+semanales|ley\s+2101|\bjornada\s+laboral\b/i;
        let removed = 0;
        let out = text.replace(CLAUSE, () => { removed++; return ''; });
        out = out.split(/(\n+)/).map(line => {
            if (/^\n+$/.test(line)) return line;
            return line.split(/(?<=[.!?])\s+/).filter(s => {
                if (!ECHO_SENTENCE.test(s)) return true;
                removed++;
                return false;
            }).join(' ');
        }).join('').replace(/\n{3,}/g, '\n\n').trim();
        out = stripLeadingConnector(out);
        if (removed === 0) return { text, echoOnly: false };
        changes.push({ type: 'prompt_echo', from: `${removed} fragmento(s) del ejemplo de jornada`, to: '' });
        // ¿Queda algo más que un encabezado del tipo "Según el RIT de Plastitec,"?
        const rest = norm(out).replace(/seg[uú]n\s+(el|la)\s+[^,]{0,80},?/g, '').replace(/[^\p{L}\p{N}]/gu, '');
        return { text: out, echoOnly: rest.length < 25 };
    }

    // ─── 0. Oraciones repetidas ────────────────────────────────────────────
    // llama3.2 (3B) a veces entra en bucle ("No se menciona X. No se menciona
    // X. …" ×30, 60–90 s). Se conserva solo la primera aparición de cada
    // oración (comparación normalizada, oraciones > 15 chars). Respeta saltos
    // de línea de listas numeradas.
    // Casi-repetidas (2026-10-09): oraciones con las mismas 6 primeras palabras
    // y distinto final ("No se menciona si el frotado… con agua / con jabón…").
    // Se admiten 2 por prefijo; si la oración es una negación ("no se
    // menciona…"), solo 1 — repetir faltantes no aporta.
    removeRepeatedSentences(text, changes) {
        const seen = new Set();
        const prefixCounts = new Map();
        const NEGATION_START = /^(no\s+se\s+|no\s+hay\s+|no\s+est[a]\s+|sin\s+embargo,?\s+no\s+)/;
        let removed = 0;
        const out = text.split(/(\n+)/).map(line => {
            if (/^\n+$/.test(line)) return line;
            return line.split(/(?<=[.!?])\s+/).filter(s => {
                const k = norm(s).replace(/\s+/g, ' ').trim();
                if (k.length <= 15) return true;
                if (seen.has(k)) { removed++; return false; }
                seen.add(k);
                const pk = sentencePrefixKey(k);
                if (pk) {
                    const c = (prefixCounts.get(pk) || 0) + 1;
                    prefixCounts.set(pk, c);
                    if (c > (NEGATION_START.test(k) ? 1 : 2)) { removed++; return false; }
                }
                return true;
            }).join(' ');
        }).join('').replace(/\n{3,}/g, '\n\n').trim();
        if (removed > 0) changes.push({ type: 'repeated_sentences', from: `${removed} oraciones repetidas`, to: '' });
        return out;
    }

    // ─── 1. Nombres de archivo ─────────────────────────────────────────────
    fixFileNames(text, changes) {
        // Con o sin extensión: "I-RH-010_Ingreso_Areas_Negras.md",
        // "RIT_PLASTITEC_01_DE_JULIO_2026_VF".
        // [\p{L}\p{N}_-] y no \w: con \w, "I-RH-012_Lavado_de_Manos_Versión_006"
        // se cortaba en la "ó" y quedaba "…Lavado de Manosón_006" (2026-10-09).
        return text.replace(/(?<![\p{L}\p{N}_-])(?:[\p{L}\p{N}_-]+\.md|RIT_PLASTITEC[\p{L}\p{N}_-]*|I-RH-\d{3}_[\p{L}\p{N}_-]+)(?![\p{L}\p{N}_-])/giu, (m) => {
            const display = citationBuilder._displayName(m);
            if (display && display !== m) {
                changes.push({ type: 'file_name', from: m, to: display });
                return display;
            }
            return m;
        });
    }

    // ─── 2. Citas de artículo ──────────────────────────────────────────────
    fixArticleCitations(text, ctxNorm, sources, changes, blocks = {}) {
        const defaultNoun = this._defaultDocNoun(sources);
        let out = '';
        let last = 0;
        ARTICLE_RE.lastIndex = 0;
        let m;
        while ((m = ARTICLE_RE.exec(text)) !== null) {
            const num = m[2];
            let end = m.index + m[0].length;

            // Subdivisión opcional ("numeral 10", "parágrafo 3")
            const tail1 = text.slice(end);
            const sub = tail1.match(SUBDIVISION_RE);
            if (sub) end += sub[0].length;

            // Cualificador opcional (norma externa o el propio documento)
            const tail2 = text.slice(end);
            const ext = tail2.match(EXTERNAL_QUALIFIER_RE);
            const int = !ext && tail2.match(INTERNAL_QUALIFIER_RE);
            if (ext) end += ext[0].length;
            else if (int) end += int[0].length;

            // Documento específico nombrado por el cualificador interno.
            const intDoc = int ? this._internalDocKind(int[2]) : null;

            let grounded;
            let docNoun = defaultNoun;
            if (ext) {
                grounded = this._externalArticleInContext(num, ext[2], ctxNorm);
            } else if (intDoc === 'etica') {
                // El Código de Ética no tiene artículos sino SECCIONES numeradas
                // ("## 12. Información Confidencial y Privada"). Si la sección N
                // existe en el bloque de Ética del contexto, se cita como sección.
                // Si no, y ese artículo está en el bloque del RIT, el contenido
                // viene del RIT mal atribuido (caso real: "artículo 90 del
                // Código de Ética" = definición de conflicto de intereses del
                // Art. 90 del RIT; "artículo 86 del Código de Ética" = Art. 86 RIT).
                grounded = false;
                const hasSection = blocks.etica && new RegExp(`(^|\\n)#{1,4}\\s*${num}\\.\\s`).test(blocks.etica);
                const inRit = blocks.rit && this._internalArticleInContext(num, blocks.rit);
                docNoun = hasSection ? { art: 'la', noun: `sección ${num} del Código de Ética` }
                    : inRit          ? { art: 'el', noun: `artículo ${num} del Reglamento Interno de Trabajo` }
                    :                  { art: 'el', noun: 'Código de Ética' };
            } else if (intDoc === 'instructivo') {
                // Los instructivos tampoco tienen artículos ("artículo 86 del documento").
                grounded = false;
                docNoun = { art: 'el', noun: norm(int[2]).startsWith('instructivo') ? 'instructivo' : 'documento' };
            } else if (intDoc === 'rit') {
                // Debe existir en el bloque del RIT, no en cualquier documento.
                const ritInSources = blocks.rit !== undefined || (sources || []).some(s => /rit_plastitec/i.test(s));
                grounded = this._internalArticleInContext(num, blocks.rit !== undefined ? blocks.rit : ctxNorm);
                // Si el RIT ni siquiera está entre las fuentes, "reglamento" se
                // refiere al documento que sí se recuperó.
                if (ritInSources) docNoun = { art: 'el', noun: 'Reglamento Interno de Trabajo' };
            } else {
                grounded = this._internalArticleInContext(num, ctxNorm);
            }

            // Cita sin respaldo cuyo número coincide con una SECCIÓN del Código
            // de Ética presente en el contexto: el modelo llamó "artículo" a la
            // sección (caso TI Ética P5: "artículo 13" = Sección 13 Propiedad
            // Intelectual).
            if (!grounded && intDoc !== 'etica' && intDoc !== 'instructivo' && !ext
                && blocks.etica && new RegExp(`(^|\\n)#{1,4}\\s*${num}\\.\\s`).test(blocks.etica)) {
                docNoun = { art: 'la', noun: `sección ${num} del Código de Ética` };
            }

            if (grounded) continue; // se deja intacto

            // Absorber el determinante previo ("el/del/al artículo N") para
            // que el reemplazo concuerde: "del artículo 46 de la Ley 2101" →
            // "del Reglamento Interno de Trabajo".
            const before = text.slice(last, m.index);
            const det = before.match(/\b(el|del|al)\s+$/i);
            const kept = det ? before.slice(0, before.length - det[0].length) : before;
            let replacement = this._withDeterminer(det ? det[1].toLowerCase() : 'el', docNoun);
            // Si la oración ya nombra ese documento justo antes ("Según el
            // Reglamento Interno de Trabajo de Plastitec, artículo 13, …"), se
            // quita la cita en vez de repetir el nombre.
            if (norm((out + kept).slice(-90)).includes(norm(docNoun.noun))) replacement = '';

            const span = text.slice(m.index - (det ? det[0].length : 0), end);
            changes.push({ type: 'article_citation', from: span.trim(), to: replacement });
            out += kept + replacement;
            last = end;
            ARTICLE_RE.lastIndex = end;
        }
        out += text.slice(last);
        // Limpieza de puntuación tras quitar una cita ("Plastitec, , está" → "Plastitec, está")
        out = out.replace(/,\s*,/g, ',').replace(/\s+,/g, ',').replace(/ {2,}/g, ' ');
        // "Según el Reglamento Interno de Trabajo y el Reglamento Interno de
        // Trabajo de Plastitec" (la cita reemplazada + la mención original).
        return out.replace(
            /\b(el|del) Reglamento Interno de Trabajo y el Reglamento Interno de Trabajo( de Plastitec)?/g,
            (_, d, p) => `${d} Reglamento Interno de Trabajo${p || ''}`
        );
    }

    _withDeterminer(det, { art, noun }) {
        if (det === 'del') return art === 'el' ? `del ${noun}` : `de ${art} ${noun}`;
        if (det === 'al')  return art === 'el' ? `al ${noun}`  : `a ${art} ${noun}`;
        return `${art} ${noun}`;
    }

    _internalArticleInContext(num, ctxNorm) {
        // "ARTICULO 35." (encabezado) o cualquier mención "articulo 35" en el contexto
        return new RegExp(`\\barticulos?\\s+${num}(?!\\d)`).test(ctxNorm)
            || new RegExp(`\\bart\\.\\s*${num}(?!\\d)`).test(ctxNorm);
    }

    _externalArticleInContext(num, qualifier, ctxNorm) {
        const q = norm(qualifier);
        let anchor;
        const lawNum = q.match(/(ley|decreto)\s+(\d{1,4})/);
        if (lawNum) anchor = `${lawNum[1]}\\s+${lawNum[2]}(?!\\d)`;
        else anchor = '(codigo\\s+sustantivo|c\\.?\\s*s\\.?\\s*t\\.?)';
        const art = `(articulos?|art\\.)\\s+${num}(?!\\d)`;
        // El artículo y la norma deben ir JUNTOS en el texto corrido, en ese
        // orden y en la misma línea ("artículo 57 numeral 10 del Código
        // Sustantivo", "(Artículo 26 Ley 789 de 2002"). Una ventana amplia
        // aceptaba "ARTICULO 77.\n\n18. … de conformidad con la Ley 2191" (el
        // encabezado del artículo del RIT + una ley mencionada en su cuerpo)
        // como si fuera "artículo 77 de la Ley 2191".
        return new RegExp(`${art}[^\\n]{0,60}?${anchor}`).test(ctxNorm);
    }

    /** 'rit' | 'etica' | 'instructivo' | null según el cualificador interno. */
    _internalDocKind(qualifier) {
        const q = norm(qualifier);
        if (/codigo\s+de\s+etica/.test(q)) return 'etica';
        if (/^(documento|instructivo)/.test(q)) return 'instructivo';
        if (/reglamento|rit/.test(q)) return 'rit';
        return null;
    }

    /**
     * Separa el contexto en bloques por documento usando los marcadores
     * "[[ FUENTE: archivo ]]" que arma ragService._buildContextExpanded.
     * Devuelve { rit, etica } con el texto normalizado de cada uno (si está).
     */
    _splitContextBySource(context) {
        const blocks = {};
        const parts = String(context || '').split(/\[\[ FUENTE: ([^\]]+?) \]\]/);
        for (let i = 1; i < parts.length; i += 2) {
            const src = parts[i].toLowerCase();
            const body = norm(parts[i + 1] || '');
            const key = src.includes('rit_plastitec') ? 'rit' : src.includes('i-rh-017') ? 'etica' : null;
            if (key) blocks[key] = (blocks[key] || '') + '\n' + body;
        }
        return blocks;
    }

    _defaultDocNoun(sources) {
        const names = [...new Set((sources || []).map(s => citationBuilder._displayName(s)).filter(Boolean))];
        if (names.some(n => /Reglamento Interno/.test(n))) return { art: 'el', noun: 'Reglamento Interno de Trabajo' };
        if (names.length === 1) return { art: 'el', noun: `documento "${names[0]}"` };
        return { art: 'la', noun: 'documentación de Plastitec' };
    }

    // ─── 3. Códigos de documento I-RH-0xx ─────────────────────────────────
    fixDocumentCodes(text, ctxNorm, sources, changes) {
        const srcNorm = norm((sources || []).join(' '));
        return text.replace(/\s*\(?\bI-RH-?(\d{3})\b(\s+(versi[oó]n|v\.?)\s*\d+)?\)?/gi, (m, code) => {
            const key = `i-rh-${code}`;
            if (srcNorm.includes(key) || srcNorm.includes(`i-rh-_${code}`)) return m;
            changes.push({ type: 'document_code', from: m.trim(), to: '' });
            return '';
        });
    }

    /**
     * Aplica el resultado del chequeo de premisa a la respuesta (2026-10-08, v2).
     * v1 reemplazaba la respuesta ENTERA si repetía un término inexistente en
     * el corpus. En el benchmark eso borró contenido válido: I4 ("¿cómo pido
     * vacaciones y cuánto pagan la prima de navidad?") perdió la parte de
     * vacaciones; B8/B9 perdieron respuestas que ya decían honestamente "no se
     * menciona X". Ahora:
     *   - solo se eliminan las ORACIONES que contienen el término y lo AFIRMAN;
     *     las que ya dicen "no se menciona / no se especifica / no está…" se
     *     conservan (el modelo fue honesto);
     *   - si queda contenido (≥60 chars), se devuelve con la nota final
     *     "No encontré información sobre «X»…" (respuesta parcial);
     *   - si no queda nada (ej. "El día de cumpleaños es libre"), se reemplaza
     *     todo por la nota.
     * @returns {{ text: string, replacedAll: boolean, removed: number }}
     */
    applyPremiseCheck(text, terms, prefix, suffix) {
        if (!terms || terms.length === 0) return { text, replacedAll: false, removed: 0 };
        const HONEST_NEGATION = /\bno\s+(se\s+)?(menciona|especifica|indica|establece|detalla|contempla|encontr\w*|encuentra|hay\s+informaci)|\bno\s+est[aá]\s+(expl[ií]cit|mencionad|especificad|documentad|contemplad)|\bsin\s+informaci[oó]n\b/i;
        const stems = terms.map(t => norm(t)).map(t => t.slice(0, Math.max(6, t.length - 3)));
        const mentions = (s) => stems.some(st => new RegExp(`(?<![\\p{L}\\p{N}])${st}`, 'u').test(norm(s)));

        let removed = 0;
        let kept = text.split(/(\n+)/).map(line => {
            if (/^\n+$/.test(line)) return line;
            return line.split(/(?<=[.!?])\s+/).filter(s => {
                if (!mentions(s) || HONEST_NEGATION.test(s)) return true;
                removed++;
                return false;
            }).join(' ');
        }).join('').replace(/\n{3,}/g, '\n\n').trim();

        const note = `${prefix} «${terms.join('», «')}» ${suffix}`;
        kept = stripLeadingConnector(kept);
        if (removed === 0) return { text, replacedAll: false, removed: 0 };       // todo era honesto
        if (kept.replace(/[\s•\-\d.]/g, '').length < 60) return { text: note, replacedAll: true, removed };
        return { text: `${kept}\n\n${note}`, replacedAll: false, removed };
    }

    // ─── 4. Premisa no respaldada ──────────────────────────────────────────
    /**
     * Términos "de tema" de la pregunta (≥6 letras, no genéricos) que la
     * respuesta REPITE pero que no aparecen en el contexto. Se compara por
     * raíz (palabra menos 3 letras, mínimo 6) para tolerar plural/conjugación
     * ("embarazada" ↔ "embarazo", "festivos" ↔ "festivo") sin que una raíz
     * demasiado corta dé falsos "respaldos" ("cumpleaños" → "cumplea", no
     * "cumple", que matchearía el verbo "cumple").
     */
    findUnsupportedTerms(query, answer, ctxNorm) {
        if (!CORPUS_TEXT) return []; // sin corpus cargado no se puede decidir → no actuar
        const ansNorm = norm(answer);
        // Solo SUSTANTIVOS/adjetivos: las premisas inventadas son de "cosas"
        // (cumpleaños, licras, contrato rotativo). Verbos conjugados y adverbios
        // ("tomado", "tocaría", "devolverla", "obligatoriamente") faltan del
        // corpus en esa forma exacta sin que la respuesta sea inventada.
        const VERB_OR_ADVERB_RE = /(ar|er|ir|ado|ada|ido|ida|ados|adas|idos|idas|ando|iendo|mente|ria|rian|rla|rlo|rle|rse|rlas|rlos|rme|rte)$/;
        const tokens = [...new Set(norm(query)
            .replace(/[^\p{L}\p{N}\s]/gu, ' ')
            .split(/\s+/)
            .filter(t => t.length >= 6 && !PREMISE_STOPWORDS.has(t) && !VERB_OR_ADVERB_RE.test(t)))];

        // Para el mensaje al usuario: la palabra tal como la escribió (con tildes/ñ).
        const display = new Map(String(query).toLowerCase()
            .replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).map(w => [norm(w), w]));

        // Palabras de la pregunta en orden, para mirar la anterior a cada término.
        const queryWords = norm(query).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
        const isDocumented = (w) => {
            const st = w.slice(0, Math.max(4, w.length - 2));
            return new RegExp(`(?<![\\p{L}\\p{N}])${st}`, 'u').test(ctxNorm) || CORPUS_WORDS.includes(w);
        };
        // Modificador o predicado de un sustantivo documentado (2026-10-09):
        // "si mi JEFE regaña…" (verbo en presente, no lo atrapa VERB_OR_ADVERB_RE),
        // "contrato ROTATIVO" (adjetivo). La pregunta trata de un tema que SÍ está
        // en los documentos (acoso laboral, jornada); la palabra rara no es la
        // premisa. Las premisas inventadas van tras preposición o verbo:
        // "día DE cumpleaños", "prima DE navidad", "usar licras".
        const followsDocumentedNoun = (t) => {
            const i = queryWords.indexOf(t);
            if (i <= 0) return false;
            const prev = queryWords[i - 1];
            if (prev.length < 4 || PREMISE_FUNCTION_WORDS.has(prev) || VERB_OR_ADVERB_RE.test(prev)) return false;
            return isDocumented(prev);
        };

        const unsupported = [];
        for (const t of tokens) {
            const stem = t.slice(0, Math.max(6, t.length - 3));
            const re = new RegExp(`(?<![\\p{L}\\p{N}])${stem}`, 'u');
            if (!re.test(ansNorm)) continue;          // la respuesta no lo repite
            if (re.test(ctxNorm)) continue;           // está en el contexto
            if (re.test(CORPUS_TEXT)) continue;       // existe en algún documento
            if (GLOSSARY_WORDS.has(t) || GLOSSARY_WORDS.has(t.replace(/s$/, ''))) continue; // jerga conocida
            // Tolerancia a typos del usuario ("prastitec"): distancia 1 con
            // una palabra del corpus. Distancia 2 era demasiado laxa
            // ("licras"≈"libros", "rotativo"≈"relativo").
            if (CORPUS_WORDS.some(w => w[0] === t[0] && withinEdit(w, t, 1))) continue;
            if (followsDocumentedNoun(t)) continue;
            unsupported.push(display.get(t) || t);
        }
        return unsupported;
    }
}

export default new CitationValidator();
