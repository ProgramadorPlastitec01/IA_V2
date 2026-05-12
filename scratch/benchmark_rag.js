import ragService from '../services/ragService.js';
import fs from 'fs';

const BENCHMARK_QUERIES = [
    // Corporativo
    { q: "¿Cuál es la misión de Plastitec?", cat: "CORPORATIVO" },
    { q: "¿Cuál es la visión?", cat: "CORPORATIVO" },
    { q: "¿Qué fabrica Plastitec?", cat: "CORPORATIVO" },
    { q: "¿Quiénes somos?", cat: "CORPORATIVO" },
    
    // Seguridad
    { q: "Dime 5 normas de seguridad", cat: "SEGURIDAD" },
    { q: "¿Qué dice sobre EPP?", cat: "SEGURIDAD" },
    { q: "Accidentes laborales", cat: "SEGURIDAD" },
    { q: "Uso de herramientas", cat: "SEGURIDAD" },
    
    // Reglamento
    { q: "Vacaciones", cat: "REGLAMENTO" },
    { q: "Permisos", cat: "REGLAMENTO" },
    { q: "Sanciones", cat: "REGLAMENTO" },
    { q: "Incapacidades", cat: "REGLAMENTO" },
    { q: "Horarios", cat: "REGLAMENTO" },
    
    // Procesos
    { q: "BPM", cat: "PROCESOS" },
    { q: "Calidad", cat: "PROCESOS" },
    { q: "Procedimientos", cat: "PROCESOS" },
    
    // Consultas Ambiguas
    { q: "Llegué tarde, ¿qué pasa?", cat: "AMBIGUO" },
    { q: "¿Puedo faltar mañana?", cat: "AMBIGUO" },
    { q: "¿Qué pasa si daño una máquina?", cat: "AMBIGUO" }
];

async function runBenchmark() {
    console.log("🚀 INICIANDO BENCHMARK RAG V2 (vs NotebookLM) 🚀\n");
    
    let results = [];
    let emptyResponses = 0;
    let hallucinations = 0; // Evaluado heurísticamente si no cita fuentes pero da respuestas definitivas
    
    for (const test of BENCHMARK_QUERIES) {
        console.log(`\n▶ Evaluando [${test.cat}]: "${test.q}"`);
        
        try {
            const start = Date.now();
            const res = await ragService.processQuery(test.q);
            const duration = ((Date.now() - start) / 1000).toFixed(2);
            
            const hasCitations = res.answer.toLowerCase().includes("fuentes consultadas");
            const isEmpty = res.answer.toLowerCase().includes("no encontré") || 
                            res.answer.toLowerCase().includes("no hay información") ||
                            res.answer.toLowerCase().includes("desafortunadamente");

            if (isEmpty) emptyResponses++;
            if (!hasCitations && !isEmpty) hallucinations++; // Una respuesta sin fuentes que no declare ignorancia es sospechosa de alucinación

            const topScore = res.qdrantResults && res.qdrantResults.length > 0 ? res.qdrantResults[0].score : 0;
            const topCategory = res.qdrantResults && res.qdrantResults.length > 0 ? res.qdrantResults[0].payload?.metadata?.category : 'N/A';

            console.log(`⏱  Tiempo: ${duration}s | 🧩 Chunks: ${res.chunksUsed} | 📊 Top Score: ${topScore.toFixed(4)} (${topCategory})`);
            console.log(`📚 Citas: ${hasCitations ? 'SÍ' : 'NO'} | 📭 Vacía: ${isEmpty ? 'SÍ' : 'NO'}`);
            
            // Preview de respuesta para log
            console.log(`💡 Extracto: ${res.answer.substring(0, 150).replace(/\n/g, ' ')}...`);

            results.push({
                query: test.q,
                category: test.cat,
                duration: parseFloat(duration),
                chunksUsed: res.chunksUsed,
                topScore: topScore,
                hasCitations,
                isEmpty,
                answerRaw: res.answer
            });

        } catch (error) {
            console.error(`❌ Error en query: ${error.message}`);
        }
    }
    
    console.log("\n===========================================");
    console.log("📊 RESUMEN FINAL DE BENCHMARK");
    console.log("===========================================");
    console.log(`Total Consultas: ${BENCHMARK_QUERIES.length}`);
    console.log(`Respuestas Vacías (Safe Rejects): ${emptyResponses}`);
    console.log(`Posibles Alucinaciones (Sin Cita): ${hallucinations}`);
    
    const avgTime = (results.reduce((acc, curr) => acc + curr.duration, 0) / results.length).toFixed(2);
    console.log(`Tiempo Promedio: ${avgTime}s`);
    
    fs.writeFileSync('scratch/benchmark_results.json', JSON.stringify(results, null, 2));
    console.log("✅ Resultados crudos guardados en scratch/benchmark_results.json");
}

runBenchmark().catch(console.error);
