// Depuración de retrieval (sin LLM): muestra gates, confianza y chunks que entran al contexto.
// Uso: $env:QDRANT_COLLECTION='plastitec_docs_p0'; node scratch/debug_retrieval_p0_2026-10-08.mjs "pregunta"
const { default: llmService } = await import('../services/llmService.js');
let captured = null;
llmService.generateRAGResponse = async (q, ctx) => { captured = ctx; return { jsonFacts: { answer: 'STUB' }, citations: '' }; };
const { default: ragService } = await import('../services/ragService.js');
const { default: qu } = await import('../services/queryUnderstandingService.js');

const q = process.argv[2];
const logs = [];
const orig = console.log;
console.log = (...a) => logs.push(a.join(' '));
const r = await ragService.processQuery(q);
console.log = orig;

const { normalizedQuery } = qu._normalizeSpelling(q);
console.log('QUERY:', q);
console.log('expanded_terms:', JSON.stringify(qu.understand(q).expanded_terms));
console.log('hasHRDomainToken:', ragService._hasHRDomainToken(normalizedQuery), '| docPriority:', JSON.stringify(ragService._detectDocPriority(q)));
console.log(logs.filter(l => /ConfidenceEngine|Guardrail|SemanticSurvival/.test(l)).join('\n'));
console.log('answer:', r.answer?.slice(0, 120), '| conf:', r.confidence, '| chunks:', r.chunksUsed);
console.log('sources:', JSON.stringify(r.sources));
(r.retrievalLogs || []).forEach((d, i) => console.log(`  #${i} ${Number(d.score).toFixed(3)} ${d.searchType} ${d.source} ${d.boostReason || ''}`));
if (captured) console.log('\n--- CONTEXTO ---\n' + (process.env.FULLCTX ? captured : captured.slice(0, 1500)));
process.exit(0);
