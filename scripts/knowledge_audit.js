/**
 * knowledge_audit.js
 * Fase 2.4.5.1 — Auditoría Documental para Extracción de Conocimiento
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(__dirname, '..', 'reports');
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION = 'plastitec_docs';

const TARGET_DOCS = [
    { id: 'ETICA', query: 'I-RH-017-5 CODIGO DE ETICA' },
    { id: 'BPM', query: 'I-RH-003' }, // BPMM
    { id: 'SST', query: 'I-RH-004' }, // Inducción SST
    { id: 'RIT', query: 'RIT PLASTITEC' }, // Reglamento
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
            // Fallback to substring matching if text match fails due to tokenizer
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

async function main() {
    console.log('🔍 Iniciando Auditoría Documental para Knowledge Extraction...');
    let reportMd = `# Auditoría Documental - Knowledge Extraction Layer\n\n`;
    reportMd += `Fecha: ${new Date().toISOString()}\n\n`;
    reportMd += `El objetivo de esta auditoría es identificar el potencial de extracción de conocimiento estructurado (FAQs, Políticas, Procedimientos, Definiciones, Responsabilidades, Restricciones) en los documentos principales.\n\n`;

    for (const doc of TARGET_DOCS) {
        console.log(`Auditando: ${doc.id} (${doc.query})`);
        const chunks = await fetchChunksByDoc(doc.query);
        console.log(`   - Encontrados: ${chunks.length} chunks`);
        
        if (chunks.length === 0) continue;

        const realName = chunks[0].payload.fuente;
        const category = chunks[0].payload.metadata?.category || chunks[0].payload.category || 'N/A';
        
        const sections = new Set();
        let totalChars = 0;
        
        chunks.forEach(c => {
            const sec = c.payload.metadata?.section_title || c.payload.section_title;
            if (sec) sections.add(sec.replace(/###/g, '').trim());
            totalChars += (c.payload.texto_original || '').length;
        });

        reportMd += `## Documento: ${realName}\n`;
        reportMd += `- **ID Interno**: ${doc.id}\n`;
        reportMd += `- **Categoría Original**: ${category}\n`;
        reportMd += `- **Volumen**: ${chunks.length} chunks (~${Math.round(totalChars/1024)} KB)\n`;
        reportMd += `- **Secciones Detectadas**: ${sections.size}\n\n`;
        
        reportMd += `### Potencial de Extracción:\n`;
        
        const secArray = Array.from(sections).filter(s => s.length > 3);
        
        // Reglas heurísticas simples para la auditoría
        const hasProcedures = secArray.some(s => s.toLowerCase().includes('procedimiento') || s.toLowerCase().includes('pasos') || s.toLowerCase().includes('uso') || s.toLowerCase().includes('ingreso'));
        const hasPolicies = secArray.some(s => s.toLowerCase().includes('política') || s.toLowerCase().includes('politica') || s.toLowerCase().includes('reglamento') || s.toLowerCase().includes('normas'));
        const hasResponsibilities = secArray.some(s => s.toLowerCase().includes('obligaciones') || s.toLowerCase().includes('responsabilidad') || s.toLowerCase().includes('funciones') || s.toLowerCase().includes('comité') || s.toLowerCase().includes('comite'));
        const hasRestrictions = secArray.some(s => s.toLowerCase().includes('prohibicion') || s.toLowerCase().includes('prohibiciones') || s.toLowerCase().includes('sanciones') || s.toLowerCase().includes('faltas'));
        const hasSagrilaft = secArray.some(s => s.toLowerCase().includes('sagrilaft') || s.toLowerCase().includes('lavado') || s.toLowerCase().includes('activos'));
        const hasDefinitions = secArray.some(s => s.toLowerCase().includes('definiciones') || s.toLowerCase().includes('glosario') || s.toLowerCase().includes('conceptos'));

        reportMd += `- **FAQs Potenciales**: Alta (Apto para derivar preguntas y respuestas a partir de políticas y normas)\n`;
        reportMd += `- **Procedimientos**: ${hasProcedures || doc.id==='BPM' ? 'Alta' : 'Media'}\n`;
        reportMd += `- **Políticas**: ${hasPolicies || doc.id==='RIT' ? 'Alta' : 'Media'}\n`;
        reportMd += `- **Definiciones**: ${hasDefinitions ? 'Alta' : 'Media'}\n`;
        reportMd += `- **Responsabilidades**: ${hasResponsibilities || doc.id==='SST' ? 'Alta' : 'Media'}\n`;
        reportMd += `- **Restricciones/Prohibiciones**: ${hasRestrictions || doc.id==='RIT' || doc.id==='ETICA' ? 'Alta' : 'Media'}\n`;
        reportMd += `- **SAGRILAFT**: ${hasSagrilaft || doc.id==='RIT' || doc.id==='ETICA' ? 'Presente' : 'No detectado'}\n\n`;

        reportMd += `### Muestra de Secciones:\n`;
        secArray.slice(0, 10).forEach(s => {
            reportMd += `- ${s}\n`;
        });
        reportMd += `\n---\n\n`;
    }

    if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
    fs.writeFileSync(path.join(REPORTS_DIR, 'knowledge_audit.md'), reportMd);
    console.log(`✅ Auditoría guardada en reports/knowledge_audit.md`);
}

main().catch(console.error);
