// Compara un piloto evaluado contra la corrida base (llama3.2, 2026-10-09). Reutilizable.
// Uso: node pilot_compare_2026-10-09.mjs <etiqueta> <pilot.json> <prefijoEvals> <evalsSalida.jsonl> <narrativa.md> <reporteSalida.md>
//   prefijoEvals: archivos <prefijo>_b*.jsonl con {i, cls, note} (i = índice de la corrida base)
import fs from 'fs';
import path from 'path';
const S = 'C:/AIV2/scratch/';
const [label, pilotFile, evalPrefix, evalsOut, narrFile, reportOut] = process.argv.slice(2);
const CANON = { 'FALSO NEGATIVO': 'NO RESPONDE PERO DEBERÍA', 'INCORRECTA': 'INCORRECTA/ALUCINACIÓN' };
const canon = c => CANON[c] || c;
const CLASSES = ['CORRECTA', 'PARCIAL', 'INCORRECTA/ALUCINACIÓN', 'NO RESPONDE PERO DEBERÍA', 'NO RESPONDE CORRECTAMENTE', 'RECHAZO INDEBIDO'];
const SHORT = { 'CORRECTA': 'COR', 'PARCIAL': 'PAR', 'INCORRECTA/ALUCINACIÓN': 'INC', 'NO RESPONDE PERO DEBERÍA': 'FN', 'NO RESPONDE CORRECTAMENTE': 'NRC', 'RECHAZO INDEBIDO': 'RI' };
const readJsonl = f => fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim()).map(l => JSON.parse(l));

const B = JSON.parse(fs.readFileSync(S + 'sqlite_regression_results_2026-10-09.json', 'utf8'));
const BE = new Map();
for (const f of fs.readdirSync(S).filter(f => /^sqlite_regression_evals_2026-10-09.*\.jsonl$/.test(f))) for (const o of readJsonl(S + f)) BE.set(o.i, o);
const P = JSON.parse(fs.readFileSync(pilotFile, 'utf8'));
const pById = new Map(P.map(r => [r.ids[0], r]));
const dir = path.dirname(evalPrefix), base = path.basename(evalPrefix);
const PE = new Map();
for (const f of fs.readdirSync(dir).filter(f => f.startsWith(base + '_b') && f.endsWith('.jsonl'))) for (const o of readJsonl(path.join(dir, f))) PE.set(o.i, o);

const rows = B.map((b, i) => {
  const p = pById.get(b.ids[0]);
  const pe = PE.get(i), be = BE.get(i);
  if (!p || !pe) throw new Error(`Falta piloto o evaluación para i=${i} id=${b.ids[0]}`);
  return { i, id0: b.ids[0], q: b.question, usage: b.usage, b, p, bc: canon(be.cls), pc: canon(pe.cls), bnote: be.note, pnote: pe.note };
});
// evals unificadas
fs.writeFileSync(evalsOut, rows.map(r => JSON.stringify({ i: r.i, ids0: r.id0, cls: r.pc, note: r.pnote })).join('\n') + '\n', 'utf8');

