import ragService from '../services/ragService.js';

async function verifyNotebookLM() {
    const testQueries = [
        { q: "¿Cuál es la misión de Plastitec?", category: "CORPORATIVA" },
        { q: "¿Qué fabrica Plastitec?", category: "CORPORATIVA" },
        { q: "Dime 5 normas de seguridad industrial", category: "NORMATIVA" },
        { q: "¿Qué dice sobre el uso de EPP?", category: "NORMATIVA" },
        { q: "¿Cuántos días de vacaciones tengo según el reglamento?", category: "REGLAMENTO" },
        { q: "¿Qué es el BPM y cómo se aplica?", category: "PROCESOS" },
        { q: "¿Qué pasa si llego tarde al trabajo?", category: "REGLAMENTO" }
    ];

    console.log("=== 🧪 VERIFICACIÓN INTEGRAL: RAG NOTEBOOKLM-LIKE ===\n");

    for (const test of testQueries) {
        console.log(`\n🔍 PREGUNTA: "${test.q}"`);
        console.log(`🎯 CATEGORÍA ESPERADA: ${test.category}`);
        
        try {
            const start = Date.now();
            const result = await ragService.processQuery(test.q);
            const duration = (Date.now() - start) / 1000;

            console.log(`✅ RESPUESTA RECIBIDA (${duration}s):`);
            console.log(`--------------------------------------------------`);
            console.log(result.answer);
            console.log(`--------------------------------------------------`);
            
            const hasCitations = result.answer.toLowerCase().includes("fuentes consultadas");
            console.log(`📚 CITAS DETECTADAS: ${hasCitations ? 'SÍ ✅' : 'NO ❌'}`);
            console.log(`🧩 CHUNKS USADOS: ${result.chunksUsed}`);
            
            if (result.qdrantResults && result.qdrantResults.length > 0) {
                const topScore = result.qdrantResults[0].score;
                const topCategory = result.qdrantResults[0].payload?.metadata?.category;
                console.log(`📊 TOP SCORE: ${topScore.toFixed(4)} | METADATA CAT: ${topCategory}`);
            }

        } catch (error) {
            console.error(`❌ ERROR PROCESANDO: ${error.message}`);
        }
        console.log("\n" + "=".repeat(60));
    }
}

verifyNotebookLM().catch(console.error);
