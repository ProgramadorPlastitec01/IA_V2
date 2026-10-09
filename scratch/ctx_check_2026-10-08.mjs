// Para cada caso: ¿el dato esperado llega al contexto del LLM? ¿qué fuentes entran?
// Uso: $env:QDRANT_COLLECTION='plastitec_docs_p0'; node scratch/ctx_check_2026-10-08.mjs
const { default: llmService } = await import('../services/llmService.js');
let captured = null;
llmService.generateRAGResponse = async (q, ctx) => { captured = ctx; return { jsonFacts: { answer: 'STUB' }, citations: '' }; };
const { default: rag } = await import('../services/ragService.js');
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const CASES = [
  ['LAV-1', '¿A quién aplica el instructivo de Lavado de Manos y con qué norma debe cumplirse adicionalmente?', ['todo el personal que labore e ingrese']],
  ['NEG-3', '¿Qué dotación se debe usar en el área negra y qué restricciones se establecen respecto a elementos diferentes a los entregados como dotación y a los elementos de protección personal?', ['overol', 'no utilice elementos diferentes']],
  ['NEG-4', '¿Qué prohibición se establece respecto al uso de la cofia en la calle?', ['en la calle no debe portar la cofia']],
  ['RIT-4', '¿Cuál es la duración de la licencia remunerada por paternidad según el reglamento y cuál es el único soporte válido para su otorgamiento?', ['dos (2) semanas', 'registro civil']],
  ['CON-2', '¿Qué certificaciones ha obtenido PLASTITEC, con qué normas y en qué años? Menciona también las entidades certificadoras.', ['icontec', 'bvqi', '13485']],
];
const orig = console.log;
for (const [id, q, needles] of CASES) {
  captured = null;
  console.log = () => {};
  const r = await rag.processQuery(q);
  console.log = orig;
  const ctx = norm(captured);
  const hits = needles.map(n => `${n}:${ctx.includes(norm(n)) ? 'SÍ' : 'NO'}`).join(' | ');
  console.log(`${id}  conf=${Number(r.confidence).toFixed(2)}  [${hits}]  ctx=${captured ? captured.length : 0} chars`);
  console.log(`      fuentes: ${(r.retrievalLogs || []).map(d => `${d.source.slice(0, 14)}(${Number(d.score).toFixed(2)})`).join(', ')}`);
}
process.exit(0);
