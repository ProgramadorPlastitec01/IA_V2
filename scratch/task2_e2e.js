import fetch from 'node-fetch';
import fs from 'fs';

const queries = [
    "COPASST",
    "SAGRILAFT",
    "Acoso Sexual",
    "Lavado de Manos",
    "Cofia",
    "SST",
    "Aprendices",
    "Uniformes",
    "BPM",
    "Código de Ética"
];

async function run() {
    let report = "# TAREA 2 — VALIDACIÓN END TO END\n\n";

    for (let i = 0; i < queries.length; i++) {
        const query = queries[i];
        console.log(`Evaluando: ${query}...`);
        try {
            const res = await fetch('http://localhost:3000/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: query, bypass_cache: true })
            });
            const data = await res.json();

            report += `## Pregunta\n${query}\n\n`;
            
            report += `### Contexto Recuperado\n`;
            if (data.context) {
                report += `<details><summary>Ver Chunks Utilizados</summary>\n\n\`\`\`text\n${data.context}\n\`\`\`\n</details>\n\n`;
            } else {
                report += `No se recuperó contexto.\n\n`;
            }
            
            report += `### Respuesta del LLM\n`;
            const respText = data.response || data.error || 'Sin respuesta';
            report += `> ${String(respText).replace(/\n/g, '\n> ')}\n\n`;
            
            report += `### Evaluación\n`;
            report += `- **Clasificación:** [Pendiente revisar]\n`;
            report += `- **Motivo:** \n\n`;
            report += `---\n`;
        } catch (e) {
            console.error(`Error procesando '${query}':`, e);
        }
    }

    fs.writeFileSync('C:/Users/Programador.ti1/.gemini/antigravity-ide/brain/314edafa-4c9a-4240-a911-ef504f6a6710/e2e_validation_report.md', report);
    console.log("Reporte generado en e2e_validation_report.md");
}

run();
