import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import DatabaseService from '../services/database.js';

const DATASET_PATH = path.join(process.cwd(), 'tests', 'enterprise_dataset.json');
const DATASET_VERSION = 'enterprise_dataset v1 (75 preguntas)';
const ENV_PATH = path.join(process.cwd(), '.env');

let cachedDataset = null;
function loadDataset() {
    if (cachedDataset) return cachedDataset;
    const raw = fs.readFileSync(DATASET_PATH, 'utf8');
    cachedDataset = JSON.parse(raw);
    return cachedDataset;
}

/**
 * NOTA IMPORTANTE: esta puntuación es SIMULADA (determinística por semilla,
 * no una llamada real a Ollama/LLM-judge). No existe en el repo un set de
 * 150 preguntas versionado ni un runner reutilizable para el "piloto qwen2.5
 * vs llama3.2" mencionado en la documentación — solo quedó el resultado
 * (44→13/150) escrito en prosa. La infraestructura real más cercana es
 * tests/test_enterprise_real_benchmark.js (75 preguntas, LLM-judge real,
 * tarda varios minutos). Esta ruta deja el contrato de API y persistencia
 * listos para, en una siguiente iteración, invocar ese runner real en lugar
 * de generar métricas sintéticas.
 */
function seededRandom(seed) {
    let h = crypto.createHash('sha1').update(seed).digest();
    let state = h.readUInt32LE(0);
    return function () {
        state |= 0; state = (state + 0x6D2B79F5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function simulateModelRun(questions, modelName, { baseHallucinationRate, baseLatencyMs, baseConfidence }) {
    const rand = seededRandom(modelName);
    const perQuestion = questions.map(q => {
        const hallucination = rand() < baseHallucinationRate;
        const citationCorrect = !hallucination && rand() > 0.06;
        const confidence = Math.min(0.99, Math.max(0.3, baseConfidence + (rand() - 0.5) * 0.28 - (hallucination ? 0.25 : 0)));
        const latencyMs = Math.round(baseLatencyMs * (0.75 + rand() * 0.6));
        return { id: q.id, hallucination, citationCorrect, confidence: Number(confidence.toFixed(2)), latencyMs };
    });

    const hallucinations = perQuestion.filter(r => r.hallucination).length;
    const citationAccuracy = perQuestion.filter(r => r.citationCorrect).length / perQuestion.length;
    const avgConfidence = perQuestion.reduce((s, r) => s + r.confidence, 0) / perQuestion.length;
    const avgLatencyMs = perQuestion.reduce((s, r) => s + r.latencyMs, 0) / perQuestion.length;

    return {
        perQuestion,
        summary: {
            hallucinations,
            avgConfidence: Number(avgConfidence.toFixed(3)),
            citationAccuracy: Number((citationAccuracy * 100).toFixed(1)),
            avgLatencyMs: Math.round(avgLatencyMs),
        }
    };
}

function verdictFor(current, candidate) {
    const latencyWorse = candidate.latencyMs > current.latencyMs * 1.4;
    if (!current.citationCorrect && candidate.citationCorrect) return 'Mejora el candidato';
    if (candidate.confidence - current.confidence >= 0.08 && !latencyWorse) return 'Mejora el candidato';
    if (latencyWorse && candidate.confidence >= current.confidence) return 'Revisar latencia';
    if (current.citationCorrect && !candidate.citationCorrect) return 'Revisar latencia';
    return 'Empate';
}

export const getDataset = (req, res) => {
    try {
        const dataset = loadDataset();
        res.json({
            version: DATASET_VERSION,
            count: dataset.length,
            productionModel: process.env.OLLAMA_MODEL || 'qwen2.5:latest',
            questions: dataset.map(q => ({ id: q.id, categoria: q.categoria, pregunta: q.pregunta, expected_source: q.expected_source })),
        });
    } catch (error) {
        console.error('Error loading benchmark dataset:', error);
        res.status(500).json({ error: 'No se pudo cargar el set de preguntas' });
    }
};

/**
 * GET /api/model-benchmark/available-models — proxy de solo lectura a
 * Ollama /api/tags, para poblar el selector de "modelo candidato" con los
 * modelos realmente disponibles en esta máquina.
 */
export const getAvailableModels = async (req, res) => {
    try {
        const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const tagsRes = await fetch(`${ollamaUrl}/api/tags`, { signal: controller.signal });
        clearTimeout(timeout);
        if (!tagsRes.ok) throw new Error(`Ollama respondió ${tagsRes.status}`);
        const tagsData = await tagsRes.json();
        const productionModel = process.env.OLLAMA_MODEL || 'qwen2.5:latest';
        const models = (tagsData.models || []).map(m => m.name).filter(n => n !== productionModel);
        res.json({ models });
    } catch (error) {
        res.json({ models: [], error: 'No se pudo conectar con Ollama' });
    }
};

export const runBenchmark = async (req, res) => {
    const { candidateModel, includeReranker = false } = req.body;
    if (!candidateModel || typeof candidateModel !== 'string') {
        return res.status(400).json({ error: 'candidateModel es requerido' });
    }

    const productionModel = process.env.OLLAMA_MODEL || 'qwen2.5:latest';

    try {
        const dataset = loadDataset();

        // Sanity check opcional: ¿el candidato está disponible en Ollama? No bloquea
        // la corrida (sigue siendo simulada), solo informa al admin antes de promover.
        let candidateModelAvailable = null;
        try {
            const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 2500);
            const tagsRes = await fetch(`${ollamaUrl}/api/tags`, { signal: controller.signal });
            clearTimeout(timeout);
            if (tagsRes.ok) {
                const tagsData = await tagsRes.json();
                const names = (tagsData.models || []).map(m => m.name);
                candidateModelAvailable = names.includes(candidateModel);
            }
        } catch (e) {
            candidateModelAvailable = null; // Ollama no respondió a tiempo; no es un error fatal
        }

        const current = simulateModelRun(dataset, productionModel, { baseHallucinationRate: 0.09, baseLatencyMs: 4100, baseConfidence: 0.86 });
        const candidateRerankerBoost = includeReranker ? 0.03 : 0;
        const candidate = simulateModelRun(dataset, candidateModel, {
            baseHallucinationRate: Math.max(0.02, 0.09 - candidateRerankerBoost * 0.5),
            baseLatencyMs: 4100 * (1 + (seededRandom(candidateModel + ':latency')() - 0.3)),
            baseConfidence: Math.min(0.97, 0.86 + candidateRerankerBoost + (seededRandom(candidateModel + ':conf')() - 0.5) * 0.1),
        });

        const details = dataset.map((q, i) => {
            const curr = current.perQuestion[i];
            const cand = candidate.perQuestion[i];
            return {
                id: q.id,
                categoria: q.categoria,
                pregunta: q.pregunta,
                currentConfidence: curr.confidence,
                candidateConfidence: cand.confidence,
                currentCitationCorrect: curr.citationCorrect,
                candidateCitationCorrect: cand.citationCorrect,
                verdict: verdictFor(curr, cand),
            };
        });

        const summary = {
            productionModel,
            candidateModel,
            includeReranker: !!includeReranker,
            candidateModelAvailable,
            hallucinations: { current: current.summary.hallucinations, candidate: candidate.summary.hallucinations },
            avgConfidence: { current: current.summary.avgConfidence, candidate: candidate.summary.avgConfidence },
            citationAccuracy: { current: current.summary.citationAccuracy, candidate: candidate.summary.citationAccuracy },
            avgLatencySeconds: { current: Number((current.summary.avgLatencyMs / 1000).toFixed(1)), candidate: Number((candidate.summary.avgLatencyMs / 1000).toFixed(1)) },
            simulated: true,
        };

        const runId = await DatabaseService.saveBenchmarkRun({
            productionModel,
            candidateModel,
            includeReranker: !!includeReranker,
            datasetVersion: DATASET_VERSION,
            datasetSize: dataset.length,
            summary,
            details,
        });

        res.json({ runId, datasetVersion: DATASET_VERSION, datasetSize: dataset.length, summary, details });
    } catch (error) {
        console.error('Error running model benchmark:', error);
        res.status(500).json({ error: 'No se pudo ejecutar el benchmark' });
    }
};

export const listRuns = async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const runs = await DatabaseService.listBenchmarkRuns(limit);
        res.json({ runs });
    } catch (error) {
        console.error('Error listing benchmark runs:', error);
        res.status(500).json({ error: 'No se pudieron listar las corridas' });
    }
};

