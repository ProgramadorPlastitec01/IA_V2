/**
 * rag_retrieval_debug.mjs
 * Diagnóstico completo del flujo Retrieval en Qdrant.
 */
import embeddingsService from './services/embeddingsService.js';
import qdrantService from './services/qdrantService.js';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION  = process.env.QDRANT_COLLECTION || 'rrhh_docs';
const QUERY = 'buenas practicas de manufactura';
const TOP_K = 10;

const sep = (t) => console.log(`\n${'═'.repeat(54)}\n  ${t}\n${'═'.repeat(54)}`);

// ─── 1. Estado de la colección ──────────────────────────────
sep('1. ESTADO DE LA COLECCIÓN');
const colRes  = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`);
const colData = await colRes.json();

if (!colRes.ok) {
  console.error('❌ Colección no encontrada:', colData);
  process.exit(1);
}

const vectors_count  = colData.result?.vectors_count  ?? 0;
const points_count   = colData.result?.points_count   ?? colData.result?.indexed_vectors_count ?? 0;
const config = colData.result?.config?.params?.vectors;

console.log(`Colección : ${COLLECTION}`);
console.log(`Vectores  : ${vectors_count}`);
console.log(`Puntos    : ${points_count}`);
console.log(`Config    : size=${config?.size}  distance=${config?.distance}`);

if (vectors_count === 0 && points_count === 0) {
  console.error('\n🚨 DIAGNÓSTICO: La colección está VACÍA.');
  console.error('   No se han ingestado documentos todavía.');
  console.error('   El Retrieval falla porque no hay nada que recuperar.\n');
  process.exit(0);
}

// ─── 2. Embedding de la consulta ────────────────────────────
sep('2. GENERANDO EMBEDDING');
const t0 = performance.now();
const queryVector = await embeddingsService.generateEmbedding(QUERY);
const embedTime   = (performance.now() - t0).toFixed(0);

console.log(`Query     : "${QUERY}"`);
console.log(`Dimensión : ${queryVector.length}`);
console.log(`Tiempo    : ${embedTime} ms`);
console.log(`Primeros 5 valores: [${queryVector.slice(0, 5).map(v => v.toFixed(6)).join(', ')}]`);

// ─── 3. Búsqueda en Qdrant (topK = 10) ──────────────────────
sep(`3. BÚSQUEDA SEMÁNTICA (topK = ${TOP_K})`);
const t1 = performance.now();
const results = await qdrantService.searchSimilar(queryVector, TOP_K);
const searchTime = (performance.now() - t1).toFixed(0);

console.log(`Tiempo búsqueda : ${searchTime} ms`);
console.log(`Resultados      : ${results?.length ?? 0}\n`);

if (!results || results.length === 0) {
  console.error('🚨 DIAGNÓSTICO: searchSimilar devolvió 0 resultados.');
  console.error('   Posibles causas:');
  console.error('   - Colección vacía (confirmado arriba si vectors_count=0)');
  console.error('   - Dimensión del embedding no coincide con la colección');
  console.error('   - Score mínimo demasiado alto (score_threshold)');
  process.exit(0);
}

// ─── 4. Detalle de cada chunk recuperado ─────────────────────
sep('4. CHUNKS RECUPERADOS');
results.forEach((r, i) => {
  const score   = r.score?.toFixed(4) ?? 'N/A';
  const texto   = (r.payload?.texto_original || r.payload?.text || '(sin texto)')
                    .substring(0, 180).replace(/\n/g, ' ');
  const fuente  = r.payload?.fuente || r.payload?.source || '(sin fuente)';
  const relevance = r.score >= 0.80 ? '🟢' : r.score >= 0.60 ? '🟡' : '🔴';

  console.log(`\n[${i + 1}] ${relevance} Score: ${score}  |  Fuente: ${fuente}`);
  console.log(`    "${texto}${texto.length >= 180 ? '...' : ''}"`);
});

// ─── 5. Diagnóstico automático ────────────────────────────────
sep('5. DIAGNÓSTICO AUTOMÁTICO');
const scores = results.map(r => r.score ?? 0);
const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
const maxScore = Math.max(...scores);
const minScore = Math.min(...scores);

console.log(`Score máximo  : ${maxScore.toFixed(4)}`);
console.log(`Score mínimo  : ${minScore.toFixed(4)}`);
console.log(`Score promedio: ${avgScore.toFixed(4)}`);

console.log('');
if (maxScore >= 0.80) {
  console.log('✅ Retrieval FUNCIONAL — hay chunks altamente relevantes.');
} else if (maxScore >= 0.55) {
  console.log('⚠️  Retrieval PARCIAL — los chunks recuperados son moderadamente relevantes.');
  console.log('   Revisar calidad del chunking y embeddings del corpus.');
} else {
  console.log('🚨 Retrieval FALLIDO — scores muy bajos, documentos no relevantes.');
  console.log('   Causas probables:');
  console.log('   a) Corpus no contiene información sobre el query.');
  console.log('   b) Modelo de embedding diferente entre ingestión y búsqueda.');
  console.log('   c) Chunking demasiado granular o sin overlap.');
}

console.log('\n✅ Diagnóstico completado.\n');
