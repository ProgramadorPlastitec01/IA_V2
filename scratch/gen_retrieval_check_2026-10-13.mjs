// ¿El fragmento esperado (needles) llegó al contexto que vio el LLM?
import fs from 'fs';
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[*_#|]/g, ' ').replace(/\s+/g, ' ');
const r = JSON.parse(fs.readFileSync('scratch/gen_results_2026-10-13.json', 'utf8'));
const out = [];
for (const x of r) {
    if (!x.debe_responder) continue;
    const c = norm(x.context);
    out.push({ id: x.id, hit: x.context ? x.needles.some(n => c.includes(norm(n))) : null });
}
console.log('debe_responder', out.length, '| needle en contexto', out.filter(o => o.hit).length, '| sin contexto', out.filter(o => o.hit === null).length);
console.log('miss:', out.filter(o => o.hit === false).map(o => o.id).join(' '));
console.log('sin contexto:', out.filter(o => o.hit === null).map(o => o.id).join(' '));
fs.writeFileSync('scratch/gen_retrieval_2026-10-13.json', JSON.stringify(out));
