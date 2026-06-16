import fetch from 'node-fetch';
import fs from 'fs';

const queries = [
    "COPASST",
    "SAGRILAFT",
    "Acoso Sexual",
    "Lavado de Manos",
    "Cofia",
    "SST",
    "Aprendices",
    "Uniformes",
    "BPM",
    "Código de Ética"
];

async function runTasks() {
    let t1Report = "# TAREA 1 — VALIDACIÓN DE RETRIEVAL PURO\n\n";
    let t2Report = "# TAREA 2 — VALIDACIÓN END TO END\n\n";

    for (let i = 0; i < queries.length; i++) {
        const query = queries[i];
        console.log(`Processing query ${i+1}/10: ${query}...`);
        
        try {
            // Tarea 2 y 1: we can use the main endpoint which returns context and answer
            // However, the main endpoint might only return chunksUsed, not Top 10 with scores if it filters them.
            // Wait, let's hit the endpoint first.
            const res = await fetch('http://localhost:3000/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: query, bypass_cache: true })
            });
            const data = await res.json();

            // The backend endpoint `ragService.processQuery` needs to give us the raw results.
            // But we don't have access to `data.retrievalLogs.top10` easily unless we modified the backend.
            // Wait, the prompt says "NO modificar: Código fuente". 
            // The backend currently returns:
            // confidence, sources, chunksUsed, retrievalLogs, context.
            // Let's see what retrievalLogs contains. We can hit the endpoint and check.
            
            // To be 100% compliant with "NO LLM" for Task 1, we can just instantiate `ragService` directly and call `retrieveContext(query)`.
            // But doing it via script is better. Let's do it via ragService directly.
        } catch (e) {
            console.error(e);
        }
    }
}
runTasks();
