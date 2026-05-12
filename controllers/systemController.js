import fs from 'fs';
import path from 'path';
import os from 'os';
import DatabaseService from '../services/database.js';

const LOG_FILE = path.join(process.cwd(), 'analytics.jsonl');
const ERRORS_FILE = path.join(process.cwd(), 'errors.jsonl');
const START_TIME = Date.now();

import appState from '../utils/state.js';

export const getHealth = (req, res) => {
    res.json({
        status: appState.SERVER_READY ? 'ready' : 'initializing',
        engine: 'RAG Local (Qdrant + Gemma + Ollama)',
        timestamp: new Date().toISOString()
    });
};

export const getSystemStatus = async (req, res) => {
    const memoryUsage = process.memoryUsage();
    const status = {
        timestamp: new Date().toISOString(),
        uptime_seconds: Math.floor((Date.now() - START_TIME) / 1000),
        system: {
            platform: os.platform(),
            release: os.release(),
            total_mem_gb: (os.totalmem() / (1024 ** 3)).toFixed(2),
            free_mem_gb: (os.freemem() / (1024 ** 3)).toFixed(2),
            load_avg: os.loadavg()
        },
        process: {
            memory_rss_mb: (memoryUsage.rss / (1024 * 1024)).toFixed(2),
            memory_heap_mb: (memoryUsage.heapUsed / (1024 * 1024)).toFixed(2)
        },
        services: [
            { id: 'backend', name: 'API Server', status: 'active', version: '1.5.0' },
            { id: 'database', name: 'SQLite Cache', status: 'checking' },
            { id: 'qdrant', name: 'Qdrant Vector DB', status: 'checking' },
            { id: 'ollama', name: 'Ollama LLM Engine', status: 'checking' }
        ],
        recent_errors: 0
    };

    // 1. Check SQLite
    try {
        const stats = await DatabaseService.getStats();
        status.services[1].status = 'active';
        status.services[1].details = { total_records: stats.total };
    } catch (e) {
        status.services[1].status = 'error';
    }

    // 2. Check Qdrant
    try {
        const resp = await fetch(`${process.env.QDRANT_URL || 'http://localhost:6333'}/collections`);
        status.services[2].status = resp.ok ? 'active' : 'error';
    } catch (e) {
        status.services[2].status = 'error';
    }

    // 3. Check Ollama
    try {
        const resp = await fetch(`${process.env.OLLAMA_URL || 'http://localhost:11434'}/api/tags`);
        status.services[3].status = resp.ok ? 'active' : 'error';
    } catch (e) {
        status.services[3].status = 'error';
    }

    // 4. Count recent errors
    try {
        if (fs.existsSync(ERRORS_FILE)) {
            const data = await fs.promises.readFile(ERRORS_FILE, 'utf8');
            const lines = data.trim().split('\n');
            const lastHour = Date.now() - (60 * 60 * 1000);
            status.recent_errors = lines.filter(line => {
                try { return JSON.parse(line).timestamp > new Date(lastHour).toISOString(); } catch(e){ return false; }
            }).length;
        }
    } catch (e) {}

    res.json(status);
};

export const getKnowledgeVersion = async (req, res) => {
    const KV_FILE = path.join(process.cwd(), 'knowledge_version.json');
    let currentVersion = 0;
    try {
        if (fs.existsSync(KV_FILE)) {
            const data = JSON.parse(fs.readFileSync(KV_FILE, 'utf8'));
            currentVersion = data.version || 0;
        }
    } catch (e) {}

    try {
        const stale = await DatabaseService.getStaleRecords(currentVersion, 1000);
        res.json({
            version: currentVersion,
            staleRecords: stale.length,
            message: stale.length > 0 ? 'Revalidación pendiente' : 'Al día'
        });
    } catch (e) {
        res.json({ version: currentVersion, staleRecords: 0 });
    }
};
