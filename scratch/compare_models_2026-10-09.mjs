// Compara modelos de Ollama con el MISMO prompt de producción y el MISMO
// contexto que recibió el LLM en la regresión SQLite (no cambia la config).
// Uso: node scratch/compare_models_2026-10-09.mjs modelo1,modelo2 i1,i2,...
import fs from 'fs';
const [modelsArg = 'llama3.2,qwen2.5:7b', idxArg = ''] = process.argv.slice(2);
const models = modelsArg.split(',');
const idx = idxArg.split(',').map(Number);
const src = fs.readFileSync('services/llmService.js', 'utf8');
const i = src.indexOf('<|begin_of_text|>');
const j = src.indexOf('CONTEXTO DOCUMENTAL:', i);
const instructions = src.slice(i, j);
const base = JSON.parse(fs.readFileSync('scratch/sqlite_regression_results_2026-10-09.json', 'utf8'));
const outFile = 'scratch/compare_models_2026-10-09.json';
const out = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};

const resp = (s) => {
    const m = /<respuesta>([\s\S]*?)(<\/respuesta>|$)/.exec(s);
    return (m ? m[1] : s).trim();
};
for (const model of models) {
    for (const k of idx) {
        const key = `${model}|${k}`;
        if (out[key]) continue;
        const x = base[k];
        const prompt = `${instructions}CONTEXTO DOCUMENTAL:\n${x.context}\n\nPREGUNTA DEL EMPLEADO:\n"${x.question}"\n<|end|>\n\n<|assistant|>`;
        const t0 = Date.now();
        const r = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            body: JSON.stringify({ model, prompt, raw: true, stream: false, options: { num_ctx: 8192, num_predict: 700, temperature: 0.1 } }),
        }).then(y => y.json());
        out[key] = {
            model, i: k, question: x.question, answer: resp(r.response || r.error || ''),
            secs: (Date.now() - t0) / 1000,
            tokPerSec: r.eval_count && r.eval_duration ? r.eval_count / (r.eval_duration / 1e9) : null,
        };
        fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
        console.log(`[${model}] #${k} ${out[key].secs.toFixed(0)}s ${out[key].tokPerSec?.toFixed(1)} tok/s | ${x.question.slice(0, 50)}\n   ${out[key].answer.replace(/\s+/g, ' ').slice(0, 220)}`);
    }
}
