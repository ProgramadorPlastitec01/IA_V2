// Une resultados + evaluaciones manuales, calcula métricas y genera la tabla por pregunta.
import fs from 'fs';
const S = 'C:/AIV2/scratch/';
const R = JSON.parse(fs.readFileSync(S + 'sqlite_regression_results_2026-10-09.json', 'utf8'));
const evalFiles = fs.readdirSync(S).filter(f => /^sqlite_regression_evals_2026-10-09.*\.jsonl$/.test(f));
const E = new Map();
for (const f of evalFiles) for (const line of fs.readFileSync(S + f, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
  if (!line.trim()) continue; const o = JSON.parse(line); E.set(o.i, o);
}
const statusOf = r => {
  const t = (r.response || '').trim();
  if (r.error) return 'ERROR';
  if (r.securityBlocked) return 'PRIVACIDAD';
  if (r.reason === 'query_too_long') return 'LONGITUD';
  if (r.reason === 'injection_detected') return 'INYECCION';
  if (t.startsWith('No encontré información sobre este tema')) return 'NO_MATCH';
  if (t.startsWith('No se encontró información suficiente')) return 'INSUFFICIENT';
  if (t.startsWith('No entendí tu pregunta')) return 'NOT_UNDERSTOOD';
  if (/^No encontré información sobre/.test(t)) return 'PREMISA';
  return 'RESPUESTA';
};
const missing = R.map((_, i) => i).filter(i => !E.has(i));
if (missing.length) console.log('SIN EVALUAR:', missing.join(','));
const rows = R.map((r, i) => ({ i, r, e: E.get(i) || {}, st: statusOf(r), conf: typeof r.confidence === 'number' ? r.confidence : null }));
const N = rows.length;
const by = k => rows.reduce((m, x) => { const v = k(x); (m[v] ||= []).push(x); return m; }, {});
const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
const f3 = v => v == null ? '—' : v.toFixed(3);
const pct = n => (100 * n / N).toFixed(1) + '%';
const out = {};
out.total = N;
out.status = Object.fromEntries(Object.entries(by(x => x.st)).map(([k, v]) => [k, v.length]));
const cls = by(x => x.e.cls);
out.clases = Object.fromEntries(Object.entries(cls).map(([k, v]) => {
  const cs = v.map(x => x.conf).filter(c => c != null && c > 0);
  return [k, { n: v.length, pct: pct(v.length), confMedia: f3(mean(cs)), confMin: f3(cs.length ? Math.min(...cs) : null), confMax: f3(cs.length ? Math.max(...cs) : null) }];
}));
out.cmp = Object.fromEntries(Object.entries(by(x => x.e.cmp)).map(([k, v]) => [k, v.length]));
// Confianza por tramo (solo respuestas con contenido)
const ans = rows.filter(x => x.st === 'RESPUESTA');
const bins = [[0, 0.3], [0.3, 0.4], [0.4, 0.5], [0.5, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 1.01]];
out.tramos = bins.map(([a, b]) => {
  const v = ans.filter(x => x.conf >= a && x.conf < b);
  const ok = v.filter(x => x.e.cls === 'CORRECTA').length;
  const bad = v.filter(x => ['INCORRECTA'].includes(x.e.cls)).length;
  const par = v.filter(x => x.e.cls === 'PARCIAL').length;
  return { tramo: `[${a.toFixed(1)}, ${Math.min(b, 1).toFixed(1)})`, n: v.length, correctas: ok, parciales: par, incorrectas: bad, pctCorrecta: v.length ? (100 * ok / v.length).toFixed(0) + '%' : '—', pctIncorrecta: v.length ? (100 * bad / v.length).toFixed(0) + '%' : '—' };
});
// Correlación punto-biserial conf vs (CORRECTA=1, INCORRECTA=0) y score ordinal
const score = c => ({ 'CORRECTA': 2, 'PARCIAL': 1, 'INCORRECTA': 0, 'FALSO NEGATIVO': 0 })[c];
const pairs = ans.filter(x => score(x.e.cls) != null).map(x => [x.conf, score(x.e.cls)]);
const corr = p => { const mx = mean(p.map(a => a[0])), my = mean(p.map(a => a[1])); let sxy = 0, sxx = 0, syy = 0; for (const [x, y] of p) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; } return sxy / Math.sqrt(sxx * syy); };
out.corrPearsonConfVsCalidad = corr(pairs).toFixed(3);
// Spearman
const rank = a => { const s = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = Array(a.length); let i = 0; while (i < s.length) { let j = i; while (j + 1 < s.length && s[j + 1][0] === s[i][0]) j++; for (let k = i; k <= j; k++) r[s[k][1]] = (i + j) / 2 + 1; i = j + 1; } return r; };
const rx = rank(pairs.map(p => p[0])), ry = rank(pairs.map(p => p[1]));
out.corrSpearman = corr(rx.map((v, i) => [v, ry[i]])).toFixed(3);
out.confMediaGlobalRespuestas = f3(mean(ans.map(x => x.conf)));
out.confMediaOld = f3(mean(rows.map(x => x.r.old_confidence).filter(v => v != null)));
out.deltaConfMedia = f3(mean(rows.filter(x => x.conf != null && x.r.old_confidence != null).map(x => x.conf - x.r.old_confidence)));
// Señales automáticas
const T = x => x.r.response || '';
out.fugaFewShot = rows.filter(x => /vigente a partir de 2026|CAPÍTULO VII establece 42 horas|restricción específica para 2026/.test(T(x))).map(x => x.i);
out.horarioObsoleto = rows.filter(x => /08:00 AM a 01:00 PM|07:00 AM a 01:00 PM|02:00 PM A 05:00 PM|hasta el 13 de julio de 2026/i.test(T(x))).map(x => x.i);
out.degeneracion = rows.filter(x => { const m = T(x).match(/No se menciona/g); return m && m.length >= 4; }).map(x => x.i);
out.sinCitasBloque = ans.filter(x => !/📎/.test(T(x))).length;
out.preguntasLargas = rows.filter(x => x.r.question.length >= 190).map(x => `${x.i}(${x.r.question.length})`);
out.ms = { media: Math.round(mean(rows.map(x => x.r.ms))), max: Math.max(...rows.map(x => x.r.ms)) };
// Tablas de "alta confianza pero mal" y "baja confianza pero bien"
out.altaConfMal = ans.filter(x => x.conf >= 0.6 && ['INCORRECTA', 'FALSO NEGATIVO'].includes(x.e.cls)).map(x => `${x.i}:${x.conf.toFixed(2)}`);
out.bajaConfBien = ans.filter(x => x.conf < 0.4 && x.e.cls === 'CORRECTA').map(x => `${x.i}:${x.conf.toFixed(2)}`);
out.causas = Object.fromEntries(Object.entries(by(x => x.e.cause || '(ninguna)')).map(([k, v]) => [k, v.length]).sort((a, b) => b[1] - a[1]));
fs.writeFileSync(S + 'sqlite_regression_metrics_2026-10-09.json', JSON.stringify(out, null, 2), 'utf8');
console.log(JSON.stringify(out, null, 2));
// Tabla markdown por pregunta
const esc = s => String(s || '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
let md = '| # | ID SQLite | Uso | Pregunta | Conf. nueva (antigua) | Estado | Clasificación | vs. caché | Nota |\n|---|---|---|---|---|---|---|---|---|\n';
for (const x of rows) {
  const q = x.r.question.length > 110 ? x.r.question.slice(0, 107) + '…' : x.r.question;
  md += `| ${x.i} | ${x.r.ids.join(',')} | ${x.r.usage} | ${esc(q)} | ${x.conf == null ? '—' : x.conf.toFixed(2)} (${x.r.old_confidence == null ? '—' : x.r.old_confidence.toFixed(2)}) | ${x.st} | **${x.e.cls || '?'}** | ${x.e.cmp || ''} | ${esc(x.e.note)} |\n`;
}
fs.writeFileSync(S + 'sqlite_regression_table_2026-10-09.md', md, 'utf8');
