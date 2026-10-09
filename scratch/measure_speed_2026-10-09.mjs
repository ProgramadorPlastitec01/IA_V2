// Mide carga, lectura del prompt y generación de un modelo con el prompt real.
// Uso: node scratch/measure_speed_2026-10-09.mjs <modelo> [veces]
import fs from 'fs';
const [model = 'qwen2.5:latest', times = '2'] = process.argv.slice(2);
const src = fs.readFileSync('services/llmService.js', 'utf8');
const i = src.indexOf('Eres el motor');
const sys = src.slice(i, src.indexOf('<|end|>', i));
const ctx = JSON.parse(fs.readFileSync('scratch/sqlite_regression_results_2026-10-09.json', 'utf8'))[1].context;
for (let k = 1; k <= Number(times); k++) {
    const r = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        body: JSON.stringify({
            model, stream: false,
            messages: [
                { role: 'system', content: sys },
                { role: 'user', content: `CONTEXTO DOCUMENTAL:\n${ctx}\n\nPREGUNTA DEL EMPLEADO:\n"¿Cuántos días de permiso por luto tengo?"` },
            ],
            options: { num_ctx: 8192, num_predict: 80, temperature: 0.1 },
        }),
    }).then(x => x.json());
    const s = (ns) => (ns / 1e9).toFixed(1);
    console.log(`${model} #${k}: carga ${s(r.load_duration)}s | prompt ${r.prompt_eval_count} tok en ${s(r.prompt_eval_duration)}s (${(r.prompt_eval_count / (r.prompt_eval_duration / 1e9)).toFixed(0)} tok/s) | generación ${s(r.eval_duration)}s | total ${s(r.total_duration)}s`);
}
