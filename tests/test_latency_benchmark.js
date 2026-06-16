/**
 * tests/test_latency_benchmark.js
 * Benchmark de Latencia — Fase 2.5.2
 *
 * Mide distribución estadística de latencia (P50/P90/P95/P99)
 * con y sin Cross-Encoder, usando el mismo enterprise_dataset.json.
 *
 * Parámetros de ejecución (variables de entorno):
 *   NEURAL_MODE=true|false   — controla si se usa CE en el servidor
 *   BENCHMARK_LABEL=...      — etiqueta para el reporte (ej: "CE-TopInput6")
 *
 * USO:
 *   Ejecutar 2 veces:
 *   1) Con el servidor en modo ENABLE_NEURAL_RERANKER=false (baseline)
 *   2) Con el servidor en modo ENABLE_NEURAL_RERANKER=true  (CE optimizado)
 */

import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import llmService from '../services/llmService.js';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_URL = 'http://localhost:3000/api/query';
const DATASET_FILE = path.join(__dirname, 'enterprise_dataset.json');
const REPORTS_DIR  = path.join(process.cwd(), 'reports');
const LOGS_DIR     = path.join(process.cwd(), 'logs');

const LABEL   = process.env.BENCHMARK_LABEL || 'sin-etiqueta';
const NEURAL  = process.env.NEURAL_MODE !== 'false';

// Líneas base Fase 2.5.1 (TopInput=8, sin warmup)
const FASE_251 = {
    enterprise_score:    91.60,
    grounding_accuracy:  94.67,
    retrieval_accuracy:  84.00,
    hallucination_rate:   5.33,
    false_negative_rate:  4.00,
    avg_latency_ms:      27671,
    p50_ms: null, p90_ms: null, p95_ms: null, p99_ms: null,
};

const BASELINE = {
    enterprise_score:    82.27,
    avg_latency_ms:      12400,
};

// ─── Percentil ────────────────────────────────────────────────────────────────
function percentile(arr, p) {
    const sorted = [...arr].sort((a, b) => a - b);
    const idx    = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
}

// ─── Juez LLM ─────────────────────────────────────────────────────────────────
async function judgeResponse(question, expectedAnswer, ragResponse, evidence) {
    const prompt = `<|start_header_id|>system<|end_header_id|>
Eres un evaluador de QA estricto para un sistema RAG corporativo.
Devuelve ÚNICAMENTE JSON válido, sin texto adicional:
{"grounding":1,"hallucination":0,"polarity_ok":true,"false_negative":false,"reasoning":"..."}
<|eot_id|><|start_header_id|>user<|end_header_id|>
PREGUNTA: "${question}"
RESPUESTA ESPERADA: "${expectedAnswer}"
RESPUESTA DEL ASISTENTE: "${ragResponse}"
EVIDENCIA: "${(evidence || '').substring(0, 600)}"
<|eot_id|><|start_header_id|>assistant<|end_header_id|>`;

    try {
        const raw   = await llmService.generateResponse(prompt);
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) {
            const parsed = JSON.parse(match[0]);
            return {
                grounding: typeof parsed.grounding === 'number' ? parsed.grounding : 0,
                hallucination: typeof parsed.hallucination === 'number' ? parsed.hallucination : 1,
                false_negative: !!parsed.false_negative,
                polarity_ok: !!parsed.polarity_ok
            };
        }
    } catch (_) {}
    return { grounding: 0, hallucination: 1, polarity_ok: false, false_negative: false };
}

