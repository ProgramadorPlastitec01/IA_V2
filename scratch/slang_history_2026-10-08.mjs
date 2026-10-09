// ¿Qué preguntas reales del historial disparan reglas de jerga? (revisión manual de falsos positivos)
import fs from 'fs';
const { matchSlangRules } = await import('../config/slangRules.js');
const qs = [...new Set(fs.readFileSync('analytics.jsonl', 'utf8').split('\n')
  .map(l => { try { return JSON.parse(l).query; } catch { return null; } })
  .filter(q => typeof q === 'string').map(q => q.replace(/\s*\[?nocache[^\]\s]*\]?/i, '').trim()))];
const byRule = {};
for (const q of qs) for (const r of matchSlangRules(q).rules) (byRule[r] ||= []).push(q);
console.log(`Preguntas únicas: ${qs.length}`);
for (const [r, arr] of Object.entries(byRule)) {
  console.log(`\n== ${r} (${arr.length})`);
  arr.slice(0, 12).forEach(q => console.log('   ' + q.slice(0, 130)));
}
