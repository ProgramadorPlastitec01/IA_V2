/**
 * tests/test_cross_encoder_benchmark.js
 * Benchmark Comparativo — Fase 2.5.1: Cross-Encoder Neural Reranking
 *
 * Ejecuta el benchmark completo sobre el mismo enterprise_dataset.json
 * con ENABLE_NEURAL_RERANKER=true para medir el impacto real del Cross-Encoder.
 *
 * Métricas reportadas:
 *   - Retrieval Accuracy, Grounding, Hallucination, FNR, Enterprise Score, Latencia, RAM
 * Comparativa incluida vs. Línea Base (82.27%)
 */

import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import llmService from '../services/llmService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_URL  = 'http://localhost:3000/api/query';
const DATASET_FILE = path.join(__dirname, 'enterprise_dataset.json');
const REPORTS_DIR  = path.join(process.cwd(), 'reports');
const LOGS_DIR     = path.join(process.cwd(), 'logs');

// ─── Línea base para comparativa ─────────────────────────────────────────────
const BASELINE = {
    retrieval_accuracy:  82.67,
    grounding_accuracy:  82.67,
    hallucination_rate:  12.00,
    false_negative_rate: 22.67,
    avg_latency_ms:      12400,
    enterprise_score:    82.27,
};

// ─── Objetivos de éxito de la Fase 2.5.1 ─────────────────────────────────────
const TARGETS = {
    enterprise_score:    88,
    retrieval_accuracy:  90,
    grounding_accuracy:  88,
    hallucination_rate:   5,
    false_negative_rate: 10,
    avg_latency_ms:      15000,
};

// ─── Juez LLM ────────────────────────────────────────────────────────────────
async function judgeResponse(question, expectedAnswer, ragResponse, evidence) {
    const prompt = `<|start_header_id|>system<|end_header_id|>
Eres un evaluador de QA estricto para un sistema RAG corporativo.
Evalúa la RESPUESTA del asistente comparándola con la RESPUESTA ESPERADA y la EVIDENCIA.

Devuelve ÚNICAMENTE JSON válido con este formato, sin texto adicional:
{
  "grounding": 1,
  "hallucination": 0,
  "polarity_ok": true,
  "false_negative": false,
  "reasoning": "Breve justificación."
}
<|eot_id|><|start_header_id|>user<|end_header_id|>
PREGUNTA: "${question}"
RESPUESTA ESPERADA: "${expectedAnswer}"
RESPUESTA DEL ASISTENTE: "${ragResponse}"
EVIDENCIA RECUPERADA: "${(evidence || '').substring(0, 800)}"
<|eot_id|><|start_header_id|>assistant<|end_header_id|>`;

    try {
        const raw = await llmService.generateResponse(prompt);
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
    } catch (e) { /* fall through */ }
    return { grounding: 0, hallucination: 1, polarity_ok: false, false_negative: false, reasoning: 'Fallo en evaluación.' };
}

function checkRetrievalAccuracy(expectedSource, sources = []) {
    if (!expectedSource) return { correct: true, retrieved: sources };
    const normalizedExpected = expectedSource.toLowerCase().replace(/\s+/g, ' ').trim();
    const correct = sources.some(s =>
        s.toLowerCase().includes(normalizedExpected.split(' ')[0]) ||
        normalizedExpected.includes(s.toLowerCase().split(' ')[0])
    );
    return { correct, retrieved: sources };
}

