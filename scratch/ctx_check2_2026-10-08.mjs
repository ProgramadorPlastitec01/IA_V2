// Ronda 2: ¿los casos que empeoraron perdieron el dato en el contexto (retrieval) o es varianza del LLM?
// Uso: $env:QDRANT_COLLECTION='plastitec_docs_p0'; node scratch/ctx_check2_2026-10-08.mjs
const { default: llmService } = await import('../services/llmService.js');
let captured = null;
llmService.generateRAGResponse = async (q, ctx) => { captured = ctx; return { jsonFacts: { answer: 'STUB' }, citations: '' }; };
const { default: rag } = await import('../services/ragService.js');
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const CASES = [
  ['BLA-1', '¿Cuál es el procedimiento correcto para el ingreso a áreas blancas según el instructivo I-RH-011? Menciona al menos cinco pasos en el orden establecido.', ['linea amarilla', 'linea azul', 'lave y desinfecte', 'polainas']],
  ['GRI-5', '¿Qué se debe hacer al salir del área gris? Detalla los pasos de retiro, indicando qué elementos se retiran y en qué orden, y qué elemento no se debe retirar.', ['retire los guantes', 'no retirarse la cofia']],
  ['VIS-3', '¿Qué elementos de protección personal se deben colocar para ingresar al área y en qué orden? Menciona al menos cofia, protección auditiva, uniforme, polainas, guantes y escafandra.', ['proteccion auditiva', 'polainas', 'guantes sobre el uniforme']],
  ['USR-cel', 'puedo usar mi telefono celular?', ['celular']],
  ['BPM-2', '¿Cómo se clasifican las áreas según el nivel de contaminación? Menciona al menos dos ejemplos de cada tipo de área.', ['taller', 'embalaje', 'cabina ducto']],
  ['SLG-cucha', 'mi cucha está enferma, puedo faltar mañana?', ['calamidad']],
];
const orig = console.log;
for (const [id, q, needles] of CASES) {
  captured = null;
  const logs = [];
  console.log = (...a) => logs.push(a.join(' '));
  const r = await rag.processQuery(q);
  console.log = orig;
  const ctx = norm(captured);
  console.log(`${id}  conf=${Number(r.confidence).toFixed(2)}  [${needles.map(n => `${n}:${ctx.includes(norm(n)) ? 'SÍ' : 'NO'}`).join(' | ')}]`);
  console.log(`      fuentes: ${(r.retrievalLogs || []).map(d => `${d.source.slice(0, 12)}(${Number(d.score).toFixed(2)})`).join(', ') || '(ninguna)'}`);
  if (!captured) console.log('      gates: ' + logs.filter(l => /ConfidenceEngine|Guardrail|Jerga/.test(l)).join(' || '));
}
process.exit(0);
