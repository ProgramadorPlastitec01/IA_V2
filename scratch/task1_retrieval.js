import fetch from 'node-fetch';
import fs from 'fs';

const QDRANT_URL = 'http://127.0.0.1:6333';
const OLLAMA_URL = 'http://127.0.0.1:11434';
const COLLECTION = 'plastitec_docs';

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

async function getEmbedding(text) {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'mxbai-embed-large', prompt: text })
    });
    const data = await res.json();
    return data.embedding;
}

async function searchQdrant(vector) {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            vector: vector,
            limit: 10,
            with_payload: true
        })
    });
    const data = await res.json();
    return data.result;
}

async function run() {
    let report = "# TAREA 1 — VALIDACIÓN DE RETRIEVAL PURO\n\n";
    report += "> *Extracción de Top 10 Chunks directamente desde Qdrant usando mxbai-embed-large (sin LLM ni Reranker Neural)*\n\n";

    for (let i = 0; i < queries.length; i++) {
        const query = queries[i];
        console.log(`Buscando: ${query}...`);
        try {
            const vector = await getEmbedding(query);
            const results = await searchQdrant(vector);

            report += `## Consulta: ${query}\n`;
            
            if (!results || results.length === 0) {
                report += `**Cero resultados recuperados.**\n\n---\n`;
                continue;
            }

            for (let j = 0; j < results.length; j++) {
                const r = results[j];
                report += `### Top ${j+1}\n`;
                report += `- **Documento origen:** ${r.payload.metadata?.source || r.payload.fuente || 'Desconocido'}\n`;
                report += `- **Score Vectorial:** ${r.score.toFixed(4)}\n`;
                report += `- **Score BM25:** N/A (Consulta puramente vectorial para esta prueba técnica)\n`;
                report += `- **Chunk recuperado:**\n`;
                report += `> ${r.payload.text?.replace(/\n/g, '\n> ') || r.payload.texto_original?.replace(/\n/g, '\n> ')}\n\n`;
            }
            report += `---\n`;
        } catch (e) {
            console.error(`Error procesando '${query}':`, e);
        }
    }

    fs.writeFileSync('C:/Users/Programador.ti1/.gemini/antigravity-ide/brain/314edafa-4c9a-4240-a911-ef504f6a6710/retrieval_validation_report.md', report);
    console.log("Reporte generado en retrieval_validation_report.md");
}

run();
