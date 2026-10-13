import fs from 'fs';
import path from 'path';
import { diceCoefficient } from 'dice-coefficient';
import { logAnalyticsEvent } from '../utils/logger.js';
import { matchSlangRules, normalizeForSlang } from '../config/slangRules.js';

const LOG_FILE = path.join(process.cwd(), 'analytics.jsonl');
const GLOSARIO_PATH = path.join(process.cwd(), 'config', 'glosario_jerga_colombiana.json');
const GAP_SIMILARITY_THRESHOLD = 0.55;
const LONG_QUESTION_WORD_COUNT = 14;

function normalize(text) {
    return String(text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[.,?¿!¡]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

async function readAnalyticsLines() {
    if (!fs.existsSync(LOG_FILE)) return [];
    const data = await fs.promises.readFile(LOG_FILE, 'utf8');
    return data.trim().split('\n')
        .filter(line => line.trim())
        .map(line => { try { return JSON.parse(line); } catch (e) { return null; } })
        .filter(e => e !== null);
}

/**
 * Elisión coloquial colombiana muy común en participios: "tomado"→"tomao",
 * "cansado"→"cansao", "metido"→"metío" (cae la 'd' intervocálica). Sin esto,
 * el ejemplo real del glosario ("tomado" = Borracho) nunca detectaría la
 * forma hablada real ("tomao") que escriben los usuarios.
 */
function colloquialElisions(word) {
    const variants = [word];
    if (/ado$/.test(word)) variants.push(word.replace(/ado$/, 'ao'));
    if (/ada$/.test(word)) variants.push(word.replace(/ada$/, 'aa'));
    if (/ido$/.test(word)) variants.push(word.replace(/ido$/, 'io'));
    if (/ida$/.test(word)) variants.push(word.replace(/ida$/, 'ia'));
    return variants;
}

let cachedGlossaryTerms = null;
function loadGlossaryTerms() {
    if (cachedGlossaryTerms) return cachedGlossaryTerms;
    const raw = fs.readFileSync(GLOSARIO_PATH, 'utf8');
    const glosario = JSON.parse(raw);
    const terms = [];

    const pushTerm = (word, significado, source) => {
        for (const variant of colloquialElisions(word)) {
            // display = la forma realmente escrita (variant), no siempre el lema del glosario
            terms.push({ term: normalizeForSlang(variant), display: variant, significado, source });
        }
    };

    for (const p of glosario.polisemicas || []) {
        for (const palabra of String(p.palabra).split('/').map(s => s.trim())) {
            pushTerm(palabra, p.significados?.[0]?.sentido || '', 'polisemicas');
        }
    }
    for (const s of glosario.sinonimos || []) {
        for (const variante of s.variantes || []) {
            pushTerm(variante, s.significado, 'sinonimos');
        }
    }
    cachedGlossaryTerms = terms;
    return terms;
}

function findSlangTerm(questionText) {
    const terms = loadGlossaryTerms();
    const normalizedQuestion = normalizeForSlang(questionText);
    for (const t of terms) {
        if (!t.term) continue;
        const re = new RegExp(`\\b${t.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        if (re.test(normalizedQuestion)) return t;
    }
    return null;
}

function classifyCause(questionText) {
    const slangTerm = findSlangTerm(questionText);
    if (slangTerm) {
        const { rules } = matchSlangRules(questionText);
        if (rules.length === 0) {
            const significadoLower = slangTerm.significado ? slangTerm.significado.charAt(0).toLowerCase() + slangTerm.significado.slice(1) : '';
            return {
                kind: 'slang_uncovered',
                label: `Jerga detectada: "${slangTerm.display}" (${significadoLower}) — sin regla en slangRules.js`,
                term: slangTerm.display,
                significado: slangTerm.significado,
            };
        }
    }
    const wordCount = questionText.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount > LONG_QUESTION_WORD_COUNT) {
        return {
            kind: 'long_question',
            label: 'Causa probable: artículo largo del RIT sin chunking por numeral',
            term: null,
            significado: null,
        };
    }
    return { kind: 'unclear', label: null, term: null, significado: null };
}

/**
 * GET /api/analytics/corpus-gaps?threshold=0.6&days=30
 *
 * Fuente real: analytics.jsonl → eventos 'UnansweredQuery' (chatController.js
 * nunca persiste rechazos en knowledge_base, solo respuestas con contenido
 * real — ver DatabaseService.storeOrUpdate). El único proxy de confianza
 * disponible para estos eventos es `maxScore` (score Qdrant top-1), no un
 * campo `confidence` 0-1 del LLM; se usa igualmente como umbral del slider.
 */
export const getCorpusGaps = async (req, res) => {
    try {
        const threshold = Math.min(1, Math.max(0, parseFloat(req.query.threshold) || 0.6));
        const days = Math.min(365, Math.max(1, parseInt(req.query.days) || 30));
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

        const events = await readAnalyticsLines();
        const inWindow = events.filter(e => new Date(e.timestamp).getTime() >= cutoff);

        const totalQueries = inWindow.filter(e => e.type === 'RAGQueryMetrics').length;
        const gapEvents = inWindow.filter(e =>
            e.type === 'UnansweredQuery' &&
            (e.reason === 'insufficient_context' || (typeof e.maxScore === 'number' && e.maxScore < threshold))
        );

        // Agrupar por similitud (Dice Coefficient) — mismo criterio que
        // DatabaseService.findSimilar, aquí es de solo lectura/analítica.
        const groups = [];
        for (const event of gapEvents) {
            const normalizedQuery = normalize(event.query);
            let target = groups.find(g => diceCoefficient(normalizedQuery, g.normalizedQuery) >= GAP_SIMILARITY_THRESHOLD);
            if (!target) {
                target = { normalizedQuery, representative: event.query, variants: [] };
                groups.push(target);
            }
            target.variants.push(event);
        }

        const slangFailCounts = new Map();
        let slangCauseCount = 0;
        let chunkingCauseCount = 0;

        const gapCards = groups.map(g => {
            const variants = g.variants.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            const representative = variants[0].query;
            const cause = classifyCause(representative);
            if (cause.kind === 'slang_uncovered') {
                slangCauseCount++;
                slangFailCounts.set(cause.term, (slangFailCounts.get(cause.term) || 0) + variants.length);
            }
            if (cause.kind === 'long_question') chunkingCauseCount++;

            const scores = variants.map(v => v.maxScore).filter(s => typeof s === 'number');
            const confidence = scores.length ? Math.min(...scores) : null;
            const reason = variants[0].reason || 'insufficient_context';

            return {
                question: representative,
                variantCount: variants.length,
                variants: variants.map(v => ({ question: v.query, timestamp: v.timestamp, maxScore: v.maxScore ?? null, reason: v.reason })),
                lastAttempt: variants[0].timestamp,
                confidence,
                statusLabel: confidence !== null ? null : reason.toUpperCase(),
                cause,
            };
        }).sort((a, b) => b.variantCount - a.variantCount);

        const slangTermsUncovered = Array.from(slangFailCounts.entries())
            .map(([term, fails]) => ({ term, fails }))
            .sort((a, b) => b.fails - a.fails);

        res.json({
            threshold,
            days,
            gaps: gapCards,
            slangTermsUncovered,
            summary: {
                totalQueries,
                belowThreshold: gapEvents.length,
                belowThresholdPct: totalQueries > 0 ? Number(((gapEvents.length / totalQueries) * 100).toFixed(1)) : 0,
                bySlang: slangCauseCount,
                byChunking: chunkingCauseCount,
            },
        });
    } catch (error) {
        console.error('Error computing corpus gaps:', error);
        res.status(500).json({ error: 'No se pudieron calcular los huecos del corpus' });
    }
};

/**
 * GET /api/glosario/terms — lista plana del glosario (para el modal
 * "Ir al glosario completo" del panel lateral de Huecos del Corpus).
 */
export const listGlossaryTerms = (req, res) => {
    try {
        const terms = loadGlossaryTerms();
        const seen = new Set();
        const unique = terms.filter(t => {
            if (seen.has(t.display)) return false;
            seen.add(t.display);
            return true;
        }).sort((a, b) => a.display.localeCompare(b.display));
        res.json({ terms: unique });
    } catch (error) {
        console.error('Error listing glossary terms:', error);
        res.status(500).json({ error: 'No se pudo leer el glosario' });
    }
};

/**
 * POST /api/glosario/add-term — acción sensible: escribe en config/glosario_jerga_colombiana.json.
 * Requiere confirmación en el UI antes de llamarse.
 * Body: { palabra, significado, ejemplo?, registro?, riesgoRrhh? }
 */
export const addGlossaryTerm = async (req, res) => {
    const { palabra, significado, ejemplo = '', registro = 'coloquial', riesgoRrhh = 'bajo' } = req.body;
    if (!palabra || !significado) {
        return res.status(400).json({ error: 'palabra y significado son requeridos' });
    }

    try {
        const raw = await fs.promises.readFile(GLOSARIO_PATH, 'utf8');
        const glosario = JSON.parse(raw);
        glosario.polisemicas = glosario.polisemicas || [];
        glosario.polisemicas.push({
            palabra,
            registro,
            riesgo_rrhh: riesgoRrhh,
            significados: [{ sentido: significado, ejemplo }],
        });
        await fs.promises.writeFile(GLOSARIO_PATH, JSON.stringify(glosario, null, 2) + '\n');
        cachedGlossaryTerms = null; // invalidar caché en memoria

        res.json({ success: true });
    } catch (error) {
        console.error('Error adding glossary term:', error);
        res.status(500).json({ error: 'No se pudo actualizar el glosario' });
    }
};

/**
 * POST /api/corpus-gaps/mark-rechunk — deja registro de intención de re-chunking
 * (no modifica el corpus; es una señal para el equipo de contenido).
 * Body: { question }
 */
export const markForRechunking = (req, res) => {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: 'question es requerido' });

    logAnalyticsEvent('RechunkFlagged', { question });
    res.json({ success: true });
};
