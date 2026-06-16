import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import answerJudge from './services/answerJudge.js';

const BACKEND_URL = 'http://localhost:3000/api/query';
const REPORTS_DIR = path.join(process.cwd(), 'reports');

const QUERIES = [
    { query: "¿Los visitantes pueden conservar ropa de calle debajo del overol?", intent: "Regla ropa de calle" },
    { query: "¿Los hombres pueden dejarse la barba y el bigote si tienen contacto con el producto?", intent: "Vello facial" },
    { query: "¿Cómo se deben lavar los uniformes?", intent: "Lavado uniformes" },
    { query: "¿Qué es el SAGRILAFT?", intent: "Definición SAGRILAFT" },
    { query: "¿Cuáles son los objetivos del SG-SST?", intent: "Objetivos SG-SST" },
    { query: "¿Está permitido el uso de maquillaje dentro de la planta?", intent: "Maquillaje" },
    { query: "¿Qué es el COPASST?", intent: "Definición COPASST" },
    { query: "¿Qué significa BPM en Plastitec? ¿Es Business Process Management?", intent: "Acrónimo BPM" },
    { query: "¿Cuánto tiempo debe durar el lavado de manos?", intent: "Tiempo lavado manos" },
    { query: "¿Cómo se termina el contrato de aprendiz SENA?", intent: "Contrato aprendiz" }
];

async function runBenchmark() {
    console.log("=============================================================");
    console.log("🚀 INICIANDO BENCHMARK EMPRESARIAL (FASE 2.2)");
    console.log("=============================================================\n");

    let totalRetrievalConf = 0;
    let totalGrounding = 0;
    let totalEvidence = 0;
    let totalPolarity = 0;
    let totalConsistency = 0;
    let totalScore = 0;
    let totalLatency = 0;

    const results = [];

    for (let i = 0; i < QUERIES.length; i++) {
        const q = QUERIES[i];
        console.log(`[${i+1}/${QUERIES.length}] Evaluando: ${q.query}`);

        const start = Date.now();
        let ragResp, evalResult;
        
        try {
            const res = await fetch(BACKEND_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: q.query, bypass_cache: true })
            });
            ragResp = await res.json();
            const latency = Date.now() - start;
            totalLatency += latency;

            console.log(`   ⏱️  Latencia: ${latency}ms | Confianza RAG: ${ragResp.confidence?.toFixed(2)}`);
            console.log(`   💬 Respuesta: "${(ragResp.response || '').replace(/\n/g, ' ').substring(0, 80)}..."`);

            const evidence = ragResp.context || "SIN CONTEXTO";

            evalResult = await answerJudge.evaluate(q.query, evidence, ragResp.response);

            console.log(`   ⚖️  Juez [Score: ${evalResult.score}] | Grounding: ${evalResult.grounding} | Polarity: ${evalResult.polarity} | Consistency: ${evalResult.consistency}`);
            console.log(`   📝 Justificación: ${evalResult.justification}\n`);

            totalRetrievalConf += ragResp.confidence || 0;
            totalGrounding += evalResult.grounding;
            totalEvidence += evalResult.evidence;
            totalPolarity += evalResult.polarity;
            totalConsistency += evalResult.consistency;
            totalScore += evalResult.score;

            results.push({
                query: q.query,
                latency,
                retrievalConfidence: ragResp.confidence,
                answer: ragResp.response,
                eval: evalResult
            });

        } catch (error) {
            console.error(`   ❌ Error en la consulta: ${error.message}\n`);
        }
    }

    const avgRetrievalConf = (totalRetrievalConf / QUERIES.length) * 100;
    const avgGrounding = (totalGrounding / QUERIES.length) * 100;
    const avgScore = totalScore / QUERIES.length;
    const hallucinationRate = 100 - avgGrounding;

    console.log("=============================================================");
    console.log("🏁 RESULTADOS FINALES BENCHMARK EMPRESARIAL");
    console.log("=============================================================");
    console.log(`Score Promedio (Juez):         ${avgScore.toFixed(2)}/100`);
    console.log(`Retrieval Confidence Promedio: ${avgRetrievalConf.toFixed(2)}%`);
    console.log(`Grounding Accuracy:            ${avgGrounding.toFixed(2)}%`);
    console.log(`Hallucination Rate:            ${hallucinationRate.toFixed(2)}%`);

    const reportContent = `
# Benchmark Empresarial LLM Reliability (Fase 2.2)
Fecha: ${new Date().toISOString()}

## Métricas Globales
- **Score Promedio (Juez):** ${avgScore.toFixed(2)}/100
- **Retrieval Confidence:** ${avgRetrievalConf.toFixed(2)}%
- **Grounding Accuracy:** ${avgGrounding.toFixed(2)}%
- **Hallucination Rate:** ${hallucinationRate.toFixed(2)}%
- **Latencia Promedio:** ${(totalLatency / QUERIES.length).toFixed(0)} ms

## Resultados Detallados
${results.map((r, i) => `
### ${i+1}. ${r.query}
- **Latencia:** ${r.latency}ms
- **Retrieval Conf:** ${r.retrievalConfidence?.toFixed(2)}
- **Respuesta:** ${r.answer}
- **Evaluación Juez:** Score ${r.eval.score} (G:${r.eval.grounding}, E:${r.eval.evidence}, P:${r.eval.polarity}, C:${r.eval.consistency})
- **Justificación:** ${r.eval.justification}
`).join('\n')}
    `;

    await fs.mkdir(REPORTS_DIR, { recursive: true });
    const reportPath = path.join(REPORTS_DIR, 'phase_2_2_llm_reliability.md');
    await fs.writeFile(reportPath, reportContent.trim(), 'utf8');
    console.log(`\n✅ Reporte final generado en: ${reportPath}`);
}

runBenchmark().catch(console.error);
