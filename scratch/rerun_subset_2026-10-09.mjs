// Re-ejecuta un subconjunto de la regresión SQLite contra una instancia de
// prueba y compara con la corrida base (respuesta + evaluación manual).
// Uso: node scratch/rerun_subset_2026-10-09.mjs <api> <out.json> <i1,i2,...|controls:N>
import fs from 'fs';
const [api = 'http://localhost:3999/api/query', outFile = 'scratch/rerun_subset_2026-10-09.json', idxArg = ''] = process.argv.slice(2);
const base = JSON.parse(fs.readFileSync('scratch/sqlite_regression_results_2026-10-09.json', 'utf8'));
const evals = new Map();
for (const f of fs.readdirSync('scratch').filter(f => f.startsWith('sqlite_regression_evals_2026-10-09') && f.endsWith('.jsonl'))) {
    for (const l of fs.readFileSync(`scratch/${f}`, 'utf8').split(/\r?\n/).filter(Boolean)) {
        const e = JSON.parse(l); evals.set(e.i, e);
    }
}
let idx = idxArg.split(',').filter(Boolean).map(Number);
const ctl = /controls:(\d+)/.exec(idxArg);
if (ctl) idx = [...evals.values()].filter(e => e.cls === 'CORRECTA').map(e => e.i).slice(0, Number(ctl[1]));

const out = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};
for (const i of idx) {
    if (out[i]) continue;
    const q = base[i].question;
    const t0 = Date.now();
    const r = await fetch(api, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, conversationId: 'rerun-fixes-2026-10-09', bypass_cache: true }),
    }).then(x => x.json()).catch(e => ({ error: e.message }));
    out[i] = { question: q, before: base[i].response, beforeEval: evals.get(i), after: r.response ?? r.error, confidence: r.confidence, ms: Date.now() - t0 };
    fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
    const flags = [/2101/.test(out[i].after) && 'LEY2101', /\[[^\]]{3,}\]/.test(out[i].after) && 'CORCHETES', /No encontré información sobre «/.test(out[i].after) && 'PREMISA'].filter(Boolean);
    console.log(`\n■ [${i}] ${q}\n  ANTES (${evals.get(i)?.cls ?? '?'}): ${String(base[i].response).replace(/\s+/g, ' ').slice(0, 220)}\n  AHORA ${flags.join(',')}: ${String(out[i].after).replace(/\s+/g, ' ').slice(0, 400)}`);
}
