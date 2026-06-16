/**
 * ingest_knowledge_base.js
 * Ingesta los archivos knowledge/*.md a la nueva colección `knowledge_base` en Qdrant.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import embeddingsService from '../services/embeddingsService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_DIR = path.join(__dirname, '..', 'knowledge');
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION = 'knowledge_base';

async function createCollection() {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            vectors: {
                size: 1024,
                distance: "Cosine"
            }
        })
    });
    if (res.ok) {
        console.log(`✅ Colección ${COLLECTION} creada.`);
    } else {
        const text = await res.text();
        if (text.includes('already exists')) {
            console.log(`⚠️ Colección ${COLLECTION} ya existía.`);
        } else {
            console.error(`❌ Error al crear colección:`, text);
        }
    }
}

async function parseMarkdownToPoints(filepath, filename) {
    const content = fs.readFileSync(filepath, 'utf-8');
    const records = content.split('\n---\n').map(s => s.trim()).filter(s => s);
    const points = [];

    for (let i = 0; i < records.length; i++) {
        const text = records[i];
        if (!text.includes('## Registro')) continue;

        const typeMatch = text.match(/## Registro \d+ - \[(.*?)\]/);
        const type = typeMatch ? typeMatch[1] : 'Unknown';
        
        const sourceMatch = text.match(/\*\*Fuente:\*\* (.*?) \|/);
        const source = sourceMatch ? sourceMatch[1].trim() : filename;

        const catMatch = text.match(/\*\*Categoría:\*\* (.*?)$/m);
        const category = catMatch ? catMatch[1].trim() : 'General';

        // Add context for better embedding
        const textToEmbed = `${type} de ${category}: ${text.substring(0, 1500)}`;

        const vector = await embeddingsService.generateEmbedding(textToEmbed);

        points.push({
            id: crypto.randomUUID(),
            vector,
            payload: {
                texto_original: text,
                fuente: source,
                metadata: {
                    category,
                    section_title: type,
                    is_knowledge: true
                }
            }
        });
    }
    return points;
}

async function ingestPoints(points) {
    if (points.length === 0) return;
    const batchSize = 50;
    for (let i = 0; i < points.length; i += batchSize) {
        const batch = points.slice(i, i + batchSize);
        const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points?wait=true`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ points: batch })
        });
        if (!res.ok) {
            console.error('❌ Error ingestando batch:', await res.text());
        } else {
            console.log(`✅ Ingestados ${batch.length} registros (Batch ${Math.floor(i/batchSize) + 1})`);
        }
    }
}

async function main() {
    console.log('🚀 Iniciando Ingesta de Knowledge Base...');
    await createCollection();

    const files = fs.readdirSync(KNOWLEDGE_DIR).filter(f => f.endsWith('.md'));
    
    let totalIngested = 0;
    for (const file of files) {
        console.log(`📄 Leyendo ${file}...`);
        const points = await parseMarkdownToPoints(path.join(KNOWLEDGE_DIR, file), file);
        await ingestPoints(points);
        totalIngested += points.length;
    }
    console.log(`🎉 Ingesta finalizada. Total registros en knowledge_base: ${totalIngested}`);
}

main().catch(console.error);
