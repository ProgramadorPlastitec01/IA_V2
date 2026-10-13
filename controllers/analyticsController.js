import fs from 'fs';
import path from 'path';
import { logAnalyticsEvent, logErrorEvent } from '../utils/logger.js';
import { fingerprintError, parsePlatform } from '../utils/errorFingerprint.js';

const LOG_FILE = path.join(process.cwd(), 'analytics.jsonl');
const ERRORS_FILE = path.join(process.cwd(), 'errors.jsonl');

export const postAnalytics = (req, res) => {
    const { type, data } = req.body;
    if (!type) return res.status(400).json({ error: 'Missing log type' });

    logAnalyticsEvent(type, data || {});
    res.json({ success: true });
};

export const getAnalytics = async (req, res) => {
    try {
        if (!fs.existsSync(LOG_FILE)) return res.json({ events: [] });

        const data = await fs.promises.readFile(LOG_FILE, 'utf8');
        const lines = data.trim().split('\n');

        const events = lines
            .slice(-100)
            .filter(line => line.trim())
            .map(line => {
                try { return JSON.parse(line); } catch (e) { return null; }
            })
            .filter(e => e !== null)
            .reverse();

        res.json({ events });
    } catch (error) {
        console.error('Error reading analytics:', error);
        res.status(500).json({ error: 'Failed to read logs' });
    }
};

/**
 * Reporte de Calidad RAG - Analiza logs para identificar problemas
 */
export const getQualityReport = async (req, res) => {
    try {
        if (!fs.existsSync(LOG_FILE)) return res.json({ report: null });

        const data = await fs.promises.readFile(LOG_FILE, 'utf8');
        const lines = data.trim().split('\n');
        
        const report = {
            total_queries: 0,
            low_score_queries: [], // < 0.55
            unanswered: 0,
            avg_latency_ms: 0,
            security_blocked: 0,
            top_questions: {}
        };

        let totalLatency = 0;
        let countForLatency = 0;

        lines.forEach(line => {
            if (!line.trim()) return;
            try {
                const e = JSON.parse(line);
                if (e.type === 'RAGQueryMetrics') {
                    report.total_queries++;
                    totalLatency += e.total_ms || 0;
                    countForLatency++;
                    
                    if (e.maxScore < 0.55) {
                        report.low_score_queries.push({ query: e.query, score: e.maxScore });
                    }
                    
                    // Audit top questions
                    const q = e.query.toLowerCase().trim();
                    report.top_questions[q] = (report.top_questions[q] || 0) + 1;
                }
                if (e.type === 'UnansweredQuery') report.unanswered++;
                if (e.type === 'SecurityBlocked') report.security_blocked++;
            } catch(err) {}
        });

        report.avg_latency_ms = countForLatency > 0 ? Math.floor(totalLatency / countForLatency) : 0;
        
        // Sort top questions
        report.top_questions = Object.entries(report.top_questions)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([query, count]) => ({ query, count }));

        res.json(report);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getSystemErrors = async (req, res) => {
    try {
        if (!fs.existsSync(ERRORS_FILE)) return res.json({ errors: [] });

        const data = await fs.promises.readFile(ERRORS_FILE, 'utf8');
        const lines = data.trim().split('\n');

        const errors = lines
            .filter(line => line.trim())
            .map(line => {
                try { return JSON.parse(line); } catch (e) { return null; }
            })
            .filter(e => e !== null)
            .reverse()
            .slice(0, 100);

        res.json({ errors });
    } catch (error) {
        console.error('Error reading system errors:', error);
        res.status(500).json({ error: 'Failed to read logs' });
    }
};

export const postResolveError = async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'Missing error ID' });

    try {
        if (!fs.existsSync(ERRORS_FILE)) return res.status(404).json({ error: 'Log not found' });

        const data = await fs.promises.readFile(ERRORS_FILE, 'utf8');
        const lines = data.trim().split('\n');

        const updatedLines = lines.map(line => {
            if (!line.trim()) return line;
            try {
                const err = JSON.parse(line);
                if (err.id === id) {
                    err.status = 'resolved';
                    return JSON.stringify(err);
                }
                return line;
            } catch (e) { return line; }
        });

        await fs.promises.writeFile(ERRORS_FILE, updatedLines.join('\n') + '\n');
        res.json({ success: true });
    } catch (error) {
        console.error('Error resolving error:', error);
        res.status(500).json({ error: 'Failed to update log' });
    }
};

export const postReportError = (req, res) => {
    const { type, module, message, stack, details } = req.body;
    logErrorEvent(type, module, message, stack, details || {});
    res.json({ success: true });
};

async function readErrorLines() {
    if (!fs.existsSync(ERRORS_FILE)) return [];
    const data = await fs.promises.readFile(ERRORS_FILE, 'utf8');
    return data.trim().split('\n')
        .filter(line => line.trim())
        .map(line => { try { return JSON.parse(line); } catch (e) { return null; } })
        .filter(e => e !== null);
}

/**
 * Las consultas INSUFFICIENT_CONTEXT del pipeline RAG no viven en errors.jsonl
 * (chatController las registra como 'UnansweredQuery' en analytics.jsonl, ver
 * logAnalyticsEvent), así que para mostrarlas junto a los demás errores del
 * sistema (como en el mockup) hay que leerlas de ese otro archivo y agregarlas
 * en un único grupo de solo lectura — no hay dónde persistir un estado
 * resuelto/ignorado por evento individual para estos registros.
 */
