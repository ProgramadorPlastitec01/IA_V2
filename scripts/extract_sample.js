/**
 * extract_sample.js
 * Fase 2.4.5 — Extracción de Muestra (10 registros)
 */

import { KnowledgeExtractionService } from '../services/knowledgeExtractionService.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(__dirname, '..', 'reports');
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION = 'plastitec_docs';

async function getSampleChunks() {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            limit: 20,
            with_payload: true,
            with_vector: false
        })
    });
    const data = await res.json();
    return data.result?.points || [];
}

async function main() {
    console.log('🚀 Iniciando Extracción de Muestra (10 registros)...');
    
    const chunks = await getSampleChunks();
    const extractor = new KnowledgeExtractionService();
    
    let extractedCount = 0;
    const finalSamples = [];

    for (const chunk of chunks) {
        if (extractedCount >= 10) break;
        
        const text = chunk.payload.texto_original || '';
        const source = chunk.payload.fuente || 'Desconocido';
        const section = chunk.payload.metadata?.section_title || chunk.payload.section_title || 'N/A';
        const category = chunk.payload.metadata?.category || chunk.payload.category || 'N/A';

        if (text.length < 150) continue;

        process.stdout.write(`Procesando chunk de ${source}... `);
        
        const extractedItems = await extractor.extractFromChunk(text);
        
        if (extractedItems.length > 0) {
            console.log(`✅ ${extractedItems.length} items extraídos`);
            
            for (const item of extractedItems) {
                if (extractedCount >= 10) break;
                
                finalSamples.push({
                    ...item,
                    fuente: source,
                    seccion: section,
                    categoria: category
                });
                extractedCount++;
            }
        } else {
            console.log(`⚠️ Nada extraído`);
        }
    }

    console.log(`\n🎉 Extracción finalizada. Total registros: ${finalSamples.length}\n`);
    
    let md = `# Muestra de Validación - Knowledge Extraction\n\n`;
    md += `A continuación se presentan ${finalSamples.length} registros extraídos por el LLM a partir de los documentos en Qdrant, asegurando la trazabilidad estricta.\n\n`;

    finalSamples.forEach((item, index) => {
        md += `## Registro ${index + 1} - [${item.type}]\n`;
        
        if (item.type === 'FAQ') {
            md += `**Pregunta:** ${item.pregunta}\n\n`;
            md += `**Respuesta:** ${item.respuesta}\n\n`;
        } else if (item.type === 'Procedimiento') {
            md += `**Proceso:** ${item.proceso}\n\n`;
            md += `**Pasos:**\n`;
            item.pasos.forEach((p, i) => md += `${i+1}. ${p}\n`);
            md += `\n`;
        } else if (item.type === 'Política') {
            md += `**Política:** ${item.politica}\n\n`;
            md += `**Descripción:** ${item.descripcion}\n\n`;
            md += `**Aplicabilidad:** ${item.aplicabilidad}\n\n`;
        } else if (item.type === 'Definición') {
            md += `**Concepto:** ${item.concepto}\n\n`;
            md += `**Definición:** ${item.definicion}\n\n`;
        } else if (item.type === 'Responsabilidad') {
            md += `**Rol:** ${item.rol}\n\n`;
            md += `**Responsabilidades:**\n`;
            item.responsabilidades.forEach(r => md += `- ${r}\n`);
            md += `\n`;
        } else if (item.type === 'Restricción') {
            md += `**Regla:** ${item.regla}\n\n`;
            md += `**Consecuencia:** ${item.consecuencia || 'No especificada'}\n\n`;
        }

        md += `> **Evidencia:** "${item.evidencia}"\n>\n`;
        md += `> **Fuente:** ${item.fuente} | **Sección:** ${item.seccion.replace(/###/g, '').trim()} | **Categoría:** ${item.categoria}\n\n`;
        md += `---\n\n`;
    });

    if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
    fs.writeFileSync(path.join(REPORTS_DIR, 'knowledge_sample.md'), md);
    console.log(`✅ Archivo de muestra guardado en reports/knowledge_sample.md`);
}

main().catch(console.error);
