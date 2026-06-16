/**
 * extract_knowledge.js
 * Ejecuta la Extracción Masiva de Conocimiento con el Quality Gate.
 */

import { KnowledgeExtractionService } from '../services/knowledgeExtractionService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_DIR = path.join(__dirname, '..', 'knowledge');
const LOGS_DIR = path.join(__dirname, '..', 'logs');
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION = 'plastitec_docs';

const TARGET_DOCS = [
    { id: 'ETICA_RAG', query: 'I-RH-017-5' },
    { id: 'BPM_RAG', query: 'I-RH-003' },
    { id: 'SST_RAG', query: 'I-RH-004' },
    { id: 'RIT_RAG', query: 'RIT PLASTITEC' },
    // SAGRILAFT and SENA will be extracted from RIT and Etica mostly.
];

async function fetchChunksByDoc(query) {
    const points = [];
    let offset = null;
    while (true) {
        const body = {
            filter: {
                must: [{ key: 'fuente', match: { text: query } }]
            },
            limit: 100,
            with_payload: true,
            with_vector: false,
        };
        if (offset) body.offset = offset;

        const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const allRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ limit: 1000, with_payload: true, with_vector: false })
            });
            const allData = await allRes.json();
            return (allData.result?.points || []).filter(p => (p.payload?.fuente || '').includes(query));
        }

        const data = await res.json();
        points.push(...(data.result?.points || []));
        if (!data.result?.next_page_offset) break;
        offset = data.result.next_page_offset;
    }
    return points;
}

function writeMarkdown(filename, items) {
    if (items.length === 0) return;
    let md = `# Conocimiento Estructurado - ${filename.replace('_RAG', '')}\n\n`;

    items.forEach((item, index) => {
        md += `## Registro ${index + 1} - [${item.type}]\n`;
        if (item.type === 'FAQ') {
            md += `**Pregunta:** ${item.pregunta}\n\n**Respuesta:** ${item.respuesta}\n\n`;
        } else if (item.type === 'Procedimiento') {
            md += `**Proceso:** ${item.proceso}\n\n**Pasos:**\n`;
            item.pasos.forEach((p, i) => md += `${i + 1}. ${p}\n`);
            md += `\n`;
        } else if (item.type === 'Política') {
            md += `**Política:** ${item.politica}\n\n**Descripción:** ${item.descripcion}\n\n**Aplicabilidad:** ${item.aplicabilidad}\n\n`;
        } else if (item.type === 'Definición') {
            md += `**Concepto:** ${item.concepto}\n\n**Definición:** ${item.definicion}\n\n`;
        } else if (item.type === 'Responsabilidad') {
            md += `**Rol:** ${item.rol}\n\n**Responsabilidades:**\n`;
            item.responsabilidades.forEach(r => md += `- ${r}\n`);
            md += `\n`;
        } else if (item.type === 'Restricción') {
            md += `**Regla:** ${item.regla}\n\n**Consecuencia:** ${item.consecuencia || 'N/A'}\n\n`;
        }
        md += `> **Evidencia:** "${item.evidencia}"\n>\n`;
        md += `> **Fuente:** ${item.fuente} | **Sección:** ${item.seccion.replace(/###/g, '').trim()} | **Categoría:** ${item.categoria}\n\n---\n\n`;
    });

    if (!fs.existsSync(KNOWLEDGE_DIR)) fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });
    fs.writeFileSync(path.join(KNOWLEDGE_DIR, `${filename}.md`), md);
}

async function main() {
    console.log('🚀 Iniciando Extracción Masiva (Quality Gate Activado)...');
    if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
    const discardLogStream = fs.createWriteStream(path.join(LOGS_DIR, 'extraction_discard_log.jsonl'), { flags: 'a' });

    const extractor = new KnowledgeExtractionService();
    const globalMetrics = { totalExtracted: 0, totalValid: 0, totalDiscarded: 0 };

    for (const doc of TARGET_DOCS) {
        console.log(`\n📄 Procesando: ${doc.id}`);
        const chunks = await fetchChunksByDoc(doc.query);
        console.log(`Chunks a evaluar: ${chunks.length}`);

        let validItems = [];
        let docExtracted = 0;
        let docDiscarded = 0;

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const text = chunk.payload.texto_original || '';
            const source = chunk.payload.fuente || 'Desconocido';
            const section = chunk.payload.metadata?.section_title || chunk.payload.section_title || 'N/A';
            const category = chunk.payload.metadata?.category || chunk.payload.category || 'N/A';

            if (text.length < 150) continue; // Skip too small chunks

            process.stdout.write(`  [${i + 1}/${chunks.length}] Extracting... `);
            const { valid, discarded } = await extractor.extractFromChunk(text);

            docExtracted += (valid.length + discarded.length);
            docDiscarded += discarded.length;

            valid.forEach(v => validItems.push({ ...v, fuente: source, seccion: section, categoria: category }));

            discarded.forEach(d => {
                discardLogStream.write(JSON.stringify({ timestamp: new Date().toISOString(), doc: doc.id, reason: d.reason, item: d.item }) + '\n');
            });

            console.log(`(Válidos: ${valid.length} | Descartados: ${discarded.length})`);
        }

        // Specifically route to SAGRILAFT_RAG and SENA_RAG if keywords found
        const sagrilaftItems = validItems.filter(v => JSON.stringify(v).toLowerCase().includes('sagrilaft') || JSON.stringify(v).toLowerCase().includes('lavado'));
        const senaItems = validItems.filter(v => JSON.stringify(v).toLowerCase().includes('sena') || JSON.stringify(v).toLowerCase().includes('aprendiz'));

        // Remove them from main
        validItems = validItems.filter(v => !sagrilaftItems.includes(v) && !senaItems.includes(v));

        writeMarkdown(doc.id, validItems);
        if (sagrilaftItems.length > 0) writeMarkdown('SAGRILAFT_RAG', sagrilaftItems);
        if (senaItems.length > 0) writeMarkdown('SENA_RAG', senaItems);

        console.log(`\n📊 Métricas ${doc.id}:`);
        console.log(`   - Registros extraídos: ${docExtracted}`);
        console.log(`   - Registros válidos: ${validItems.length + sagrilaftItems.length + senaItems.length}`);
        console.log(`   - Registros descartados: ${docDiscarded}`);
        console.log(`   - % Aprovechamiento: ${docExtracted > 0 ? ((validItems.length + sagrilaftItems.length + senaItems.length) / docExtracted * 100).toFixed(1) : 0}%`);

        globalMetrics.totalExtracted += docExtracted;
        globalMetrics.totalValid += (validItems.length + sagrilaftItems.length + senaItems.length);
        globalMetrics.totalDiscarded += docDiscarded;
    }

    discardLogStream.end();
    console.log(`\n🎉 EXTRACCIÓN MASIVA FINALIZADA`);
    console.log(`Global: Extraídos=${globalMetrics.totalExtracted}, Válidos=${globalMetrics.totalValid}, Descartados=${globalMetrics.totalDiscarded}`);
}

main().catch(console.error);
