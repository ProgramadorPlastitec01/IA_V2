// ¿Qué preguntas del benchmark_100 rechaza hoy el gate de "relevancia temática"
// (sin señal de vocabulario) y qué similitud tienen? Sirve para calibrar una
// excepción por similitud alta sin dejar pasar preguntas fuera de dominio.
// Uso: $env:QDRANT_COLLECTION='plastitec_docs_p0'; node scratch/gate_sim_2026-10-08.mjs
import fs from 'fs';
const { default: llmService } = await import('../services/llmService.js');
llmService.generateRAGResponse = async () => ({ jsonFacts: { answer: 'STUB' }, citations: '' });
const { default: ragService } = await import('../services/ragService.js');
const { default: qu } = await import('../services/queryUnderstandingService.js');
const { default: acr } = await import('../services/acronymResolver.js');

const bench = JSON.parse(fs.readFileSync('scratch/benchmark_100.json', 'utf8'));
const items = Array.isArray(bench) ? bench : (bench.questions || bench.items || Object.values(bench).flat());
const extra = [
  ['OOD', '¿Cuál es la capital de Francia?'], ['OOD', '¿Cuánto es 2+2?'], ['OOD', 'dame una receta de arepas'],
  ['OOD', '¿quién ganó el mundial de fútbol?'], ['OOD', '¿cómo arreglo mi carro?'], ['OOD', '¿Qué es la fotosíntesis?'],
  ['OOD', '¿Cuál es el mejor celular del mercado?'], ['OOD', '¿Cómo invierto en criptomonedas?'], ['OOD', 'cuéntame un chiste'],
  ['OOD', '¿Qué opinas del presidente?'], ['OOD', '¿Cómo hago un pastel de chocolate?'], ['OOD', '¿Qué hora es en Japón?'],
  ['IN', '¿Cómo se debe realizar una corrección en un registro según el documento? Detalla los pasos y qué hacer si hay más de una corrección.'],
  ['IN', '¿Qué significa el asterisco en una corrección?'],
];
const all = items.map(x => [x.id, x.query]).concat(extra);

const rows = [];
const orig = console.log;
for (const [id, q] of all) {
  const logs = [];
  console.log = (...a) => logs.push(a.join(' '));
  let r; try { r = await ragService.processQuery(q); } catch (e) { r = {}; }
  console.log = orig;
  const ce = logs.find(l => /ConfidenceEngine\] similarity/.test(l)) || '';
  const sim = parseFloat((ce.match(/similarity=([\d.]+)/) || [])[1] || 'NaN');
  const conf = parseFloat((ce.match(/finalConfidence=([\d.]+)/) || [])[1] || 'NaN');
  const { normalizedQuery } = qu._normalizeSpelling(q.trim());
  const topical = qu.understand(q).expanded_terms.length > 0 || acr.resolveAcronyms(q).length > 0
    || ragService._detectDocPriority(q).boost.length > 0 || ragService._hasHRDomainToken(normalizedQuery);
  rows.push({ id, q, sim, conf, topical });
}
console.log('\n=== Rechazadas por falta de señal temática (topical=false), ordenadas por similitud ===');
rows.filter(r => !r.topical).sort((a, b) => b.sim - a.sim)
  .forEach(r => console.log(`${r.sim.toFixed(3)}  conf=${r.conf.toFixed(3)}  ${String(r.id).padEnd(4)} ${r.q.slice(0, 100)}`));
console.log(`\nTotal: ${rows.length} | sin señal temática: ${rows.filter(r => !r.topical).length}`);
process.exit(0);
