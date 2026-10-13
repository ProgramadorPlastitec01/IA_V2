// Corre un banco de preguntas generado (scratch/gen_questions_2026-10-13.json)
// contra POST /api/query. Secuencial y reanudable (salta ids ya respondidos).
// Uso: node scratch/gen_run_2026-10-13.mjs <api> <preguntas.json> <out.json>
import fs from 'fs';

const [URL, QFILE, OUT] = process.argv.slice(2);
if (!URL || !QFILE || !OUT) { console.error('Uso: node gen_run_2026-10-13.mjs <api> <preguntas.json> <out.json>'); process.exit(1); }

const questions = JSON.parse(fs.readFileSync(QFILE, 'utf8'));
let results = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')).filter(r => !r.error) : [];
const done = new Set(results.map(r => r.id));
const sleep = ms => new Promise(r => setTimeout(r, ms));

for (const q of questions) {
    if (done.has(q.id)) continue;
    let attempt = 0, rec;
    while (true) {
        attempt++;
        const t0 = Date.now();
        try {
            const ctrl = new AbortController();
            const to = setTimeout(() => ctrl.abort(), 240000);
            const res = await fetch(URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json; charset=utf-8' },
                // conversationId distinto por pregunta: la UI es pregunta→respuesta, sin historial
                body: JSON.stringify({ query: q.question, conversationId: `gen-2026-10-13-${q.id}`, bypass_cache: true }),
                signal: ctrl.signal,
            });
            clearTimeout(to);
            const text = await res.text();
            if (res.status === 429 && attempt < 5) { console.log('429, esperando 5 min'); await sleep(300000); continue; }
            if (/problema interno/i.test(text) && attempt < 3) { console.log('problema interno, reintento en 60 s'); await sleep(60000); continue; }
            let body; try { body = JSON.parse(text); } catch { body = { raw: text }; }
            rec = { ...q, http: res.status, ms: Date.now() - t0, response: body.response ?? body.raw, confidence: body.confidence ?? null,
                category: body.category ?? null, outOfScope: body.outOfScope ?? null, rejected: body.rejected ?? null, reason: body.reason ?? null,
                securityBlocked: body.securityBlocked ?? null, sources: body.sources ?? null, context: body.context ?? null,
                error: res.status >= 500 ? (body.error || text) : null };
        } catch (e) {
            rec = { ...q, error: String(e), ms: Date.now() - t0 };
            if (attempt < 2) { await sleep(10000); continue; }
        }
        break;
    }
    results.push(rec);
    fs.writeFileSync(OUT, JSON.stringify(results, null, 2), 'utf8');
    console.log(`[${results.length}/${questions.length}] ${rec.ms}ms conf=${rec.confidence} ${rec.error ? 'ERR ' + rec.error : ''} | ${q.question.slice(0, 60)} => ${String(rec.response || '').slice(0, 90).replace(/\s+/g, ' ')}`);
}
console.log('FIN', results.length);