function checkRetrieval(expectedSource, sources = []) {
    if (!expectedSource) return true;
    const exp = expectedSource.toLowerCase().replace(/\s+/g, ' ').trim();
    return sources.some(s =>
        s.toLowerCase().includes(exp.split(' ')[0]) ||
        exp.includes(s.toLowerCase().split(' ')[0])
    );
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function run() {
    console.log("=".repeat(72));
    console.log(`⏱  LATENCY BENCHMARK — Fase 2.5.2  [${LABEL}]`);
    console.log("=".repeat(72));
    console.log(`   Neural Mode: ${NEURAL ? 'ACTIVADO ✅' : 'DESACTIVADO (baseline)'}`);
    console.log(`   RAM antes: RSS=${Math.round(process.memoryUsage().rss/1024/1024)}MB\n`);

    const dataset = JSON.parse(await fs.readFile(DATASET_FILE, 'utf8'));
    console.log(`   📋 Dataset: ${dataset.length} preguntas\n`);

    const latencies   = [];
    const byCategory  = {};
    const rawResults  = [];
    let retrieval_ok  = 0, grounding_sum = 0, hall_sum = 0, fn_sum = 0;

    for (let i = 0; i < dataset.length; i++) {
        const item = dataset[i];
        const { categoria, pregunta, respuesta_esperada, expected_source } = item;

        process.stdout.write(`[${String(i+1).padStart(3)}/${dataset.length}] ${pregunta.substring(0, 60)}...\n`);

        const t0 = Date.now();
        let ragResp = null, evalResult = { grounding: 0, hallucination: 1, false_negative: false };
        let retOk = false, latency = 0;

        try {
            const res = await fetch(BACKEND_URL, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ query: pregunta, bypass_cache: true }),
            });
            ragResp  = await res.json();
            latency  = Date.now() - t0;

            const answer  = ragResp.response || ragResp.answer || '';
            const sources = ragResp.sources  || [];
            const context = ragResp.context  || '';

            retOk      = checkRetrieval(expected_source, sources);
            evalResult = await judgeResponse(pregunta, respuesta_esperada, answer, context);
        } catch (err) {
            latency = Date.now() - t0;
            process.stdout.write(`   ❌ Error: ${err.message}\n`);
        }

        latencies.push(latency);
        retrieval_ok  += retOk ? 1 : 0;
        grounding_sum += evalResult.grounding;
        hall_sum      += evalResult.hallucination;
        fn_sum        += evalResult.false_negative ? 1 : 0;

        if (!byCategory[categoria]) {
            byCategory[categoria] = { total: 0, latencies: [], retrieval_ok: 0, grounding: 0, hall: 0, fn: 0 };
        }
        const cat = byCategory[categoria];
        cat.total++;
        cat.latencies.push(latency);
        if (retOk)                   cat.retrieval_ok++;
        cat.grounding += evalResult.grounding;
        cat.hall      += evalResult.hallucination;
        if (evalResult.false_negative) cat.fn++;

        process.stdout.write(`   ⏱  ${latency}ms | Ret: ${retOk?'✅':'❌'} | Grd: ${evalResult.grounding} | Hall: ${evalResult.hallucination} | FN: ${evalResult.false_negative}\n`);
        rawResults.push({ ...item, latency_ms: latency, retrieval_correct: retOk, ...evalResult });
    }

    // ─── Estadísticas globales ───────────────────────────────────────────────
    const N = latencies.length || 1;
    const metrics = {
        retrieval_accuracy:  +(retrieval_ok / N * 100).toFixed(2),
        grounding_accuracy:  +(grounding_sum / N * 100).toFixed(2),
        hallucination_rate:  +(hall_sum / N * 100).toFixed(2),
        false_negative_rate: +(fn_sum / N * 100).toFixed(2),
        avg_latency_ms:      +(latencies.reduce((a,b)=>a+b,0)/N).toFixed(0),
        p50_ms:              percentile(latencies, 50),
        p90_ms:              percentile(latencies, 90),
        p95_ms:              percentile(latencies, 95),
        p99_ms:              percentile(latencies, 99),
        min_ms:              Math.min(...latencies),
        max_ms:              Math.max(...latencies),
    };
    metrics.enterprise_score = +((
        metrics.retrieval_accuracy   * 0.30 +
        metrics.grounding_accuracy   * 0.40 +
        (100 - metrics.hallucination_rate)  * 0.20 +
        (100 - metrics.false_negative_rate) * 0.10
    ).toFixed(2));

    const ramAfter   = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const ACCEPT_CRITERIA = {
        enterprise_score:    90,
        grounding_accuracy:  90,
        false_negative_rate:  5,
        hallucination_rate:   5,
        avg_latency_ms:      15000,
    };
    const allPass = metrics.enterprise_score >= ACCEPT_CRITERIA.enterprise_score
        && metrics.grounding_accuracy   >= ACCEPT_CRITERIA.grounding_accuracy
        && metrics.false_negative_rate  <= ACCEPT_CRITERIA.false_negative_rate
        && metrics.hallucination_rate   <= ACCEPT_CRITERIA.hallucination_rate
        && metrics.avg_latency_ms       <= ACCEPT_CRITERIA.avg_latency_ms;

    // ─── Print resultados ────────────────────────────────────────────────────
    console.log("\n" + "=".repeat(72));
    console.log(`🏁 RESULTADOS FINALES [${LABEL}]`);
    console.log("=".repeat(72));

    const row = (label, val, baseline, accept, unit='%', lower=false) => {
        const ok = lower ? val <= accept : val >= accept;
        const d  = val - baseline;
        const dir= d >= 0 ? '▲' : '▼';
        console.log(`   ${ok?'✅':'❌'} ${label.padEnd(28)} ${String(val).padStart(8)}${unit}  base=${baseline}${unit}  ${dir}${Math.abs(d).toFixed(0)}${unit}  (obj:${accept}${unit})`);
    };

    row('Enterprise Score',     metrics.enterprise_score,    BASELINE.enterprise_score,    ACCEPT_CRITERIA.enterprise_score);
    row('Grounding Accuracy',   metrics.grounding_accuracy,  82.67, ACCEPT_CRITERIA.grounding_accuracy);
    row('Hallucination Rate',   metrics.hallucination_rate,  12.00, ACCEPT_CRITERIA.hallucination_rate,  '%', true);
    row('False Negative Rate',  metrics.false_negative_rate, 22.67, ACCEPT_CRITERIA.false_negative_rate, '%', true);
    row('Latencia Media',       metrics.avg_latency_ms,      BASELINE.avg_latency_ms,      ACCEPT_CRITERIA.avg_latency_ms, 'ms', true);

    console.log("\n   📊 DISTRIBUCIÓN DE LATENCIA:");
    console.log(`   Min:  ${metrics.min_ms}ms`);
    console.log(`   P50:  ${metrics.p50_ms}ms`);
    console.log(`   P90:  ${metrics.p90_ms}ms`);
    console.log(`   P95:  ${metrics.p95_ms}ms`);
    console.log(`   P99:  ${metrics.p99_ms}ms`);
    console.log(`   Max:  ${metrics.max_ms}ms`);
    console.log(`   RAM:  ${ramAfter}MB RSS\n`);

    console.log("\n   📊 POR CATEGORÍA:");
    const catMatrix = {};
    for (const [cat, s] of Object.entries(byCategory)) {
        const r   = +(s.retrieval_ok / s.total * 100).toFixed(1);
        const g   = +(s.grounding    / s.total * 100).toFixed(1);
        const h   = +(s.hall         / s.total * 100).toFixed(1);
        const f   = +(s.fn           / s.total * 100).toFixed(1);
        const avg = +(s.latencies.reduce((a,b)=>a+b,0) / s.total).toFixed(0);
        const p90 = percentile(s.latencies, 90);
        const sc  = +(r*0.30 + g*0.40 + (100-h)*0.20 + (100-f)*0.10).toFixed(1);
        catMatrix[cat] = { retrieval: r, grounding: g, hallRate: h, fnRate: f, avgLat: avg, p90Lat: p90, score: sc, total: s.total };
        const icon = sc >= 90 ? '🟢' : sc >= 75 ? '🟡' : '🔴';
        console.log(`   ${icon} ${cat.padEnd(22)} Score:${String(sc).padStart(5)}%  Avg:${avg}ms  P90:${p90}ms  n=${s.total}`);
    }

    console.log(`\n   ${allPass ? '✅ CRITERIOS DE ACEPTACIÓN: TODOS CUMPLIDOS' : '❌ CRITERIOS DE ACEPTACIÓN: INCOMPLETOS'}`);

    // ─── Guardar archivos ────────────────────────────────────────────────────
    await fs.mkdir(REPORTS_DIR, { recursive: true });
    await fs.mkdir(LOGS_DIR,    { recursive: true });

    const reportFile = `latency_benchmark_${LABEL.replace(/[^a-z0-9]/gi, '_')}.md`;
    const md = buildMarkdown(LABEL, metrics, catMatrix, N, ramAfter, FASE_251, allPass, ACCEPT_CRITERIA);
    await fs.writeFile(path.join(REPORTS_DIR, reportFile), md);
    await fs.writeFile(
        path.join(LOGS_DIR, `latency_benchmark_${LABEL}.jsonl`),
        rawResults.map(r => JSON.stringify(r)).join('\n')
    );

    console.log(`\n📁 ARCHIVOS GENERADOS:`);
    console.log(`   - reports/${reportFile}`);
    console.log(`   - logs/latency_benchmark_${LABEL}.jsonl`);
    console.log(`\n   VEREDICTO: ${allPass ? '🚀 LISTO PARA ACTIVACIÓN EN PRODUCCIÓN' : '⚠️  REQUIERE MÁS OPTIMIZACIÓN'}`);
}