async function readInsufficientContextSummary() {
    if (!fs.existsSync(LOG_FILE)) return null;
    const data = await fs.promises.readFile(LOG_FILE, 'utf8');
    const events = data.trim().split('\n')
        .filter(line => line.trim())
        .map(line => { try { return JSON.parse(line); } catch (e) { return null; } })
        .filter(e => e && e.type === 'UnansweredQuery' && e.reason === 'insufficient_context');

    if (events.length === 0) return null;

    const occurrences = events
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .map(e => ({ id: e.timestamp, timestamp: e.timestamp, status: 'pending', os: '—', browser: '—', message: e.query, stack: null, details: null }));

    return {
        fingerprint: 'insufficient-context-summary',
        title: 'UNANSWEREDQUERY — INSUFFICIENT_CONTEXT',
        type: 'UnansweredQuery',
        module: 'RAG',
        isInsufficientContext: true,
        readOnly: true,
        platforms: [],
        count: occurrences.length,
        status: 'pending',
        lastTimestamp: occurrences[0].timestamp,
        occurrences,
    };
}

/**
 * GET /api/system-errors/grouped — agrupa errores.jsonl por fingerprint
 * (type+module+mensaje normalizado), sin requerir que las entradas antiguas
 * ya tengan un campo fingerprint guardado (se calcula al vuelo).
 */
export const getGroupedSystemErrors = async (req, res) => {
    try {
        const errors = await readErrorLines();
        const groups = new Map();

        for (const err of errors) {
            const fingerprint = fingerprintError(err);
            const { os, browser } = parsePlatform(err.details?.userAgent);

            if (!groups.has(fingerprint)) {
                groups.set(fingerprint, {
                    fingerprint,
                    title: `[${err.module || '—'}] ${err.message || '(sin mensaje)'}`,
                    type: err.type,
                    module: err.module,
                    isInsufficientContext: err.type === 'UnansweredQuery' || /insufficient_context/i.test(err.message || ''),
                    platforms: new Set(),
                    occurrences: [],
                });
            }

            const group = groups.get(fingerprint);
            group.platforms.add(os);
            group.platforms.add(browser);
            group.occurrences.push({
                id: err.id,
                timestamp: err.timestamp,
                status: err.status || 'pending',
                os,
                browser,
                message: err.message,
                stack: err.stack,
                details: err.details,
            });
        }

        const result = Array.from(groups.values()).map(g => {
            const occurrences = g.occurrences.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            const allResolved = occurrences.every(o => o.status === 'resolved');
            const anyIgnored = occurrences.some(o => o.status === 'ignored');
            return {
                fingerprint: g.fingerprint,
                title: g.title,
                type: g.type,
                module: g.module,
                isInsufficientContext: g.isInsufficientContext,
                platforms: Array.from(g.platforms),
                count: occurrences.length,
                status: allResolved ? 'resolved' : (anyIgnored ? 'ignored' : 'pending'),
                lastTimestamp: occurrences[0]?.timestamp || null,
                occurrences,
            };
        });

        const insufficientContextGroup = await readInsufficientContextSummary();
        if (insufficientContextGroup) result.push(insufficientContextGroup);
        result.sort((a, b) => new Date(b.lastTimestamp) - new Date(a.lastTimestamp));

        res.json({
            groups: result,
            totalEvents: errors.length + (insufficientContextGroup?.count || 0),
            totalGroups: result.length,
        });
    } catch (error) {
        console.error('Error grouping system errors:', error);
        res.status(500).json({ error: 'Failed to read/group logs' });
    }
};

/**
 * POST /api/system-errors/resolve-bulk — marca en una sola escritura todas las
 * ocurrencias pertenecientes a los fingerprints dados (acción sobre un grupo
 * completo, no una sola fila).
 * Body: { fingerprints: string[], status?: 'resolved'|'ignored' }
 */
export const postResolveBulk = async (req, res) => {
    const { fingerprints, status = 'resolved' } = req.body;
    if (!Array.isArray(fingerprints) || fingerprints.length === 0) {
        return res.status(400).json({ error: 'Missing fingerprints array' });
    }
    if (!['resolved', 'ignored'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    try {
        if (!fs.existsSync(ERRORS_FILE)) return res.status(404).json({ error: 'Log not found' });

        const data = await fs.promises.readFile(ERRORS_FILE, 'utf8');
        const lines = data.trim().split('\n');
        const targetSet = new Set(fingerprints);
        let updatedCount = 0;

        const updatedLines = lines.map(line => {
            if (!line.trim()) return line;
            try {
                const err = JSON.parse(line);
                if (targetSet.has(fingerprintError(err))) {
                    err.status = status;
                    updatedCount++;
                    return JSON.stringify(err);
                }
                return line;
            } catch (e) { return line; }
        });

        await fs.promises.writeFile(ERRORS_FILE, updatedLines.join('\n') + '\n');
        res.json({ success: true, groupsRequested: fingerprints.length, eventsUpdated: updatedCount });
    } catch (error) {
        console.error('Error bulk-resolving errors:', error);
        res.status(500).json({ error: 'Failed to update log' });
    }
};
