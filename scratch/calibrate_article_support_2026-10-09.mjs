// Calibra citationValidator._articleSupport sobre las 150 respuestas de la
// regresión SQLite (cada una trae el contexto exacto que recibió el LLM).
import fs from 'fs';
const { default: v } = await import('../services/citationValidator.js');
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const base = JSON.parse(fs.readFileSync('scratch/sqlite_regression_results_2026-10-09.json', 'utf8'));
const evals = new Map();
for (const f of fs.readdirSync('scratch').filter(f => f.startsWith('sqlite_regression_evals_2026-10-09') && f.endsWith('.jsonl'))) {
    for (const l of fs.readFileSync(`scratch/${f}`, 'utf8').split(/\r?\n/).filter(Boolean)) { const e = JSON.parse(l); evals.set(e.i, e); }
}
const rows = [];
base.forEach((x, i) => {
    if (!x.context || !x.response) return;
    const ctx = norm(x.context);
    const body = String(x.response).split(/\n-{3,}\n/)[0];
    for (const s of body.split(/(?<=[.!?])\s+|\n+/)) {
        for (const m of s.matchAll(/\b(art[ií]culos?|art\.)\s+(\d{1,3})\b/gi)) {
            const sup = v._articleSupport(m[2], s, ctx);
            rows.push({ i, num: m[2], sup, cls: evals.get(i)?.cls, note: evals.get(i)?.note?.slice(0, 140), s: s.slice(0, 160) });
        }
    }
});
rows.sort((a, b) => (a.sup ?? 2) - (b.sup ?? 2));
for (const r of rows) console.log(`${r.sup === null ? ' n/a' : r.sup.toFixed(2)} [${r.i}] art${r.num} ${r.cls}\n     R: ${r.s}\n     E: ${r.note}`);
