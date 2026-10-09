// Repite preguntas N veces contra una API para medir variación del LLM.
// Uso: node scratch/repeat_q_2026-10-09.mjs <api> <veces> "pregunta 1" "pregunta 2" ...
const [api, times, ...qs] = process.argv.slice(2);
for (const q of qs) {
    for (let k = 0; k < Number(times); k++) {
        const r = await fetch(api, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: q, conversationId: 'repeat-2026-10-09', bypass_cache: true }),
        }).then(x => x.json()).catch(e => ({ response: `ERROR ${e.message}` }));
        console.log(`■ ${q.slice(0, 60)} #${k + 1}: ${String(r.response).split(/\n-{3,}\n/)[0].replace(/\s+/g, ' ').slice(0, 260)}`);
    }
}
