// Distribución de clases: preguntas espontáneas vs. preguntas estilo examen (QA TI 23-24/09) y por tema.
import fs from 'fs';
const S = 'C:/AIV2/scratch/';
const R = JSON.parse(fs.readFileSync(S + 'sqlite_regression_results_2026-10-09.json', 'utf8'));
const E = new Map();
for (const f of fs.readdirSync(S).filter(f => /^sqlite_regression_evals_2026-10-09.*\.jsonl$/.test(f)))
  for (const l of fs.readFileSync(S + f, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) if (l.trim()) { const o = JSON.parse(l); E.set(o.i, o); }
const EXAM = new Set([131, 133, 134, 136, 137, 143, 144, 145, 147, 148, 150, 151, 152, 153, 155, 156, 157, 158, 161, 162, 163, 164, 165, ...Array.from({ length: 18 }, (_, k) => 170 + k)]);
const HORARIO = /horario|turno|jornada|horas por semana|sabado|sábado|diurna|trabaja los|festivo/i;
const groups = { examen: [], espontanea: [], horarios: [] };
R.forEach((r, i) => {
  const c = E.get(i).cls;
  (EXAM.has(r.ids[0]) ? groups.examen : groups.espontanea).push(c);
  if (HORARIO.test(r.question)) groups.horarios.push(c);
});
for (const [g, a] of Object.entries(groups)) {
  const cnt = a.reduce((m, c) => (m[c] = (m[c] || 0) + 1, m), {});
  console.log(g, a.length, JSON.stringify(cnt));
}
const top = R.map((r, i) => ({ i, u: r.usage, c: E.get(i).cls })).filter(x => x.u >= 2);
console.log('uso>=2', JSON.stringify(top));
const w = R.reduce((s, r, i) => s + r.usage * (E.get(i).cls === 'CORRECTA' || E.get(i).cls === 'NO RESPONDE CORRECTAMENTE' ? 1 : 0), 0);
console.log('ponderado por uso: aceptables', w, 'de', R.reduce((s, r) => s + r.usage, 0));