/**
 * POST /api/model-benchmark/promote — acción sensible: cambia OLLAMA_MODEL
 * en el .env (y en el proceso vivo, que lo lee sin caché en cada request)
 * para que el candidato pase a producción. Requiere confirmación en el UI.
 */
export const promoteCandidate = async (req, res) => {
    const { runId } = req.body;
    if (!runId) return res.status(400).json({ error: 'runId es requerido' });

    try {
        const run = await DatabaseService.getBenchmarkRun(runId);
        if (!run) return res.status(404).json({ error: 'Corrida no encontrada' });

        const candidateModel = run.candidate_model;

        if (fs.existsSync(ENV_PATH)) {
            const envContent = await fs.promises.readFile(ENV_PATH, 'utf8');
            const hasVar = /^OLLAMA_MODEL=.*/m.test(envContent);
            const newContent = hasVar
                ? envContent.replace(/^OLLAMA_MODEL=.*/m, `OLLAMA_MODEL=${candidateModel}`)
                : `${envContent.trim()}\nOLLAMA_MODEL=${candidateModel}\n`;
            await fs.promises.writeFile(ENV_PATH, newContent);
        }
        process.env.OLLAMA_MODEL = candidateModel;

        await DatabaseService.markBenchmarkPromoted(runId);

        res.json({ success: true, promotedModel: candidateModel });
    } catch (error) {
        console.error('Error promoting candidate model:', error);
        res.status(500).json({ error: 'No se pudo promover el modelo candidato' });
    }
};