// ─── Utilidad RAM ─────────────────────────────────────────────────────────────
function getRamUsageMB() {
    const used = process.memoryUsage();
    return {
        heapUsed:  Math.round(used.heapUsed  / 1024 / 1024),
        heapTotal: Math.round(used.heapTotal / 1024 / 1024),
        rss:       Math.round(used.rss       / 1024 / 1024),
    };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function runBenchmark() {
    console.log("=".repeat(72));
    console.log("🧠 CROSS-ENCODER BENCHMARK — Fase 2.5.1");
    console.log("=".repeat(72));
    console.log(`   Modelo Cross-Encoder: ${process.env.NEURAL_RERANKER_MODEL || 'Xenova/bge-reranker-base'}`);
    console.log(`   Neural Flag Activo:   ${process.env.ENABLE_NEURAL_RERANKER}`);

    const ramBefore = getRamUsageMB();
    console.log(`   RAM antes del benchmark: RSS=${ramBefore.rss}MB  Heap=${ramBefore.heapUsed}MB\n`);

    const rawDataset = JSON.parse(await fs.readFile(DATASET_FILE, 'utf8'));
    console.log(`   📋 Dataset cargado: ${rawDataset.length} preguntas\n`);

    const rawResults  = [];
    const logLines    = [];
    const byCategory  = {};

    for (let i = 0; i < rawDataset.length; i++) {
        const item = rawDataset[i];
        const { categoria, pregunta, respuesta_esperada, expected_source } = item;

        process.stdout.write(`[${String(i+1).padStart(3)}/${rawDataset.length}] (${categoria}) ${pregunta.substring(0, 55)}...\n`);

        const t0 = Date.now();
        let ragResp = null;
        let evalResult = { grounding: 0, hallucination: 1, polarity_ok: false, false_negative: false };
        let retrievalCheck = { correct: false, retrieved: [] };
        let latency = 0;

        try {
            const res = await fetch(BACKEND_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: pregunta, bypass_cache: true }),
            });
            ragResp = await res.json();
            latency = Date.now() - t0;

            const answer  = ragResp.response || ragResp.answer || '';
            const sources = ragResp.sources  || [];
            const context = ragResp.context  || '';

            retrievalCheck = checkRetrievalAccuracy(expected_source, sources);
            evalResult     = await judgeResponse(pregunta, respuesta_esperada, answer, context);

            process.stdout.write(`   ⏱  ${latency}ms | Neural: ✅ | Retrieval: ${retrievalCheck.correct ? '✅' : '❌'} | Ground: ${evalResult.grounding} | Hall: ${evalResult.hallucination} | FN: ${evalResult.false_negative}\n`);
        } catch (err) {
            latency = Date.now() - t0;
            process.stdout.write(`   ❌ Error: ${err.message}\n`);
        }

        const record = {
            id: item.id || `q${i}`,
            categoria,
            pregunta,
            respuesta_esperada,
            expected_source,
            retrieved_sources: retrievalCheck.retrieved,
            retrieval_correct: retrievalCheck.correct,
            response:       ragResp?.response || ragResp?.answer || '',
            confidence:     ragResp?.confidence || 0,
            latency_ms:     latency,
            grounding:      evalResult.grounding,
            hallucination:  evalResult.hallucination,
            polarity_ok:    evalResult.polarity_ok,
            false_negative: evalResult.false_negative,
            reasoning:      evalResult.reasoning,
            timestamp:      new Date().toISOString(),
        };

        rawResults.push(record);
        logLines.push(JSON.stringify(record));

        if (!byCategory[categoria]) {
            byCategory[categoria] = { total: 0, retrieval_ok: 0, grounding: 0, hallucinations: 0, false_negatives: 0, latency_sum: 0 };
        }
        const cat = byCategory[categoria];
        cat.total++;
        if (retrievalCheck.correct) cat.retrieval_ok++;
        cat.grounding      += evalResult.grounding;
        cat.hallucinations += evalResult.hallucination;
        if (evalResult.false_negative) cat.false_negatives++;
        cat.latency_sum    += latency;
    }

    // ─── Métricas Globales ────────────────────────────────────────────────────
    const ramAfter = getRamUsageMB();
    const ramDelta = { rss: ramAfter.rss - ramBefore.rss, heap: ramAfter.heapUsed - ramBefore.heapUsed };

    const N = rawResults.length || 1;
    const metrics = {
        retrieval_accuracy:  +(rawResults.filter(r => r.retrieval_correct).length / N * 100).toFixed(2),
        grounding_accuracy:  +(rawResults.reduce((s, r) => s + r.grounding, 0) / N * 100).toFixed(2),
        hallucination_rate:  +(rawResults.reduce((s, r) => s + r.hallucination, 0) / N * 100).toFixed(2),
        false_negative_rate: +(rawResults.filter(r => r.false_negative).length / N * 100).toFixed(2),
        avg_latency_ms:      +(rawResults.reduce((s, r) => s + r.latency_ms, 0) / N).toFixed(0),
        ram_delta_rss_mb:    ramDelta.rss,
        ram_delta_heap_mb:   ramDelta.heap,
    };
    metrics.enterprise_score = +((
        metrics.retrieval_accuracy   * 0.30 +
        metrics.grounding_accuracy   * 0.40 +
        (100 - metrics.hallucination_rate)  * 0.20 +
        (100 - metrics.false_negative_rate) * 0.10
    ).toFixed(2));

    // ─── Matriz por categoría ─────────────────────────────────────────────────
    console.log("\n" + "=".repeat(72));
    console.log("🏁 RESULTADOS FINALES — Cross-Encoder Benchmark");
    console.log("=".repeat(72));
    const check = (val, target, unit='%', invert=false) => {
        const ok = invert ? val <= target : val >= target;
        const delta = invert ? val - BASELINE[Object.keys(metrics).find(k => metrics[k]===val)] : val - (BASELINE[Object.keys(metrics).find(k => metrics[k]===val)] || 0);
        return `${ok ? '✅' : '❌'}`;
    };

    const printRow = (label, val, baseline, target, unit='%', lowerIsBetter=false) => {
        const delta = val - baseline;
        const ok = lowerIsBetter ? val <= target : val >= target;
        const dir = delta >= 0 ? '▲' : '▼';
        const deltaStr = `${dir}${Math.abs(delta).toFixed(2)}`;
        console.log(`   ${ok ? '✅' : '❌'} ${label.padEnd(28)} ${String(val).padStart(7)}${unit}  base=${baseline}${unit}  ${deltaStr}  (obj: ${target}${unit})`);
    };

    printRow('Retrieval Accuracy',    metrics.retrieval_accuracy,  BASELINE.retrieval_accuracy,  TARGETS.retrieval_accuracy);
    printRow('Grounding Accuracy',    metrics.grounding_accuracy,  BASELINE.grounding_accuracy,  TARGETS.grounding_accuracy);
    printRow('Hallucination Rate',    metrics.hallucination_rate,  BASELINE.hallucination_rate,  TARGETS.hallucination_rate, '%', true);
    printRow('False Negative Rate',   metrics.false_negative_rate, BASELINE.false_negative_rate, TARGETS.false_negative_rate, '%', true);
    printRow('Avg Latency',           metrics.avg_latency_ms,      BASELINE.avg_latency_ms,      TARGETS.avg_latency_ms, 'ms', true);
    printRow('Enterprise Score',      metrics.enterprise_score,    BASELINE.enterprise_score,    TARGETS.enterprise_score);
    console.log(`\n   💾 RAM adicional (RSS): +${ramDelta.rss}MB  Heap: +${ramDelta.heap}MB`);

    const weaknessMatrix = {};
    console.log("\n📊 MATRIZ POR CATEGORÍA:");
    console.log("-".repeat(72));
    for (const [cat, s] of Object.entries(byCategory)) {
        const r = +(s.retrieval_ok   / s.total * 100).toFixed(1);
        const g = +(s.grounding      / s.total * 100).toFixed(1);
        const h = +(s.hallucinations / s.total * 100).toFixed(1);
        const f = +(s.false_negatives / s.total * 100).toFixed(1);
        const l = +(s.latency_sum    / s.total).toFixed(0);
        const sc = +(r * 0.30 + g * 0.40 + (100-h) * 0.20 + (100-f) * 0.10).toFixed(1);
        weaknessMatrix[cat] = { retrieval: r, grounding: g, hallRate: h, fnRate: f, avgLat: l, score: sc, total: s.total };
        const icon = sc >= 88 ? '🟢' : sc >= 70 ? '🟡' : '🔴';
        console.log(`   ${icon} ${cat.padEnd(22)} Score: ${String(sc).padStart(5)}%  Ret: ${r}%  Grd: ${g}%  Hall: ${h}%  n=${s.total}`);
    }

    // ─── Guardar archivos ─────────────────────────────────────────────────────
    await fs.mkdir(REPORTS_DIR, { recursive: true });
    await fs.mkdir(LOGS_DIR,    { recursive: true });

    const rawJson = {
        run_date: new Date().toISOString(),
        model: process.env.NEURAL_RERANKER_MODEL || 'Xenova/bge-reranker-base',
        total_questions: N,
        global_metrics: metrics,
        baseline: BASELINE,
        targets:  TARGETS,
        by_category: weaknessMatrix,
        results: rawResults,
    };
    await fs.writeFile(path.join(REPORTS_DIR, 'cross_encoder_benchmark_raw.json'), JSON.stringify(rawJson, null, 2));
    await fs.writeFile(path.join(LOGS_DIR,    'cross_encoder_benchmark.jsonl'),    logLines.join('\n'));

    const md = buildMarkdown(metrics, weaknessMatrix, N, ramDelta);
    await fs.writeFile(path.join(REPORTS_DIR, 'cross_encoder_benchmark.md'), md);

    console.log("\n📁 ARCHIVOS GENERADOS:");
    console.log("   - reports/cross_encoder_benchmark.md");
    console.log("   - reports/cross_encoder_benchmark_raw.json");
    console.log("   - logs/cross_encoder_benchmark.jsonl");
}

