// Busca un patrón en el CONTEXTO que recibió el LLM en un piloto, para el índice base dado.
// Uso: node pilot_ctx_2026-10-09.mjs <pilot.json> <idxBase> "<regex>" [ventana]
import fs from 'fs';
const S = 'C:/AIV2/scratch/';
const [file, idx, pat, win = '160'] = process.argv.slice(2);
const P = JSON.parse(fs.readFileSync(file, 'utf8'));
const B = JSON.parse(fs.readFileSync(S + 'sqlite_regression_results_2026-10-09.json', 'utf8'));
const id0 = B[+idx].ids[0];
const p = P.find(r => r.ids[0] === id0);
const ctx = p.context || '';
const re = new RegExp(pat, 'gi');
let m, n = 0;
console.log(`#${idx} ctxLen=${ctx.length}`);
while ((m = re.exec(ctx)) && n < 5) { n++; const a = Math.max(0, m.index - +win), b = Math.min(ctx.length, m.index + +win); console.log(' …' + ctx.slice(a, b).replace(/\s+/g, ' ') + '…'); }
if (!n) console.log(' (sin coincidencias)');
