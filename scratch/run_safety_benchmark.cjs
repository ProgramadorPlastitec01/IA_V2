const fs = require('fs');
const path = require('path');

const BENCHMARK_FILE = path.join(__dirname, 'benchmark_50.json');
const API_URL = 'http://localhost:3000/api/query';

// Umbrales o mensajes de rechazo esperados
const REJECT_MESSAGES = [
    "No encontré información sobre este tema en la documentación disponible.",
    "No se encontró información suficiente",
    "No se pudo extraer una respuesta clara."
];

async function runBenchmark() {
    console.log("🚀 Iniciando Regression & Safety Benchmark...");
    
    let tests = [];
    try {
        const data = fs.readFileSync(BENCHMARK_FILE, 'utf-8');
        tests = JSON.parse(data);
    } catch (e) {
        console.error("❌ Error leyendo benchmark_50.json:", e.message);
        return;
    }

    let stats = {
        total: tests.length,
        A_Total: 0, A_Success: 0, A_FalseNegative: 0,
        B_Total: 0, B_PartialMatch: 0, B_Reject: 0,
        C_Total: 0, C_SuccessReject: 0, C_Hallucination: 0
    };

    const results = [];

    for (let i = 0; i < tests.length; i++) {
        const test = tests[i];
        console.log(`\n========================================`);
        console.log(`[TEST ${i+1}/${tests.length}] Cat: ${test.category} | ${test.query}`);
        console.log(`========================================`);

        stats[`${test.category}_Total`]++;

        let startTime = Date.now();
        let apiResponse = null;

        try {
            const fetch = (await import('node-fetch')).default;
            const res = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: test.query, conversationId: 'bench-50' })
            });
            apiResponse = await res.json();
        } catch (e) {
            console.error("❌ Error en petición API:", e.message);
            continue;
        }

        const elapsed = Date.now() - startTime;
        const answer = apiResponse.response || "";
        const isRejected = REJECT_MESSAGES.some(msg => answer.includes(msg));
        const isPartialMatch = answer.toLowerCase().includes("no se menciona explícitamente") || 
                               answer.toLowerCase().includes("no está explícitamente") ||
                               answer.toLowerCase().includes("no hay información específica") ||
                               (!isRejected && apiResponse.confidence < 0.5 && apiResponse.confidence > 0);

        let resultStatus = "";

        if (test.category === 'A') {
            if (isRejected) {
                stats.A_FalseNegative++;
                resultStatus = "FALSE NEGATIVE";
            } else {
                stats.A_Success++;
                resultStatus = "SUCCESS";
            }
        } else if (test.category === 'B') {
            if (isRejected) {
                stats.B_Reject++;
                resultStatus = "REJECTED (Possible False Negative)";
            } else {
                stats.B_PartialMatch++;
                resultStatus = "PARTIAL_MATCH / ANSWERED";
            }
        } else if (test.category === 'C') {
            if (isRejected) {
                stats.C_SuccessReject++;
                resultStatus = "SUCCESS REJECT";
            } else {
                stats.C_Hallucination++;
                resultStatus = "HALLUCINATION";
            }
        }

        console.log(`Status: ${resultStatus} (${elapsed}ms)`);
        console.log(`Respuesta preview: ${answer.substring(0, 150)}...`);

        results.push({
            id: test.id,
            category: test.category,
            query: test.query,
            status: resultStatus,
            answer: answer,
            confidence: apiResponse.confidence || 0,
            elapsed
        });
    }

    console.log("\n========================================");
    console.log("📊 RESULTADOS FINALES DEL BENCHMARK");
    console.log("========================================");
    console.log(`Total Pruebas: ${stats.total}`);
    
    console.log(`\n🔹 CATEGORÍA A (Must Answer) - Total: ${stats.A_Total}`);
    console.log(`   ✅ Success (Respondido): ${stats.A_Success} (${((stats.A_Success/stats.A_Total)*100).toFixed(1)}%)`);
    console.log(`   ⚠️ False Negatives (Rechazado): ${stats.A_FalseNegative} (${((stats.A_FalseNegative/stats.A_Total)*100).toFixed(1)}%)`);

    console.log(`\n🔹 CATEGORÍA B (Partial Match) - Total: ${stats.B_Total}`);
    console.log(`   ✅ Partial Match / Answered: ${stats.B_PartialMatch} (${((stats.B_PartialMatch/stats.B_Total)*100).toFixed(1)}%)`);
    console.log(`   ⚠️ Rejected: ${stats.B_Reject} (${((stats.B_Reject/stats.B_Total)*100).toFixed(1)}%)`);

    console.log(`\n🔹 CATEGORÍA C (Must Reject) - Total: ${stats.C_Total}`);
    console.log(`   ✅ Success Reject: ${stats.C_SuccessReject} (${((stats.C_SuccessReject/stats.C_Total)*100).toFixed(1)}%)`);
    console.log(`   ❌ Hallucinations (Respondido erróneamente): ${stats.C_Hallucination} (${((stats.C_Hallucination/stats.C_Total)*100).toFixed(1)}%)`);

    fs.writeFileSync(path.join(__dirname, 'benchmark_50_strategy_A.json'), JSON.stringify({ stats, results }, null, 2));
    console.log("\n💾 Resultados guardados en scratch/benchmark_50_strategy_A.json");
}

runBenchmark();
