import fs from 'fs/promises';
import path from 'path';
import ragService from './services/ragService.js';
import qdrantService from './services/qdrantService.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPORTS_DIR = path.join(__dirname, 'reports');

const QUERIES = [
    { name: "visitantes ropa de calle", query: "¿Los visitantes pueden conservar ropa de calle debajo del overol?" },
    { name: "vello facial hombres", query: "¿Los hombres pueden dejarse la barba y el bigote si tienen contacto con el producto?" },
    { name: "SAGRILAFT", query: "¿Qué es el SAGRILAFT?" },
    { name: "lavado uniformes", query: "¿Cómo se deben lavar los uniformes?" },
    { name: "objetivos SG-SST", query: "¿Cuáles son los objetivos del SG-SST?" },
    { name: "COPASST", query: "¿Qué es el COPASST?" },
    { name: "BPM oficina", query: "¿Qué significa BPM en Plastitec? ¿Es Business Process Management?" },
    { name: "maquillaje visitantes", query: "¿Está permitido el uso de maquillaje dentro de la planta?" },
    { name: "lavado de manos", query: "¿Cuánto tiempo debe durar el lavado de manos?" },
    { name: "contrato aprendizaje", query: "¿Cómo se termina el contrato de aprendiz SENA?" }
];

async function collectQdrantStats() {
    console.log("📊 Recolectando estadísticas de OCR y Chunking de Qdrant...");
    let allPoints = [];
    try {
        const response = await fetch(`${qdrantService.url}/collections/${qdrantService.collection}/points/scroll`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ limit: 1000, with_payload: true })
        });
        const result = await response.json();
        allPoints = result.result.points;
    } catch (e) {
        console.error("Error consultando Qdrant:", e);
        return {};
    }

    const docs = {};
    let totalChunks = 0;
    let chunksWithOcr = 0;
    let badChunks = 0;

    for (const point of allPoints) {
        const payload = point.payload || {};
        const source = payload.fuente || 'Unknown';
        const meta = payload.metadata || {};
        
        if (!docs[source]) docs[source] = { chunks: 0, ocr_chunks: 0, sum_quality: 0, chars: 0, sections: new Set(), methods: new Set() };
        
        docs[source].chunks++;
        totalChunks++;
        docs[source].chars += meta.char_count || 0;
        docs[source].sum_quality += meta.quality_score || 1.0;
        docs[source].methods.add(payload.extraction_strategy || 'UNKNOWN');
        if (meta.section_title) docs[source].sections.add(meta.section_title);
        
        if (meta.ocr_used) {
            docs[source].ocr_chunks++;
            chunksWithOcr++;
        }

        // Detectar chunks malos (cortados mal, listas rotas)
        const text = payload.texto_original || '';
        if (text.length < 100 || (text.match(/^[0-9]\./) && text.split('\n').length === 1)) {
            badChunks++;
        }
    }

    return { docs, totalChunks, chunksWithOcr, badChunks };
}