const N = rows.length;
const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
const f3 = v => v == null ? '—' : v.toFixed(3);
const pct = n => (100 * n / N).toFixed(1) + ' %';
const confOf = r => typeof r.confidence === 'number' && r.confidence > 0 ? r.confidence : null;
const stats = (key, src) => Object.fromEntries(CLASSES.map(c => {
  const v = rows.filter(r => r[key] === c);
  return [c, { n: v.length, conf: mean(v.map(r => confOf(r[src])).filter(x => x != null)) }];
}));
const sb = stats('bc', 'b'), sp = stats('pc', 'p');
const msStats = arr => { const v = arr.filter(x => typeof x === 'number'); const s = [...v].sort((a, b) => a - b); return { mean: mean(v), p50: s[Math.floor(s.length / 2)], p90: s[Math.floor(s.length * 0.9)], max: Math.max(...v) }; };
const lb = msStats(rows.map(r => r.b.ms)), lp = msStats(rows.map(r => r.p.ms));
const acc = st => st['CORRECTA'].n + st['NO RESPONDE CORRECTAMENTE'].n;
// Señales automáticas sobre el texto del piloto
const T = r => (r.p.response || '').trim();
const head = t => t.split(/\n\n---\n/)[0].trim();
const isAbst = t => /^No se encontró información suficiente|^No encontré información/.test(t);
const abst = rows.filter(r => isAbst(T(r)));
const trunc = rows.filter(r => !isAbst(T(r)) && !r.p.securityBlocked && /(:|\*\*?|—|-|\d:|…)\s*$/.test(head(T(r))));
const fewshot = rows.filter(r => /vigente a partir de 2026|CAPÍTULO VII establece 42 horas/.test(T(r)));
const obsolete = rows.filter(r => /08:00 AM a 01:00 PM|07:00 AM a 01:00 PM|HORARIO UNO|HORARIO DOS|horario uno/i.test(T(r)));
const withSources = rows.filter(r => /📎|\*\*Fuente/.test(T(r))).length;
// Matriz de transición
const M = Object.fromEntries(CLASSES.map(a => [a, Object.fromEntries(CLASSES.map(b => [b, 0]))]));
for (const r of rows) M[r.bc][r.pc]++;
const rank = { 'CORRECTA': 3, 'NO RESPONDE CORRECTAMENTE': 3, 'PARCIAL': 2, 'NO RESPONDE PERO DEBERÍA': 1, 'RECHAZO INDEBIDO': 1, 'INCORRECTA/ALUCINACIÓN': 0 };
const better = rows.filter(r => rank[r.pc] > rank[r.bc]), worse = rows.filter(r => rank[r.pc] < rank[r.bc]);

