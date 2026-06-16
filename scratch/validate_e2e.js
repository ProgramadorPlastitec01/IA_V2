import fetch from 'node-fetch';
import fs from 'fs';

const queries = [
    "COPASST",
    "SAGRILAFT",
    "Acoso sexual laboral",
    "Salud Integral",
    "Lavado de manos",
    "Cofia",
    "Desinfección de uniforme",
    "Aprendiz fase práctica",
    "Apoyo de sostenimiento",
    "Responsabilidades SST"
];

async function run() {
    let md = "# Validación End-to-End (TAREA 6)\n\n";

    for (let i = 0; i < queries.length; i++) {
        const query = queries[i];
        console.log(`Query ${i+1}/10: ${query}...`);
        try {
            const res = await fetch('http://localhost:3000/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: query, bypass_cache: true })
            });
            const data = await res.json();
            
            md += `## Consulta ${i+1}: ${query}\n`;
            if (data.error) {
                md += `**Error de API**: ${data.error}\n\n`;
            }
            md += `### Contexto Recuperado (Chunks usados: ${data.chunksUsed || 'N/A'})\n`;
            if (data.sources && data.sources.length > 0) {
                 md += `Fuentes: ${data.sources.join(', ')}\n\n`;
            }
            if (data.context) {
                 md += `<details><summary>Ver contexto</summary>\n\n\`\`\`text\n${data.context}\n\`\`\`\n</details>\n\n`;
            }
            
            md += `### Respuesta Generada\n`;
            const respText = data.response || data.error || 'Sin respuesta';
            md += `> ${String(respText).replace(/\n/g, '\n> ')}\n\n`;
            
            md += `### Evaluación Manual\n`;
            md += `- **Clasificación:** [Pendiente revisar]\n`;
            md += `- **Comentarios:** \n\n`;
            md += `---\n`;
        } catch (e) {
            console.error(e);
            md += `Error procesando query: ${e.message}\n\n`;
        }
    }

    fs.writeFileSync('C:/Users/Programador.ti1/.gemini/antigravity-ide/brain/314edafa-4c9a-4240-a911-ef504f6a6710/reports/retrieval_validation_report.md', md);
    console.log("Reporte guardado en reports/retrieval_validation_report.md");
}

run();