async function runAudit() {
    console.log("🚀 INICIANDO AUDITORÍA RAG FASE 1.3.1\n");
    await fs.mkdir(REPORTS_DIR, { recursive: true });

    let mdReport = `# Reporte de Auditoría RAG en Runtime (Fase 1.3.1)\n\n`;
    mdReport += `> Generado el: ${new Date().toISOString()}\n\n`;

    // 1. Estadísticas Qdrant (OCR y Chunking)
    const qStats = await collectQdrantStats();
    mdReport += `## 3. & 4. VALIDACIÓN OCR REAL Y CHUNKING\n\n`;
    mdReport += `Total Chunks: ${qStats.totalChunks} | OCR Chunks: ${qStats.chunksWithOcr} | Bad Chunks: ${qStats.badChunks}\n\n`;
    
    for (const [source, stat] of Object.entries(qStats.docs)) {
        if (!source.includes('.pdf') && !source.includes('.txt')) continue;
        const avgQuality = (stat.sum_quality / stat.chunks * 100).toFixed(1);
        mdReport += `### Documento: ${source}\n`;
        mdReport += `- **Chunks**: ${stat.chunks}\n`;
        mdReport += `- **OCR Usado**: ${stat.ocr_chunks > 0 ? 'Sí (' + stat.ocr_chunks + ' chunks)' : 'No'}\n`;
        mdReport += `- **Estrategia(s)**: ${Array.from(stat.methods).join(', ')}\n`;
        mdReport += `- **Calidad Promedio**: ${avgQuality}%\n`;
        mdReport += `- **Caracteres Extraídos**: ${stat.chars}\n`;
        mdReport += `- **Secciones Detectadas**: ${stat.sections.size}\n\n`;
    }

    // 2. Ejecutar Queries end-to-end
    mdReport += `## 1., 2. & 5. AUDITORÍA DE RETRIEVAL, GROUNDING Y RESPUESTAS\n\n`;

    let totalTimes = { embedding: 0, retrieval: 0, reranking: 0, llm: 0, total: 0 };

    for (let i = 0; i < QUERIES.length; i++) {
        const q = QUERIES[i];
        console.log(`[${i+1}/${QUERIES.length}] Procesando: ${q.name} ...`);
        
        try {
            const start = Date.now();
            const result = await ragService.processQuery(q.query);
            const duration = Date.now() - start;

            mdReport += `### Query: ${q.query}\n`;
            mdReport += `- **Respuesta Final:**\n  > ${result.answer.replace(/\n/g, '\n  > ')}\n\n`;
            mdReport += `- **Confianza:** ${(result.confidence * 100).toFixed(1)}%\n`;
            mdReport += `- **Fuentes:** ${result.sources.join(', ')}\n`;
            
            mdReport += `- **Métricas de Rendimiento:**\n`;
            mdReport += `  - Expansion: ${result.metrics?.expansion_ms || 0}ms\n`;
            mdReport += `  - Embedding: ${result.metrics?.embedding_ms || 0}ms\n`;
            mdReport += `  - Retrieval: ${result.metrics?.retrieval_ms || 0}ms\n`;
            mdReport += `  - Reranking: ${result.metrics?.rerank_ms || 0}ms\n`;
            mdReport += `  - Inferencia LLM: ${result.metrics?.llm_ms || 0}ms\n`;
            mdReport += `  - Total: ${duration}ms\n\n`;

            if (result.metrics) {
                totalTimes.embedding += result.metrics.embedding_ms || 0;
                totalTimes.retrieval += result.metrics.retrieval_ms || 0;
                totalTimes.reranking += result.metrics.rerank_ms || 0;
                totalTimes.llm += result.metrics.llm_ms || 0;
                totalTimes.total += duration;
            }

            // Top chunks utilizados
            mdReport += `- **Top Chunks Recuperados (Reranking):**\n`;
            if (result.retrievalLogs) {
                for (let j = 0; j < Math.min(3, result.retrievalLogs.length); j++) {
                    const log = result.retrievalLogs[j];
                    mdReport += `  ${j+1}. [Score: ${log.score.toFixed(4)}] - ${log.source} (${log.searchType})\n`;
                }
            } else {
                mdReport += `  (No logs available)\n`;
            }
            mdReport += `\n---\n\n`;

        } catch (e) {
            console.error(`Error en query ${q.name}:`, e);
            mdReport += `### Query: ${q.query}\n❌ ERROR: ${e.message}\n\n---\n\n`;
        }
    }

    // Análisis del QA Suite original
    mdReport += `## 6. DETECCIÓN DE FALSOS PASS EN TEST V5\n\n`;
    mdReport += `Analizando el script test_accuracy_v5.js:\n`;
    mdReport += `- **Mecanismo de PASS**: Valida "PASS" si (1) la respuesta NO contiene las frases de fallback (ej: "no encuentro") Y (2) la fuente esperada es citada.\n`;
    mdReport += `- **Problema**: NO valida la calidad semántica de la respuesta final. Si el bot dice "Sí, puedes conservar ropa" (Falso/Incorrecto) pero cita la fuente correcta, el test marca PASS. Esto es un falso positivo enorme para queries donde el contexto es confuso o la respuesta es una prohibición que el LLM invierte.\n\n`;

    // Resumen de Performance
    mdReport += `## 7. PERFORMANCE REAL PROMEDIO\n\n`;
    const N = QUERIES.length;
    mdReport += `- Embedding: ${(totalTimes.embedding/N).toFixed(0)} ms\n`;
    mdReport += `- Retrieval: ${(totalTimes.retrieval/N).toFixed(0)} ms\n`;
    mdReport += `- Reranking: ${(totalTimes.reranking/N).toFixed(0)} ms\n`;
    mdReport += `- LLM: ${(totalTimes.llm/N).toFixed(0)} ms\n`;
    mdReport += `- TOTAL PROMEDIO: ${(totalTimes.total/N).toFixed(0)} ms\n\n`;

    mdReport += `## 8. RECOMENDACIONES (Próximos Pasos)\n`;
    mdReport += `1. **Embeddings**: El modelo actual nomic-embed-text es rápido pero tiene problemas semánticos (ej: asociar lavar con ropa) en español.\n`;
    mdReport += `2. **Evaluación de Respuestas**: El QA suite debe usar LLM-as-a-judge para validar si la respuesta semánticamente aprueba, no solo si citó el documento correcto.\n`;
    mdReport += `3. **LLM**: El fallback Llama3.2 puede mejorar la precisión en tareas extractivas específicas donde Gemma alucina prohibiciones.\n`;

    const reportPath = path.join(REPORTS_DIR, 'runtime_audit_phase_1_3_1.md');
    await fs.writeFile(reportPath, mdReport, 'utf8');
    console.log(`\n✅ Reporte generado en: ${reportPath}`);
}

runAudit();
