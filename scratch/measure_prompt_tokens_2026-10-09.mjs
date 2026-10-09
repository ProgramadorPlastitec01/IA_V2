// Mide cuántos tokens ocupa el prompt real de generateRAGResponse en llama3.2
// (prompt_eval_count con num_ctx amplio, num_predict 1). Solo lectura.
import fs from 'fs';
const src = fs.readFileSync('services/llmService.js', 'utf8');
const i = src.indexOf('<|begin_of_text|>');
const j = src.indexOf('CONTEXTO DOCUMENTAL:', i);
const instructions = src.slice(i, j);
const base = JSON.parse(fs.readFileSync('scratch/sqlite_regression_results_2026-10-09.json', 'utf8'));
const ctxs = base.filter(x => x.context).map(x => x.context).sort((a, b) => a.length - b.length);
const pick = { min: ctxs[0], mediana: ctxs[Math.floor(ctxs.length / 2)], max: ctxs[ctxs.length - 1] };
for (const [k, ctx] of Object.entries(pick)) {
    const prompt = `${instructions}CONTEXTO DOCUMENTAL:\n${ctx}\n\nPREGUNTA DEL EMPLEADO:\n"¿Cuántos días de vacaciones tengo?"\n<|end|>\n\n<|assistant|>`;
    const r = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        body: JSON.stringify({ model: 'llama3.2', prompt, raw: true, stream: false, options: { num_ctx: 8192, num_predict: 1 } }),
    }).then(x => x.json());
    console.log(`${k}: contexto ${ctx.length} chars → prompt_eval_count=${r.prompt_eval_count} tokens (+ hasta 600–800 de salida)`);
}
