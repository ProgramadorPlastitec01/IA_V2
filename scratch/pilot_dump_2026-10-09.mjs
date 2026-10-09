// Vuelca un piloto lado a lado con la corrida base (llama3.2, 2026-10-09) y su evaluación.
// Uso: node pilot_dump_2026-10-09.mjs <pilot.json> <desde> <hasta> [--ctx]
import fs from 'fs';
const S = 'C:/AIV2/scratch/';
const [pilotFile, a = '0', b = '9999', flag] = process.argv.slice(2);
const P = JSON.parse(fs.readFileSync(pilotFile, 'utf8'));
const B = JSON.parse(fs.readFileSync(S + 'sqlite_regression_results_2026-10-09.json', 'utf8'));
const E = new Map();
for (const f of fs.readdirSync(S).filter(f => /^sqlite_regression_evals_2026-10-09.*\.jsonl$/.test(f)))
  for (const l of fs.readFileSync(S + f, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) if (l.trim()) { const o = JSON.parse(l); E.set(o.i, o); }
const baseIdx = new Map(B.map((r, i) => [r.ids[0], i]));
const cut = (s, n) => (s || '').replace(/\s+/g, ' ').slice(0, n);
let out = '';
P.forEach((p, k) => {
  if (k < +a || k >= +b) return;
  const i = baseIdx.get(p.ids[0]); const e = E.get(i) || {};
  out += `\n#${i} (pilot k=${k}) id=${p.ids[0]} | conf=${typeof p.confidence === 'number' ? p.confidence.toFixed(3) : p.confidence} | ms=${p.ms} | src=${(p.sources || []).map(s => s.slice(0, 12)).join(';')}\nQ: ${p.question}\nPILOT: ${cut(p.response, 1500)}\nBASE[${e.cls}]: ${cut(e.note, 300)}\n`;
  if (flag === '--ctx') out += `CTX: ${cut(p.context, 2500)}\n`;
});
process.stdout.write(out);
