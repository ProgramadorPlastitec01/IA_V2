import fetch from 'node-fetch';

const queries = [
    "¿Cuál es la política de teletrabajo para el área comercial?",
    "¿Qué beneficios tienen los empleados en España?",
    "¿Cuál es el reglamento para uso de drones corporativos?",
    "¿Cómo debo lavarme las manos?"
];

async function runTests() {
    for (let i = 0; i < queries.length; i++) {
        const query = queries[i];
        console.log(`\n\n========================================`);
        console.log(`[TEST ${i+1}] ${query}`);
        console.log(`========================================`);
        
        try {
            const res = await fetch('http://localhost:3000/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: query, sessionId: "test-" + Math.random(), bypassCache: true })
            });
            const data = await res.json();
            console.log("Raw Data:", data);
            console.log(`Respuesta:\n${data.response || data.answer}`);
            console.log(`\nConfianza base: ${data.confidence}`);
            console.log(`Logs internos (Top 3):`);
            if (data.retrievalLogs) {
                data.retrievalLogs.slice(0,3).forEach(log => console.log(`- ${log.source} (${log.score.toFixed(4)})`));
            }
        } catch (err) {
            console.error(err);
        }
    }
}

runTests();
