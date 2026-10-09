// Calibración del citationValidator sobre las 160 respuestas reales de hr_cache.db.
// Reconstruye el contexto con el retrieval real (LLM stubbeado: no genera texto)
// y aplica el validador a la respuesta que se guardó en su momento.
// Uso: node scratch/calibrate_validator_2026-10-08.mjs
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs';

const { default: llmService } = await import('../services/llmService.js');
llmService.generateRAGResponse = async () => ({ jsonFacts: { answer: 'STUB' }, citations: '' });
const { default: ragService } = await import('../services/ragService.js');
const { default: validator } = await import('../services/citationValidator.js');
const { default: qu } = await import('../services/queryUnderstandingService.js');

// Silenciar el logging verboso del pipeline
const origLog = console.log;
const quiet = () => { console.log = () => {}; };
const loud = () => { console.log = origLog; };

const db = await open({ filename: 'hr_cache.db', driver: sqlite3.Database, mode: sqlite3.OPEN_READONLY });
const rows = await db.all('SELECT id, question_original AS q, answer AS a FROM knowledge_base ORDER BY id');

const results = [];
for (const r of rows) {
  quiet();
  let res;
  try { res = await ragService.processQuery(r.q); } catch (e) { res = { error: e.message }; }
  loud();
  if (!res.context) { results.push({ id: r.id, q: r.q, skipped: true }); continue; }
  const core = String(r.a).split(/\n\n---\n/)[0];
  const { normalizedQuery } = qu._normalizeSpelling(r.q.trim());
  const v = validator.validate(core, res.context, res.sources, normalizedQuery);
  results.push({ id: r.id, q: r.q, before: core, after: v.text, changes: v.changes, unsupported: v.unsupportedTerms });
  process.stdout.write('.');
}
fs.writeFileSync('scratch/calibrate_validator_2026-10-08.json', JSON.stringify(results, null, 1));

const done = results.filter(r => !r.skipped);
const art = done.filter(r => r.changes.some(c => c.type === 'article_citation'));
const files = done.filter(r => r.changes.some(c => c.type === 'file_name'));
const codes = done.filter(r => r.changes.some(c => c.type === 'document_code'));
const prem = done.filter(r => r.unsupported.length > 0);
console.log(`\n\nProcesadas: ${done.length}/${rows.length} (sin contexto: ${rows.length - done.length})`);
console.log(`Citas de artículo corregidas: ${art.length} | nombres de archivo: ${files.length} | códigos I-RH: ${codes.length} | premisa no respaldada: ${prem.length}`);

console.log('\n===== CITAS DE ARTÍCULO REEMPLAZADAS =====');
for (const r of art) {
  console.log(`\nP: ${r.q}`);
  r.changes.filter(c => c.type === 'article_citation').forEach(c => console.log(`   ✂ "${c.from}" → "${c.to}"`));
  console.log(`   ANTES:   ${r.before.replace(/\s+/g, ' ').slice(0, 170)}`);
  console.log(`   DESPUÉS: ${r.after.replace(/\s+/g, ' ').slice(0, 170)}`);
}
console.log('\n===== PREMISA NO RESPALDADA (términos de la pregunta que la respuesta repite y NO están en el contexto) =====');
for (const r of prem) {
  console.log(`\n[${r.unsupported.join(', ')}] P: ${r.q}`);
  console.log(`   R: ${r.before.replace(/\s+/g, ' ').slice(0, 200)}`);
}
console.log('\n===== CÓDIGOS / ARCHIVOS =====');
for (const r of [...files, ...codes]) r.changes.filter(c => c.type !== 'article_citation').forEach(c => console.log(`   ${c.type}: "${c.from}" → "${c.to}"  | P: ${r.q.slice(0, 70)}`));
process.exit(0);
