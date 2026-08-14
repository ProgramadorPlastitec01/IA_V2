/**
 * Build de colección de prueba para validar el re-chunking header-aware del
 * RIT (seguimiento_5.md #2). NO toca la colección productiva.
 *
 * Estrategia:
 *   1. Crear colección nueva `plastitec_docs_test_ritv2`.
 *   2. Clonar (sin reembeber) todos los puntos de la colección productiva
 *      cuya fuente != RIT — se reusan los vectores ya calculados.
 *   3. Re-chunkear el RIT con `ingestionService._semanticChunkingByArticle`
 *      y re-embeber solo esos chunks nuevos.
 *   4. Insertar todo en la colección de prueba.
 */
import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import qdrantService from '../services/qdrantService.js';
import embeddingsService from '../services/embeddingsService.js';
import ingestionService from '../services/ingestionService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const DOCS_DIR   = path.join(__dirname, '..', 'docs');

const PROD_COLLECTION = process.env.QDRANT_COLLECTION || 'plastitec_docs';
const TEST_COLLECTION = 'plastitec_docs_test_ritv2';
const RIT_FILE        = 'RIT_PLASTITEC_01_DE_JULIO_2026_VF.md';
const QDRANT_URL      = process.env.QDRANT_URL || 'http://localhost:6333';

async function scrollAll(collection) {
    const points = [];
    let offset = null;
    for (;;) {
        const body = { limit: 200, with_payload: true, with_vector: true };
        if (offset) body.offset = offset;
        const resp = await fetch(`${QDRANT_URL}/collections/${collection}/points/scroll`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!resp.ok) throw new Error(await resp.text());
        const json = await resp.json();
        points.push(...json.result.points);
        offset = json.result.next_page_offset;
        if (!offset) break;
    }
    return points;
}

async function main() {
    console.log(`Origen (producción):  ${PROD_COLLECTION}`);
    console.log(`Destino (prueba):      ${TEST_COLLECTION}`);

    // ── 1. Crear colección de prueba ─────────────────────────────────────
    qdrantService.collection = TEST_COLLECTION;
    await qdrantService.createCollectionIfNotExists(embeddingsService.getEmbeddingDimension());
    console.log('Colección de prueba creada/verificada.');

    // ── 2. Clonar puntos de producción (excepto RIT) ─────────────────────
    const allPoints = await scrollAll(PROD_COLLECTION);
    console.log(`Puntos en producción: ${allPoints.length}`);

    const nonRitPoints = allPoints.filter(p => p.payload?.fuente !== RIT_FILE);
    const ritPointsOld  = allPoints.filter(p => p.payload?.fuente === RIT_FILE);
    console.log(`Puntos no-RIT a clonar: ${nonRitPoints.length}`);
    console.log(`Puntos RIT viejos (se reemplazan): ${ritPointsOld.length}`);

    for (let i = 0; i < nonRitPoints.length; i += 100) {
        const batch = nonRitPoints.slice(i, i + 100).map(p => ({
            id: p.id, vector: p.vector, payload: p.payload,
        }));
        const resp = await fetch(`${QDRANT_URL}/collections/${TEST_COLLECTION}/points?wait=true`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ points: batch }),
        });
        if (!resp.ok) throw new Error(await resp.text());
        process.stdout.write('.');
    }
    console.log(`\nClonados ${nonRitPoints.length} puntos no-RIT (vectores reutilizados).`);

    // ── 3. Re-chunkear RIT con el algoritmo header-aware ──────────────────
    const ritText = await fs.readFile(path.join(DOCS_DIR, RIT_FILE), 'utf-8');
    const newChunks = ingestionService._semanticChunkingByArticle(ritText);
    console.log(`RIT re-chunkeado: ${newChunks.length} chunks nuevos (antes: ${ritPointsOld.length}).`);

    const batchSize = 5;
    for (let i = 0; i < newChunks.length; i += batchSize) {
        const batch = newChunks.slice(i, i + batchSize);
        const texts = batch.map(c => c.text);
        const embeddings = await embeddingsService.generateEmbedding(texts);
        const vectors = Array.isArray(embeddings[0]) ? embeddings : [embeddings];

        const points = batch.map((chunk, idx) => ({
            id: crypto.randomUUID(),
            vector: vectors[idx],
            payload: {
                texto_original: chunk.text,
                fuente: RIT_FILE,
                chunk_index: i + idx,
                extraction_strategy: 'TEXTO_PLANO',
                metadata: ingestionService._extractMetadata(chunk.text, RIT_FILE, {
                    sectionTitle: chunk.sectionTitle,
                    pageNumber: null,
                    ocrUsed: false,
                    qualityScore: 1.0,
                }),
            },
        }));

        const resp = await fetch(`${QDRANT_URL}/collections/${TEST_COLLECTION}/points?wait=true`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ points }),
        });
        if (!resp.ok) throw new Error(await resp.text());
        process.stdout.write('#');
    }
    console.log(`\nInsertados ${newChunks.length} chunks nuevos de RIT en ${TEST_COLLECTION}.`);

    const finalCount = await scrollAll(TEST_COLLECTION);
    console.log(`\nTotal puntos en ${TEST_COLLECTION}: ${finalCount.length} (producción tenía ${allPoints.length}).`);
    console.log('LISTO.');
}

main().catch(err => {
    console.error('ERROR:', err);
    process.exit(1);
});
