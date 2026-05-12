import fs from 'fs';
import path from 'path';
import { logAnalyticsEvent, logErrorEvent } from '../utils/logger.js';

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
