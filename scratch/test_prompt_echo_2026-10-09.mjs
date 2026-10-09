// removePromptEcho sobre las respuestas reales de la regresión SQLite.
import fs from 'fs';
const { default: v } = await import('../services/citationValidator.js');
const base = JSON.parse(fs.readFileSync('scratch/sqlite_regression_results_2026-10-09.json', 'utf8'));
let n = 0;
base.forEach((x, i) => {
    const body = String(x.response || '').split(/\n-{3,}\n/)[0];
    if (!/2101|42 horas/.test(body)) return;
    n++;
    const r = v.removePromptEcho(body, x.question, []);
    console.log(`[${i}] ${x.question.slice(0, 70)}\n   echoOnly=${r.echoOnly} → ${r.text.replace(/\s+/g, ' ').slice(0, 200)}`);
});
console.log(`\n${n} respuestas con la frase`);
// Casos sintéticos
for (const [q, a] of [
    ['¿Cuántas horas se trabaja a la semana?', 'Según el RIT, la jornada laboral semanal es de 42 horas, de acuerdo con la reducción establecida por la Ley 2101 de 2021.'],
    ['¿Cuántos días de permiso por luto tengo?', 'Según el Reglamento Interno de Trabajo de Plastitec, el permiso por luto es de 5 días hábiles, de acuerdo con la reducción establecida por la Ley 2101 de 2021, vigente a partir de 2026.'],
]) { const r = v.removePromptEcho(a, q, []); console.log(`SINT ${q} → echoOnly=${r.echoOnly} | ${r.text}`); }
