/**
 * tests/test_enterprise_real_benchmark.js
 * Benchmark Engine — Fase 2.3B + 2.3C
 *
 * Ejecuta el benchmark completo:
 *  - Carga enterprise_dataset.json
 *  - Consulta el RAG para cada pregunta
 *  - Evalúa: Retrieval Accuracy, Grounding, Hallucinations, Latencia
 *  - Genera: Matriz de Debilidades por categoría
 *  - Exporta: reports/enterprise_benchmark_real.md
 *             reports/enterprise_benchmark_raw.json
 *             logs/enterprise_benchmark.jsonl
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

// ─── Objetivos de la Fase ────────────────────────────────────────────────────
const TARGETS = {
    retrieval_accuracy: 90,
    grounding_accuracy: 90,
    hallucination_rate:  5,
    false_negative_rate: 0,
    avg_latency_ms:  12000,
    enterprise_score:   85,
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

Definiciones:
- grounding (0 o 1): ¿La respuesta está basada en la evidencia, sin inventar datos?
- hallucination (0 o 1): 1 si inventó datos no presentes en la evidencia.
- polarity_ok (bool): ¿La polaridad coincide? (prohibido=no, permitido=sí).
- false_negative (bool): true si la respuesta dice "NO ESPECIFICADO" pero la evidencia SÍ contiene la respuesta.
<|eot_id|><|start_header_id|>user<|end_header_id|>
PREGUNTA: "${question}"
RESPUESTA ESPERADA: "${expectedAnswer}"
RESPUESTA DEL ASISTENTE: "${ragResponse}"
EVIDENCIA RECUPERADA: "${(evidence || '').substring(0, 800)}"
<|eot_id|><|start_header_id|>assistant<|end_header_id|>`;

    try {
        const raw = await llmService.generateResponse(prompt, process.env.OLLAMA_MODEL || 'llama3.2', true);
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
        return JSON.parse(raw);
    } catch (e) { /* fall through */ }
    
    return { grounding: 0, hallucination: 1, polarity_ok: false, false_negative: false, reasoning: "Fallo en evaluación del juez." };
}