let md = '';
md += `## Métricas por clase (${label} vs. base llama3.2 2026-10-09)\n\n`;
md += `| Clase | Base llama3.2 n (%) | Base conf. media | ${label} n (%) | ${label} conf. media | Δ n |\n|---|---|---|---|---|---|\n`;
for (const c of CLASSES) md += `| ${c} | ${sb[c].n} (${pct(sb[c].n)}) | ${f3(sb[c].conf)} | ${sp[c].n} (${pct(sp[c].n)}) | ${f3(sp[c].conf)} | ${sp[c].n - sb[c].n >= 0 ? '+' : ''}${sp[c].n - sb[c].n} |\n`;
md += `| **Aceptables** (CORRECTA + NO RESPONDE CORRECTAMENTE) | **${acc(sb)} (${pct(acc(sb))})** | | **${acc(sp)} (${pct(acc(sp))})** | | ${acc(sp) - acc(sb) >= 0 ? '+' : ''}${acc(sp) - acc(sb)} |\n`;
md += `| Errores con contenido falso (INCORRECTA) | ${sb['INCORRECTA/ALUCINACIÓN'].n} | | ${sp['INCORRECTA/ALUCINACIÓN'].n} | | |\n`;
md += `| No-respuestas evitables (FN + RECHAZO INDEBIDO) | ${sb['NO RESPONDE PERO DEBERÍA'].n + sb['RECHAZO INDEBIDO'].n} | | ${sp['NO RESPONDE PERO DEBERÍA'].n + sp['RECHAZO INDEBIDO'].n} | | |\n\n`;
md += `La confianza es la misma en ambas corridas por pregunta (se calcula en el retrieval, antes del LLM), así que las medias por clase solo reflejan qué preguntas cayeron en cada clase.\n\n`;
md += `## Latencia (campo \`ms\`)\n\n| Corrida | Media | Mediana | P90 | Máx. |\n|---|---|---|---|---|\n`;
md += `| Base llama3.2 | ${(lb.mean / 1000).toFixed(1)} s | ${(lb.p50 / 1000).toFixed(1)} s | ${(lb.p90 / 1000).toFixed(1)} s | ${(lb.max / 1000).toFixed(1)} s |\n`;
md += `| ${label} | ${(lp.mean / 1000).toFixed(1)} s | ${(lp.p50 / 1000).toFixed(1)} s | ${(lp.p90 / 1000).toFixed(1)} s | ${(lp.max / 1000).toFixed(1)} s |\n\n`;
md += `## Matriz de transición (filas = base llama3.2, columnas = ${label})\n\n| Base \\ ${label} | ${CLASSES.map(c => SHORT[c]).join(' | ')} | Total base |\n|---|${CLASSES.map(() => '---').join('|')}|---|\n`;
for (const a of CLASSES) md += `| **${SHORT[a]}** | ${CLASSES.map(b => M[a][b] ? (a === b ? `*${M[a][b]}*` : `**${M[a][b]}**`) : '·').join(' | ')} | ${sb[a].n} |\n`;
md += `| **Total ${label}** | ${CLASSES.map(c => sp[c].n).join(' | ')} | ${N} |\n\n`;
md += `Leyenda: COR = CORRECTA, PAR = PARCIAL, INC = INCORRECTA/ALUCINACIÓN, FN = NO RESPONDE PERO DEBERÍA, NRC = NO RESPONDE CORRECTAMENTE, RI = RECHAZO INDEBIDO.\n\n`;
md += `**Transiciones clave:** INC→COR ${M['INCORRECTA/ALUCINACIÓN']['CORRECTA']} · INC→NRC ${M['INCORRECTA/ALUCINACIÓN']['NO RESPONDE CORRECTAMENTE']} · INC→FN ${M['INCORRECTA/ALUCINACIÓN']['NO RESPONDE PERO DEBERÍA']} · PAR→COR ${M['PARCIAL']['CORRECTA']} · PAR→FN ${M['PARCIAL']['NO RESPONDE PERO DEBERÍA']} · COR→FN ${M['CORRECTA']['NO RESPONDE PERO DEBERÍA']} · COR→PAR ${M['CORRECTA']['PARCIAL']} · COR→INC ${M['CORRECTA']['INCORRECTA/ALUCINACIÓN']} · FN→COR ${M['NO RESPONDE PERO DEBERÍA']['CORRECTA']} · RI→COR/PAR ${M['RECHAZO INDEBIDO']['CORRECTA'] + M['RECHAZO INDEBIDO']['PARCIAL']}.\n`;
md += `Con un ranking simple (COR/NRC > PAR > FN/RI > INC): **${better.length} mejoran, ${worse.length} empeoran, ${N - better.length - worse.length} quedan igual**.\n\n`;
md += `## Señales automáticas sobre las respuestas de ${label}\n\n`;
md += `- Abstenciones ("No se encontró información suficiente…" / "No encontré…"): **${abst.length}** (base: ${rows.filter(r => /^No se encontró información suficiente|^No encontré información/.test((r.b.response || '').trim())).length}). Clasificación de esas abstenciones: ${Object.entries(abst.reduce((m, r) => (m[r.pc] = (m[r.pc] || 0) + 1, m), {})).map(([k, v]) => `${k} ${v}`).join(', ')}.\n`;
md += `- Respuestas que terminan cortadas (en ":" / "**" / "—" / "…"): ${trunc.length} → #${trunc.map(r => r.i).join(', #') || '—'}.\n`;
md += `- Eco del ejemplo few-shot (42 h / Ley 2101): ${fewshot.length}${fewshot.length ? ' → #' + fewshot.map(r => r.i).join(', #') : ''} (base: 10).\n`;
md += `- Horarios UNO/DOS derogados en la respuesta: ${obsolete.length} → #${obsolete.map(r => r.i).join(', #') || '—'}.\n`;
md += `- Respuestas con bloque de fuentes: ${withSources}/${N}.\n\n`;
const narr = fs.existsSync(narrFile) ? fs.readFileSync(narrFile, 'utf8') : '';
const tbl = rows.map(r => `| ${r.i} | ${r.id0} | ${r.q.replace(/\|/g, '\\|').slice(0, 90)}${r.q.length > 90 ? '…' : ''} | ${r.bc} | **${r.pc}** | ${rank[r.pc] > rank[r.bc] ? '↑' : rank[r.pc] < rank[r.bc] ? '↓' : '='} | ${r.pnote.replace(/\|/g, '\\|')} |`).join('\n');
const full = narr.replace('<!--METRICAS-->', md).replace('<!--TABLA-->', `| # | ID | Pregunta | Base llama3.2 | ${label} | Δ | Nota (${label}) |\n|---|---|---|---|---|---|---|\n${tbl}\n`);
fs.writeFileSync(reportOut, full || md, 'utf8');
console.log(md);
console.log('MEJORAN', better.map(r => `${r.i}:${SHORT[r.bc]}→${SHORT[r.pc]}`).join(' '));
console.log('EMPEORAN', worse.map(r => `${r.i}:${SHORT[r.bc]}→${SHORT[r.pc]}`).join(' '));
