// Benchmark B5/B14/G8/C5: ¿cambió el contexto (retrieval) o es decisión/varianza del LLM?
const { default: llmService } = await import('../services/llmService.js');
let captured = null;
llmService.generateRAGResponse = async (q, ctx) => { captured = ctx; return { jsonFacts: { answer: 'STUB' }, citations: '' }; };
const { default: rag } = await import('../services/ragService.js');
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const CASES = [
  ['B5', '¿Cuál es la política de alcohol y drogas para los conductores de distribución?', ['alcohol', 'sustancias psicoactivas']],
  ['B14', '¿La empresa paga el plan telefónico para el teletrabajo?', ['teletrabaj', 'equipos']],
  ['G8', 'Reglas de higiene.', ['higiene', 'lavado', 'cofia']],
  ['C5', '¿Es posible realizar trabajo remoto permanente viviendo en Argentina?', ['remoto']],
];
const orig = console.log;
for (const [id, q, needles] of CASES) {
  captured = null; console.log = () => {};
  const r = await rag.processQuery(q);
  console.log = orig;
  const ctx = norm(captured);
  console.log(`${process.env.QDRANT_COLLECTION} ${id} conf=${Number(r.confidence).toFixed(2)} ctx=${captured ? captured.length : 0} [${needles.map(n => `${n}:${ctx.includes(n) ? 'SÍ' : 'NO'}`).join(' ')}] fuentes=${(r.retrievalLogs || []).map(d => d.source.slice(0, 10)).join(',')}`);
}
process.exit(0);