// ─── Retrieval Accuracy ───────────────────────────────────────────────────────
function checkRetrievalAccuracy(expectedSource, sources = []) {
    if (!expectedSource) return { correct: true, retrieved: sources }; // sin expectativa
    const normalizedExpected = expectedSource.toLowerCase().replace(/\s+/g, ' ').trim();
    const correct = sources.some(s =>
        s.toLowerCase().includes(normalizedExpected.split(' ')[0]) ||
        normalizedExpected.includes(s.toLowerCase().split(' ')[0])
    );
    return { correct, retrieved: sources };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function runBenchmark() {
    console.log("=".repeat(70));
    console.log("🚀 ENTERPRISE BENCHMARK REAL — Fase 2.3");
    console.log("=".repeat(70));

    const rawDataset = JSON.parse(await fs.readFile(DATASET_FILE, 'utf8'));
    console.log(`   📋 Dataset cargado: ${rawDataset.length} preguntas\n`);

    const rawResults = [];
    const logLines   = [];
    const byCategory = {};

    for (let i = 0; i < rawDataset.length; i++) {
        const item = rawDataset[i];
        const { categoria, pregunta, respuesta_esperada, expected_source } = item;
        
        process.stdout.write(`[${String(i+1).padStart(3)}/${rawDataset.length}] (${categoria}) ${pregunta.substring(0, 55)}...\n`);

        const t0 = Date.now();
        let ragResp = null;
        let evalResult = { grounding: 0, hallucination: 1, polarity_ok: false, false_negative: false, reasoning: "Error" };
        let retrievalCheck = { correct: false, retrieved: [] };
        let latency = 0;

        try {
            const res = await fetch(BACKEND_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: pregunta, bypass_cache: true })
            });
            ragResp = await res.json();
            latency = Date.now() - t0;

            const answer  = ragResp.response || '';
            const sources = ragResp.sources  || [];
            const context = ragResp.context  || '';

            retrievalCheck = checkRetrievalAccuracy(expected_source, sources);
            evalResult = await judgeResponse(pregunta, respuesta_esperada, answer, context);

            process.stdout.write(`   ⏱  ${latency}ms | Conf: ${ragResp.confidence?.toFixed(2)} | Retrieval: ${retrievalCheck.correct ? '✅' : '❌'} | Ground: ${evalResult.grounding} | Hall: ${evalResult.hallucination} | FN: ${evalResult.false_negative}\n`);
        } catch (err) {
            latency = Date.now() - t0;
            process.stdout.write(`   ❌ Error: ${err.message}\n`);
        }

        const record = {
            id:        item.id || `q${i}`,
            categoria,
            pregunta,
            respuesta_esperada,
            expected_source,
            retrieved_sources: retrievalCheck.retrieved,
            retrieval_correct: retrievalCheck.correct,
            response:   ragResp?.response || '',
            confidence: ragResp?.confidence || 0,
            latency_ms: latency,
            grounding:  evalResult.grounding,
            hallucination: evalResult.hallucination,
            polarity_ok:   evalResult.polarity_ok,
            false_negative: evalResult.false_negative,
            reasoning:  evalResult.reasoning,
            timestamp:  new Date().toISOString(),
        };

        rawResults.push(record);
        logLines.push(JSON.stringify(record));

        // Acumular por categoría
        if (!byCategory[categoria]) {
            byCategory[categoria] = { total: 0, retrieval_ok: 0, grounding: 0, hallucinations: 0, false_negatives: 0, latency_sum: 0 };
        }
        const cat = byCategory[categoria];
        cat.total++;
        if (retrievalCheck.correct) cat.retrieval_ok++;
        cat.grounding     += evalResult.grounding;
        cat.hallucinations+= evalResult.hallucination;
        if (evalResult.false_negative) cat.false_negatives++;
        cat.latency_sum   += latency;
    }

    // ─── Métricas Globales ───────────────────────────────────────────────────
    const N = rawResults.length || 1;
    const globalMetrics = {
        retrieval_accuracy: +(rawResults.filter(r => r.retrieval_correct).length / N * 100).toFixed(2),
        grounding_accuracy: +(rawResults.reduce((s, r) => s + r.grounding, 0) / N * 100).toFixed(2),
        hallucination_rate: +(rawResults.reduce((s, r) => s + r.hallucination, 0) / N * 100).toFixed(2),
        false_negative_rate: +(rawResults.filter(r => r.false_negative).length / N * 100).toFixed(2),
        avg_latency_ms: +(rawResults.reduce((s, r) => s + r.latency_ms, 0) / N).toFixed(0),
    };
    globalMetrics.enterprise_score = +(
        (globalMetrics.retrieval_accuracy * 0.30) +
        (globalMetrics.grounding_accuracy * 0.40) +
        ((100 - globalMetrics.hallucination_rate) * 0.20) +
        ((100 - globalMetrics.false_negative_rate) * 0.10)
    ).toFixed(2);

    // ─── Imprimir resultados ─────────────────────────────────────────────────
    console.log("\n" + "=".repeat(70));
    console.log("🏁 RESULTADOS FINALES — FASE 2.3");
    console.log("=".repeat(70));
    const printMetric = (label, val, target, unit = '%') => {
        const ok = unit === '%' ? val >= target : val <= target;
        const icon = ok ? '✅' : '❌';
        console.log(`   ${icon} ${label.padEnd(28)} ${String(val).padStart(7)}${unit}   (objetivo: ${target}${unit})`);
    };
    printMetric("Retrieval Accuracy",    globalMetrics.retrieval_accuracy,  TARGETS.retrieval_accuracy);
    printMetric("Grounding Accuracy",    globalMetrics.grounding_accuracy,  TARGETS.grounding_accuracy);
    printMetric("Hallucination Rate",    globalMetrics.hallucination_rate,  TARGETS.hallucination_rate);
    printMetric("False Negative Rate",   globalMetrics.false_negative_rate, TARGETS.false_negative_rate);
    printMetric("Avg Latency",           globalMetrics.avg_latency_ms,      TARGETS.avg_latency_ms, 'ms');
    printMetric("Enterprise Score",      globalMetrics.enterprise_score,    TARGETS.enterprise_score);

    // ─── Matriz de Debilidades ───────────────────────────────────────────────
    console.log("\n📊 MATRIZ DE DEBILIDADES POR CATEGORÍA:");
    console.log("-".repeat(70));
    const weaknessMatrix = {};
    for (const [cat, s] of Object.entries(byCategory)) {
        const retrieval  = +(s.retrieval_ok / s.total * 100).toFixed(1);
        const grounding  = +(s.grounding / s.total * 100).toFixed(1);
        const hallRate   = +(s.hallucinations / s.total * 100).toFixed(1);
        const fnRate     = +(s.false_negatives / s.total * 100).toFixed(1);
        const avgLat     = +(s.latency_sum / s.total).toFixed(0);
        const score      = +((retrieval * 0.30 + grounding * 0.40 + (100 - hallRate) * 0.20 + (100 - fnRate) * 0.10)).toFixed(1);
        weaknessMatrix[cat] = { retrieval, grounding, hallRate, fnRate, avgLat, score, total: s.total };
        const icon = score >= 85 ? '🟢' : score >= 70 ? '🟡' : '🔴';
        console.log(`   ${icon} ${cat.padEnd(20)} Score: ${String(score).padStart(5)}%  | Retrieval: ${retrieval}%  | Grounding: ${grounding}%  | Hall: ${hallRate}%  | n=${s.total}`);
    }

    // ─── Identificar Patrones ────────────────────────────────────────────────
    const weakCategories    = Object.entries(weaknessMatrix).filter(([, m]) => m.score < 70).map(([c]) => c);
    const strongCategories  = Object.entries(weaknessMatrix).filter(([, m]) => m.score >= 85).map(([c]) => c);
    const highHallucination = Object.entries(weaknessMatrix).filter(([, m]) => m.hallRate > 20).map(([c]) => c);
    const highFalseNeg      = Object.entries(weaknessMatrix).filter(([, m]) => m.fnRate > 10).map(([c]) => c);
    const slowCategories    = Object.entries(weaknessMatrix).filter(([, m]) => m.avgLat > 15000).map(([c]) => c);

    // ─── Guardar Archivos ────────────────────────────────────────────────────
    await fs.mkdir(REPORTS_DIR, { recursive: true });
    await fs.mkdir(LOGS_DIR, { recursive: true });

    // Raw JSON
    const rawJson = { run_date: new Date().toISOString(), total_questions: N, global_metrics: globalMetrics, by_category: weaknessMatrix, results: rawResults };
    await fs.writeFile(path.join(REPORTS_DIR, 'enterprise_benchmark_raw.json'), JSON.stringify(rawJson, null, 2));

    // JSONL Log
    await fs.writeFile(path.join(LOGS_DIR, 'enterprise_benchmark.jsonl'), logLines.join('\n'));

    // Markdown Report
    const md = buildMarkdownReport(globalMetrics, weaknessMatrix, { weakCategories, strongCategories, highHallucination, highFalseNeg, slowCategories }, rawResults, N);
    await fs.writeFile(path.join(REPORTS_DIR, 'enterprise_benchmark_real.md'), md);

    console.log("\n📁 ARCHIVOS GENERADOS:");
    console.log(`   - reports/enterprise_benchmark_real.md`);
    console.log(`   - reports/enterprise_benchmark_raw.json`);
    console.log(`   - logs/enterprise_benchmark.jsonl`);
}

