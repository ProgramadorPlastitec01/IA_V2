// ─────────────────────────────────────────────────────────────────────────────
// NOTA DE RE-ETIQUETADO (2026-06-12):
// Decisión de producto — las queries Cat-G vagas-pero-respondibles (G1, G3,
// G5-G10) dejaron de esperar rechazo. Llevan `expected_keywords` en
// benchmark_100.json: la respuesta cuenta como ACIERTO si contiene al menos
// 1 keyword esperada (case-insensitive); si responde sin ninguna keyword →
// HALLUCINATION (inventó contenido). G2 y G4 (sin referente de dominio)
// mantienen expectativa de rechazo. Cat-C intacta (fuera-de-corpus genuina).
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const os = require('os');

const modelName = process.argv[2] || 'unknown_model';
const BENCHMARK_FILE = path.join(__dirname, 'benchmark_100.json');
const RESULTS_FILE = path.join(__dirname, `../reports/benchmark_raw_results_${modelName.replace(/[:.]/g, '_')}.json`);
const API_URL = 'http://localhost:3000/api/query';

const REJECT_MESSAGES = [
    "No encontré información sobre este tema en la documentación disponible.",
    "No se encontró información suficiente",
    "No se pudo extraer una respuesta clara."
];

async function runBenchmark() {
    console.log(`🚀 Iniciando Benchmark de 100 preguntas para el modelo: ${modelName}`);
    
    let tests = [];
    try {
        const data = fs.readFileSync(BENCHMARK_FILE, 'utf-8');
        tests = JSON.parse(data);
    } catch (e) {
        console.error("❌ Error leyendo benchmark_100.json:", e.message);
        return;
    }

    let stats = {
        total: tests.length,
        Categories: {},
        AccuracyCount: 0,
        HallucinationCount: 0,
        FalseNegativeCount: 0,
        PartialMatchCount: 0,
        RejectAccuracyCount: 0,
        TotalLatency: 0
    };

    const results = [];

    for (let i = 0; i < tests.length; i++) {
        const test = tests[i];
        console.log(`\n========================================`);
        console.log(`[TEST ${i+1}/${tests.length}] Cat: ${test.category} | ${test.query}`);

        if (!stats.Categories[test.category]) {
            stats.Categories[test.category] = { Total: 0, Correct: 0, Failed: 0 };
        }
        stats.Categories[test.category].Total++;

        let startTime = Date.now();
        let apiResponse = null;

        try {
            const fetch = (await import('node-fetch')).default;
            const res = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: test.query, conversationId: `bench-${modelName}`, bypass_cache: true })
            });
            apiResponse = await res.json();
        } catch (e) {
            console.error("❌ Error en petición API:", e.message);
            continue;
        }

        const elapsed = Date.now() - startTime;
        stats.TotalLatency += elapsed;

        const answer = apiResponse.response || "";
        
        function classifyResponse(responseText, apiResponse) {
            const lowerAnswer = responseText.toLowerCase();
            const rejectMessages = [
                "no encontré información sobre este tema en la documentación disponible.",
                "no se encontró información suficiente",
                "no se pudo extraer una respuesta clara."
            ];

            // 1. Chequeo de Falso Negativo Real (Rechazo Total)
            const hasRejectPhrase = rejectMessages.some(msg => lowerAnswer.includes(msg.toLowerCase())) || 
                                    lowerAnswer.includes("no encontré información en la documentación disponible") ||
                                    (responseText.length < 80 && lowerAnswer.includes("no encontré"));
            
            if (hasRejectPhrase || apiResponse.outOfScope === true) {
                return "RECHAZADO_TOTAL";
            }

            // 2. Chequeo de Partial Match Respondido
            if (responseText.length >= 80 && lowerAnswer.includes("no encontré información sobre:")) {
                return "PARTIAL_MATCH";
            }

            // 3. Respuesta normal
            return "RESPONDIDO";
        }

        const responseType = classifyResponse(answer, apiResponse);
        let resultStatus = "";

        // Lógica de evaluación basada en categorías
        if (test.expected_keywords && test.expected_keywords.length > 0) {
            // Re-etiquetadas 2026-06-12: vagas-pero-respondibles (Cat-G G1,G3,G5-G10).
            // Debe responder Y el contenido debe anclar en las keywords esperadas.
            if (responseType === "RECHAZADO_TOTAL") {
                resultStatus = "FALSE NEGATIVE";
                stats.FalseNegativeCount++;
                stats.Categories[test.category].Failed++;
            } else {
                const lowerAnswer = answer.toLowerCase();
                const keywordHit = test.expected_keywords.some(k => lowerAnswer.includes(k.toLowerCase()));
                if (keywordHit) {
                    resultStatus = "SUCCESS (KEYWORD MATCH)";
                    stats.AccuracyCount++;
                    stats.Categories[test.category].Correct++;
                } else {
                    resultStatus = "HALLUCINATION / WRONG CONTENT";
                    stats.HallucinationCount++;
                    stats.Categories[test.category].Failed++;
                }
            }
        } else if (['A', 'D', 'E'].includes(test.category)) {
            // Debería responder correctamente
            if (responseType === "RECHAZADO_TOTAL") {
                resultStatus = "FALSE NEGATIVE";
                stats.FalseNegativeCount++;
                stats.Categories[test.category].Failed++;
            } else {
                resultStatus = "SUCCESS (FULL MATCH)";
                stats.AccuracyCount++;
                stats.Categories[test.category].Correct++;
            }
        } else if (['C', 'G'].includes(test.category)) {
            // Debería rechazar
            if (responseType === "RECHAZADO_TOTAL") {
                resultStatus = "SUCCESS REJECT";
                stats.RejectAccuracyCount++;
                stats.Categories[test.category].Correct++;
            } else {
                resultStatus = "HALLUCINATION / FALSE POSITIVE";
                stats.HallucinationCount++;
                stats.Categories[test.category].Failed++;
            }
        } else {
            // B, F, H, I: Pueden ser Partial Match o Success
            if (responseType === "RECHAZADO_TOTAL") {
                resultStatus = "REJECTED (Posible False Negative o Reject válido)";
                stats.Categories[test.category].Failed++; // Penalizamos rechazos ciegos aquí
            } else {
                // PARTIAL_MATCH o RESPONDIDO
                resultStatus = "PARTIAL_MATCH / ANSWERED";
                stats.PartialMatchCount++;
                stats.Categories[test.category].Correct++;
            }
        }

        console.log(`Status: ${resultStatus} (${elapsed}ms)`);
        console.log(`Preview: ${answer.substring(0, 100)}...`);

        results.push({
            id: test.id,
            category: test.category,
            query: test.query,
            status: resultStatus,
            latency: elapsed,
            response: answer
        });
    }

    // Calcular métricas
    // Post re-etiquetado 2026-06-12: las preguntas con expected_keywords cuentan
    // como válidas (deben responder); inválidas = Cat-C + Cat-G sin keywords (G2, G4).
    const relabeledCount = tests.filter(t => t.expected_keywords && t.expected_keywords.length > 0).length;
    const validQuestionsCount = (tests.filter(t => ['A', 'D', 'E'].includes(t.category)).length + relabeledCount) || 1;
    const invalidQuestionsCount = tests.filter(t =>
        ['C', 'G'].includes(t.category) && !(t.expected_keywords && t.expected_keywords.length > 0)
    ).length || 1;
    // HallucinationCount puede provenir de inválidas (respondió cuando no debía)
    // o de re-etiquetadas (respondió sin keywords esperadas) → denominador combinado.
    const hallucinationDenominator = (invalidQuestionsCount + relabeledCount) || 1;
    
    stats.Metrics = {
        AccuracyRate: (stats.AccuracyCount / validQuestionsCount) * 100,
        HallucinationRate: (stats.HallucinationCount / hallucinationDenominator) * 100,
        FalseNegativeRate: (stats.FalseNegativeCount / validQuestionsCount) * 100,
        AvgLatencyMs: stats.TotalLatency / tests.length,
        Model: modelName
    };

    console.log(`\n========================================`);
    console.log(`📊 RESULTADOS PARA ${modelName.toUpperCase()}`);
    console.log(`Accuracy: ${stats.Metrics.AccuracyRate.toFixed(2)}%`);
    console.log(`Hallucination: ${stats.Metrics.HallucinationRate.toFixed(2)}%`);
    console.log(`False Negatives: ${stats.Metrics.FalseNegativeRate.toFixed(2)}%`);
    console.log(`Partial Matches Respondidos: ${stats.PartialMatchCount}`);
    console.log(`Latencia Promedio: ${stats.Metrics.AvgLatencyMs.toFixed(0)}ms`);
    console.log(`========================================\n`);

    fs.writeFileSync(RESULTS_FILE, JSON.stringify({ stats, results }, null, 2));
    console.log(`Resultados guardados en: ${RESULTS_FILE}`);
}

runBenchmark();
