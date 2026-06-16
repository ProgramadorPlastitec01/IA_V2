// Diagnóstico de retrieval (2026-06-14) — SOLO LECTURA, sin cambios de producción.
// Re-ejecuta el retrieval real de las 7 queries que declinaron bajo ambos
// prompts y vuelca: contexto recuperado, fuentes y scores por chunk.
const fs = require('fs');
const path = require('path');

const API_URL = 'http://localhost:3000/api/query';
const QUERIES = [
    { id: 'A11', query: '¿Cómo funciona el procedimiento de quejas y reclamos?',  expected: 'RIT (Art. 90, 110-111)' },
    { id: 'A12', query: '¿Cómo es el proceso de ingreso a áreas blancas o grises?', expected: 'I-RH-009 / I-RH-011' },
    { id: 'D3',  query: 'Procedimiento para faltar por enfermedad.',                expected: 'RIT incapacidades' },
    { id: 'D4',  query: 'Protocolo de vestimenta en la planta.',                    expected: 'RIT / BPM / área docs' },
    { id: 'D5',  query: 'Reglamento para la higiene en empaque.',                   expected: 'I-RH-003 BPM' },
    { id: 'D6',  query: '¿Dónde queda la sala de primeros auxilios?',              expected: 'I-RH-004 (botiquines/enfermería)' },
    { id: 'G10', query: 'Contratos de trabajo.',                                    expected: 'RIT contratos' },
];

async function main() {
    const out = [];
    for (const q of QUERIES) {
        let data = null;
        try {
            const res = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: q.query, conversationId: 'diag', bypass_cache: true }),
            });
            data = await res.json();
        } catch (e) {
            console.log(`${q.id}: ERROR ${e.message}`);
            continue;
        }

        const logs = data.retrievalLogs || [];
        const ctxLen = (data.context || '').length;
        console.log(`\n=== ${q.id}: ${q.query}`);
        console.log(`    Esperado: ${q.expected} | confidence=${(data.confidence||0).toFixed(3)} | ctxLen=${ctxLen}`);
        console.log(`    Chunks recuperados (fuente | score):`);
        logs.forEach((l, i) => {
            console.log(`      ${i+1}. [${(l.score||0).toFixed(4)}] ${l.source}`);
        });
        // ¿El contexto contiene la respuesta? marcadores por query
        out.push({ id: q.id, query: q.query, expected: q.expected, confidence: data.confidence,
                   ctxLen, sources: logs.map(l => ({ source: l.source, score: l.score })),
                   context: data.context });
    }
    fs.writeFileSync(path.join(__dirname, '../reports/retrieval_diagnosis.json'), JSON.stringify(out, null, 2) + '\n');
    console.log('\nGuardado en reports/retrieval_diagnosis.json');
}
main();