function buildMarkdown(metrics, matrix, N, ramDelta) {
    const date = new Date().toISOString();
    const delta = (key, invert=false) => {
        const d = metrics[key] - (BASELINE[key] || 0);
        const ok = invert ? d <= 0 : d >= 0;
        return `${ok ? '🟢' : '🔴'} ${d >= 0 ? '+' : ''}${d.toFixed(2)}`;
    };
    const rows = Object.entries(matrix).map(([cat, m]) => {
        const icon = m.score >= 88 ? '🟢' : m.score >= 70 ? '🟡' : '🔴';
        return `| ${icon} ${cat} | ${m.total} | ${m.retrieval}% | ${m.grounding}% | ${m.hallRate}% | ${m.fnRate}% | ${m.avgLat}ms | **${m.score}%** |`;
    }).join('\n');

    return `# Cross-Encoder Benchmark — Fase 2.5.1
> Fecha: ${date}
> Modelo: \`${process.env.NEURAL_RERANKER_MODEL || 'Xenova/bge-reranker-base'}\`
> Total preguntas: ${N}

## Métricas Globales

| Métrica | Línea Base | **Post CE** | Δ | Objetivo | Estado |
|---------|-----------|-------------|---|----------|--------|
| Retrieval Accuracy | ${BASELINE.retrieval_accuracy}% | **${metrics.retrieval_accuracy}%** | ${delta('retrieval_accuracy')} | >${TARGETS.retrieval_accuracy}% | ${metrics.retrieval_accuracy >= TARGETS.retrieval_accuracy ? '✅' : '❌'} |
| Grounding Accuracy | ${BASELINE.grounding_accuracy}% | **${metrics.grounding_accuracy}%** | ${delta('grounding_accuracy')} | >${TARGETS.grounding_accuracy}% | ${metrics.grounding_accuracy >= TARGETS.grounding_accuracy ? '✅' : '❌'} |
| Hallucination Rate | ${BASELINE.hallucination_rate}% | **${metrics.hallucination_rate}%** | ${delta('hallucination_rate', true)} | <${TARGETS.hallucination_rate}% | ${metrics.hallucination_rate <= TARGETS.hallucination_rate ? '✅' : '❌'} |
| False Negative Rate | ${BASELINE.false_negative_rate}% | **${metrics.false_negative_rate}%** | ${delta('false_negative_rate', true)} | <${TARGETS.false_negative_rate}% | ${metrics.false_negative_rate <= TARGETS.false_negative_rate ? '✅' : '❌'} |
| Avg Latency | ${BASELINE.avg_latency_ms}ms | **${metrics.avg_latency_ms}ms** | ${delta('avg_latency_ms', true)} | <${TARGETS.avg_latency_ms}ms | ${metrics.avg_latency_ms <= TARGETS.avg_latency_ms ? '✅' : '❌'} |
| **Enterprise Score** | ${BASELINE.enterprise_score}% | **${metrics.enterprise_score}%** | ${delta('enterprise_score')} | >${TARGETS.enterprise_score}% | ${metrics.enterprise_score >= TARGETS.enterprise_score ? '✅' : '❌'} |
| RAM Adicional (RSS) | - | **+${ramDelta.rss}MB** | - | - | - |

## Matriz por Categoría

| Categoría | n | Retrieval | Grounding | Alucinaciones | FP Neg | Latencia | Score |
|-----------|---|-----------|-----------|---------------|--------|----------|-------|
${rows}

## Conclusión

${metrics.enterprise_score >= TARGETS.enterprise_score
    ? '✅ **La Fase 2.5.1 ha superado el objetivo de Enterprise Score ≥88%.**\n\nEl Cross-Encoder Neural Reranking se confirma como arquitectura candidata para producción.'
    : `❌ **El Enterprise Score (${metrics.enterprise_score}%) no alcanzó el objetivo del ${TARGETS.enterprise_score}%.**\n\nSe recomienda continuar la investigación o ajustar los parámetros del Cross-Encoder.`}
`;
}

runBenchmark().catch(console.error);
