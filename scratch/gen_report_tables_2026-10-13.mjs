// Tablas para reports/pruebas_preguntas_generadas_2026-10-13.md
import fs from 'fs';
const r = JSON.parse(fs.readFileSync('scratch/gen_results_2026-10-13.json', 'utf8'));
const g = Object.fromEntries(JSON.parse(fs.readFileSync('scratch/gen_grades_2026-10-13.json', 'utf8')).map(x => [x.id, x]));
const ret = Object.fromEntries(JSON.parse(fs.readFileSync('scratch/gen_retrieval_2026-10-13.json', 'utf8')).map(x => [x.id, x.hit]));
const ESTILOS = ['formal', 'tercera_persona', 'primera_persona', 'coloquial_errores', 'sobre_alguien', 'indirecta', 'jerga', 'fuera_de_alcance', 'dato_inexistente'];
const L = [];
L.push('| Estilo | N | Correcto | Parcial | Incorrecto | No respondió | Rechazo correcto | Aciertos* |');
L.push('|---|---|---|---|---|---|---|---|');
for (const e of ESTILOS) {
    const xs = r.filter(x => x.estilo === e);
    const c = v => xs.filter(x => g[x.id].veredicto === v).length;
    const ok = c('CORRECTO') + c('RECHAZO_CORRECTO');
    L.push(`| ${e} | ${xs.length} | ${c('CORRECTO')} | ${c('PARCIAL')} | ${c('INCORRECTO')} | ${c('NO_RESPONDIO')} | ${c('RECHAZO_CORRECTO')} | ${Math.round(100 * ok / xs.length)}% |`);
}
const ms = r.map(x => x.ms).sort((a, b) => a - b);
L.push('', `Latencia: mediana ${(ms[ms.length >> 1] / 1000).toFixed(1)} s, p90 ${(ms[Math.floor(ms.length * .9)] / 1000).toFixed(1)} s, máx ${(ms.at(-1) / 1000).toFixed(1)} s`);
L.push('', '## Detalle');
L.push('| ID | Estilo | Pregunta | Veredicto | Fragmento correcto en contexto | Motivo |');
L.push('|---|---|---|---|---|---|');
const esc = s => String(s ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ');
for (const x of r) {
    const hit = !x.debe_responder ? '—' : ret[x.id] === null ? 'rechazada antes de buscar' : ret[x.id] ? 'sí' : 'no';
    L.push(`| ${x.id} | ${x.estilo} | ${esc(x.question)} | ${g[x.id].veredicto} | ${hit} | ${esc(g[x.id].motivo)} |`);
}
// cruce veredicto × recuperación (solo debe_responder)
const cross = {};
for (const x of r.filter(x => x.debe_responder)) {
    const k = ret[x.id] === null ? 'rechazada' : ret[x.id] ? 'si' : 'no';
    cross[k] ??= {}; cross[k][g[x.id].veredicto] = (cross[k][g[x.id].veredicto] || 0) + 1;
}
console.log(JSON.stringify(cross));
fs.writeFileSync('scratch/gen_report_tables_2026-10-13.md', L.join('\n'), 'utf8');