function buildMarkdownReport(metrics, matrix, patterns, results, N) {
    const date = new Date().toISOString();
    const goal = (val, target, unit='%', invert=false) => {
        const ok = invert ? val <= target : val >= target;
        return `${val}${unit} ${ok ? '✅' : '❌'}`;
    };

    const rows = Object.entries(matrix).map(([cat, m]) => {
        const icon = m.score >= 85 ? '🟢' : m.score >= 70 ? '🟡' : '🔴';
        return `| ${icon} ${cat} | ${m.total} | ${m.retrieval}% | ${m.grounding}% | ${m.hallRate}% | ${m.fnRate}% | ${m.avgLat}ms | **${m.score}%** |`;
    }).join('\n');

    const falseNegsList = results.filter(r => r.false_negative).map(r => `- **${r.categoria}:** ${r.pregunta}`).join('\n') || '- Ninguno detectado ✅';
    const highHallList  = results.filter(r => r.hallucination).map(r => `- **${r.categoria}:** ${r.pregunta}`).join('\n') || '- Ninguna detectada ✅';

    return `# Enterprise Benchmark Real — Fase 2.3
> Fecha: ${date}
> Total preguntas evaluadas: ${N}

## Métricas Globales

| Métrica | Resultado | Objetivo | Estado |
|---------|-----------|----------|--------|
| Retrieval Accuracy | ${metrics.retrieval_accuracy}% | >90% | ${metrics.retrieval_accuracy >= 90 ? '✅' : '❌'} |
| Grounding Accuracy | ${metrics.grounding_accuracy}% | >90% | ${metrics.grounding_accuracy >= 90 ? '✅' : '❌'} |
| Hallucination Rate | ${metrics.hallucination_rate}% | <5% | ${metrics.hallucination_rate <= 5 ? '✅' : '❌'} |
| False Negative Rate | ${metrics.false_negative_rate}% | 0% | ${metrics.false_negative_rate === 0 ? '✅' : '❌'} |
| Avg Latency | ${metrics.avg_latency_ms}ms | <12000ms | ${metrics.avg_latency_ms <= 12000 ? '✅' : '❌'} |
| **Enterprise Score** | **${metrics.enterprise_score}%** | >85% | ${metrics.enterprise_score >= 85 ? '✅' : '❌'} |

## Matriz de Debilidades por Categoría

| Categoría | n | Retrieval | Grounding | Alucinaciones | FP Neg | Latencia | Score |
|-----------|---|-----------|-----------|---------------|--------|----------|-------|
${rows}

## Análisis de Patrones

### 🔴 Categorías Débiles (Score < 70%)
${patterns.weakCategories.length ? patterns.weakCategories.map(c => `- ${c}`).join('\n') : '- Ninguna ✅'}

### 🟢 Categorías Fuertes (Score ≥ 85%)
${patterns.strongCategories.length ? patterns.strongCategories.map(c => `- ${c}`).join('\n') : '- Ninguna aún'}

### ⚠️ Categorías con Alta Tasa de Alucinación (>20%)
${patterns.highHallucination.length ? patterns.highHallucination.map(c => `- ${c}`).join('\n') : '- Ninguna ✅'}

### ⚠️ Categorías con Falsos Negativos (>10%)
${patterns.highFalseNeg.length ? patterns.highFalseNeg.map(c => `- ${c}`).join('\n') : '- Ninguna ✅'}

### 🐢 Categorías con Latencia Alta (>15s)
${patterns.slowCategories.length ? patterns.slowCategories.map(c => `- ${c}`).join('\n') : '- Ninguna ✅'}

## Preguntas con Alucinaciones Detectadas
${highHallList}

## Preguntas con Falsos Negativos Detectados
${falseNegsList}

## Recomendaciones para Fase 2.4
${Object.entries({}).length === 0 ? generateRecommendations(patterns, metrics) : ''}
`;
}

function generateRecommendations(patterns, metrics) {
    const recs = [];
    if (patterns.weakCategories.length)    recs.push(`- **Optimización quirúrgica** en: ${patterns.weakCategories.join(', ')}.`);
    if (metrics.retrieval_accuracy < 90)   recs.push(`- Mejorar el Retrieval Accuracy global (actual: ${metrics.retrieval_accuracy}%).`);
    if (metrics.hallucination_rate > 5)    recs.push(`- Reducir la Hallucination Rate (actual: ${metrics.hallucination_rate}%).`);
    if (metrics.false_negative_rate > 0)   recs.push(`- Eliminar los Falsos Negativos residuales.`);
    if (metrics.avg_latency_ms > 12000)    recs.push(`- Optimizar la latencia promedio (actual: ${metrics.avg_latency_ms}ms).`);
    if (!recs.length) recs.push('- El sistema supera todos los objetivos. Considerar ampliar el dataset.');
    return recs.join('\n');
}

runBenchmark().catch(console.error);
