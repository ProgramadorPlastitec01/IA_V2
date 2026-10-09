// Reconstruye el estado de la colección productiva ANTES del P0 en una colección
// aparte (`plastitec_docs_pre_p0`) para poder hacer rollback si se necesita.
// Usa el código de ingesta ORIGINAL y el RIT .md ORIGINAL de backups/p0_2026-10-08.
// No toca `plastitec_docs`. Uso: node scratch/build_pre_p0_rollback_2026-10-08.mjs
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pathToFileURL } from 'url';

const TARGET  = 'plastitec_docs_pre_p0';
const QDRANT  = process.env.QDRANT_URL || 'http://localhost:6333';
const BACKUP  = 'backups/p0_2026-10-08';
const DOCS    = 'docs';
const RIT     = 'RIT_PLASTITEC_01_DE_JULIO_2026_VF.md';
const EXCLUDED = new Set(['OPERATION_MANUAL.md', 'PROJECT_CONTEXT.md', 'TECHNICAL_MANUAL.md',
  'RIT_PLASTITEC_25_NOV_2025.md', 'COMUNICADO_RIT_PLASTITEC_25_NOV_2025.md']);
if (TARGET === (process.env.QDRANT_COLLECTION || 'plastitec_docs')) throw new Error('Destino = colección productiva. Abortado.');

// Módulo de ingesta ORIGINAL (copia temporal junto a services/ para que resuelva sus imports)
const tmp = 'services/__ingestion_pre_p0_tmp.mjs';
fs.copyFileSync(`${BACKUP}/services__ingestionService.js`, tmp);
let OLD;
try { OLD = (await import(pathToFileURL(path.resolve(tmp)).href)).default; } finally { fs.unlinkSync(tmp); }
const { default: emb } = await import('../services/embeddingsService.js');

const req = (url, method, body) => fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) }).then(r => r.json());

// 1. Colección + índices con los parámetros ORIGINALES (sin ascii_folding)
const exists = await fetch(`${QDRANT}/collections/${TARGET}`);
if (exists.ok) { console.log('Ya existe, se elimina para reconstruir:', (await req(`${QDRANT}/collections/${TARGET}`, 'DELETE')).status); }
console.log('Crear:', (await req(`${QDRANT}/collections/${TARGET}`, 'PUT', {
  vectors: { size: emb.getEmbeddingDimension(), distance: 'Cosine' },
  optimizers_config: { default_segment_number: 2 }, hnsw_config: { m: 16, ef_construct: 100 },
})).status);
for (const def of [
  { field_name: 'texto_original', field_schema: { type: 'text', tokenizer: 'word', min_token_len: 2, max_token_len: 25, lowercase: true } },
  { field_name: 'fuente', field_schema: 'keyword' }, { field_name: 'chunk_index', field_schema: 'integer' },
  { field_name: 'metadata.category', field_schema: 'keyword' }, { field_name: 'metadata.ocr_used', field_schema: 'bool' },
  { field_name: 'metadata.doc_type', field_schema: 'keyword' },
]) await req(`${QDRANT}/collections/${TARGET}/index?wait=true`, 'PUT', def);

// 2. Chunking original + embeddings
const files = fs.readdirSync(DOCS).filter(f => f.endsWith('.md') && !EXCLUDED.has(f));
let total = 0;
for (const file of files) {
  const text = file === RIT
    ? fs.readFileSync(`${BACKUP}/docs__${RIT}`, 'utf8')   // RIT original (sin las correcciones de numeración)
    : fs.readFileSync(path.join(DOCS, file), 'utf8');   // los demás .md no se modificaron
  const chunks = file === RIT ? OLD._semanticChunkingByArticle(text) : OLD._semanticChunking(text);
  for (let i = 0; i < chunks.length; i += 5) {
    const batch = chunks.slice(i, i + 5);
    const e = await emb.generateEmbedding(batch.map(c => c.text));
    const vectors = Array.isArray(e[0]) ? e : [e];
    const points = batch.map((c, k) => ({
      id: crypto.randomUUID(), vector: vectors[k],
      payload: {
        texto_original: c.text, fuente: file, chunk_index: i + k, extraction_strategy: 'TEXTO_PLANO',
        metadata: OLD._extractMetadata(c.text, file, { sectionTitle: c.sectionTitle, pageNumber: null, ocrUsed: false, qualityScore: 1.0 }),
      },
    }));
    const r = await req(`${QDRANT}/collections/${TARGET}/points?wait=true`, 'PUT', { points });
    if (r.status !== 'ok') throw new Error(JSON.stringify(r).slice(0, 200));
  }
  total += chunks.length;
  console.log(`${file}: ${chunks.length} chunks`);
}
const info = await (await fetch(`${QDRANT}/collections/${TARGET}`)).json();
console.log(`\n${TARGET}: ${info.result.points_count} puntos (esperado ${total}), status=${info.result.status}`);
process.exit(0);
