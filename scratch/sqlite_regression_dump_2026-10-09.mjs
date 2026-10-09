// Vuelca resultados en texto legible para revisión manual, por lotes.
// Uso: node sqlite_regression_dump_2026-10-09.mjs <desde> <hasta>
import fs from 'fs';
const R = JSON.parse(fs.readFileSync('C:/AIV2/scratch/sqlite_regression_results_2026-10-09.json', 'utf8'));
const from = parseInt(process.argv[2] || '0', 10), to = parseInt(process.argv[3] || '9999', 10);
export const statusOf = r => {
  const t = (r.response || '').trim();
  if (r.error) return 'ERROR';
  if (r.securityBlocked) return 'PRIVACIDAD';
  if (r.reason === 'query_too_long') return 'LONGITUD';
  if (r.reason === 'injection_detected') return 'INYECCION';
  if (t.startsWith('No encontré información sobre este tema')) return 'NO_MATCH';
  if (t.startsWith('No se encontró información suficiente')) return 'INSUFFICIENT';
  if (t.startsWith('No entendí tu pregunta')) return 'NOT_UNDERSTOOD';
  if (t.startsWith('No encontré información sobre «') || /^No encontré información sobre/.test(t)) return 'PREMISA';
  return 'RESPUESTA';
};
const cut = (s, n) => (s || '').replace(/\s+/g, ' ').slice(0, n);
let out = '';
R.forEach((r, i) => {
  if (i < from || i >= to) return;
  out += `\n#${i} id=${r.ids.join(',')} u=${r.usage} | conf=${r.confidence?.toFixed?.(3)} (old ${r.old_confidence?.toFixed?.(3)}) | ${statusOf(r)} | src=${(r.sources || []).join(';')} | top=${(r.retrievalLogs || []).slice(0, 3).map(l => l.score?.toFixed(2)).join(',')}\nQ: ${r.question}\nNEW: ${cut(r.response, 1400)}\nOLD: ${cut(r.old_answer, 700)}\n`;
});
process.stdout.write(out);