function buildMarkdown(label, m, catMatrix, N, ramMB, fase251, allPass, criteria) {
    const date = new Date().toISOString();
    const catRows = Object.entries(catMatrix).map(([cat, c]) => {
        const icon = c.score >= 90 ? '🟢' : c.score >= 75 ? '🟡' : '🔴';
        return `| ${icon} ${cat} | ${c.total} | ${c.retrieval}% | ${c.grounding}% | ${c.hallRate}% | ${c.fnRate}% | ${c.avgLat}ms | ${c.p90Lat}ms | **${c.score}%** |`;
    }).join('\n');

    const passFail = (val, ref, lower=false) => {
        const ok = lower ? val <= ref : val >= ref;
        const d = val - (fase251[Object.keys(fase251).find(k=>fase251[k]===val)] ?? 0);
        return ok ? '✅' : '❌';
    };

    return `# Latency Benchmark — Fase 2.5.2 [${label}]
> Fecha: ${date}
> Top-Input: ${process.env.NEURAL_TOP_INPUT || 6} | Top-Output: ${process.env.NEURAL_TOP_OUTPUT || 4}
> Total preguntas: ${N} | RAM: ${ramMB}MB RSS

## Métricas de Calidad

| Métrica | Baseline | Fase 2.5.1 | **${label}** | Objetivo | Estado |
|---------|----------|------------|-------------|----------|--------|
| Enterprise Score | 82.27% | 91.60% | **${m.enterprise_score}%** | ≥${criteria.enterprise_score}% | ${m.enterprise_score>=criteria.enterprise_score?'✅':'❌'} |
| Grounding Accuracy | 82.67% | 94.67% | **${m.grounding_accuracy}%** | ≥${criteria.grounding_accuracy}% | ${m.grounding_accuracy>=criteria.grounding_accuracy?'✅':'❌'} |
| Hallucination Rate | 12.00% | 5.33% | **${m.hallucination_rate}%** | ≤${criteria.hallucination_rate}% | ${m.hallucination_rate<=criteria.hallucination_rate?'✅':'❌'} |
| False Negative Rate | 22.67% | 4.00% | **${m.false_negative_rate}%** | ≤${criteria.false_negative_rate}% | ${m.false_negative_rate<=criteria.false_negative_rate?'✅':'❌'} |

## Distribución de Latencia

| Estadístico | Baseline | Fase 2.5.1 | **${label}** | Objetivo | Estado |
|-------------|----------|------------|-------------|----------|--------|
| Latencia Media | 12,400ms | 27,671ms | **${m.avg_latency_ms}ms** | ≤${criteria.avg_latency_ms}ms | ${m.avg_latency_ms<=criteria.avg_latency_ms?'✅':'❌'} |
| P50 | — | — | **${m.p50_ms}ms** | ≤15,000ms | ${m.p50_ms<=15000?'✅':'❌'} |
| P90 | — | — | **${m.p90_ms}ms** | ≤20,000ms | ${m.p90_ms<=20000?'✅':'❌'} |
| P95 | — | — | **${m.p95_ms}ms** | ≤25,000ms | ${m.p95_ms<=25000?'✅':'❌'} |
| P99 | — | — | **${m.p99_ms}ms** | — | — |
| Min | — | — | ${m.min_ms}ms | — | — |
| Max | — | — | ${m.max_ms}ms | — | — |

## Matriz por Categoría

| Categoría | n | Retrieval | Grounding | Hall | FN | Lat.Avg | Lat.P90 | Score |
|-----------|---|-----------|-----------|------|----|---------|---------|-------|
${catRows}

## Veredicto Final

${allPass
    ? `> [!IMPORTANT]\n> ✅ **TODOS LOS CRITERIOS DE ACEPTACIÓN CUMPLIDOS.**\n> El Cross-Encoder con configuración \`${label}\` está listo para **activación controlada en producción**.\n> Recomendación: Activar \`ENABLE_NEURAL_RERANKER=true\` en servidor de producción.`
    : `> [!WARNING]\n> ❌ **Criterios de aceptación NO completamente cumplidos.**\n> Se requiere optimización adicional antes de activar en producción.\n> Revisar los items marcados con ❌ en las tablas de arriba.`
}
`;
}

run().catch(console.error);
