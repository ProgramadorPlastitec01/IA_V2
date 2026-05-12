/**
 * rebuild_rag.js
 *
 * Script de reingestión completa del corpus RAG.
 *
 * Uso:
 *   node services/rebuild_rag.js
 *
 * Flujo:
 *   1. Verificar conectividad con Qdrant
 *   2. Eliminar colección existente (reset limpio)
 *   3. Recrear colección (768 dims, Cosine)
 *   4. Ejecutar ingesta completa de /docs
 *   5. Verificar points_count en Qdrant
 *   6. Ejecutar query de prueba "Buenas prácticas de manufactura BPM"
 */

import embeddingsService from './embeddingsService.js';
import qdrantService from './qdrantService.js';
import ingestionService from './ingestionService.js';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION = process.env.QDRANT_COLLECTION || 'rrhh_docs';
const TEST_QUERY = 'Buenas prácticas de manufactura BPM higiene producción calidad';

const sep = (title) => {
  const line = '═'.repeat(56);
  console.log(`\n${line}`);
  console.log(`  ${title}`);
  console.log(`${line}`);
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function checkQdrant() {
  sep('1. VERIFICANDO CONECTIVIDAD QDRANT');
  try {
    const res = await fetch(`${QDRANT_URL}/collections`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    console.log(`✅ Qdrant disponible en ${QDRANT_URL}`);
    const collections = data.result?.collections || [];
    console.log(`   Colecciones existentes: ${collections.length > 0 ? collections.map(c => c.name).join(', ') : '(ninguna)'}`);
    return true;
  } catch (e) {
    console.error(`❌ QDRANT NO DISPONIBLE: ${e.message}`);
    console.error('   Asegúrate de que Qdrant está corriendo (start_qdrant.bat)');
    console.error(`   URL configurada: ${QDRANT_URL}`);
    return false;
  }
}

async function deleteCollection() {
  sep('2. VACIANDO COLECCIÓN (RESET LIMPIO DE PUNTOS)');
  try {
    // Verificar si la colección existe
    const checkRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`);

    if (checkRes.status === 404) {
      console.log(`ℹ️  Colección "${COLLECTION}" no existe. Se creará nueva.`);
      return;
    }

    if (!checkRes.ok) {
      throw new Error(`Error al verificar colección: HTTP ${checkRes.status}`);
    }

    const colData = await checkRes.json();
    const pointsExisting = colData.result?.points_count ?? 0;

    if (pointsExisting === 0) {
      console.log(`ℹ️  Colección ya está vacía (0 puntos). Continuando.`);
      return;
    }

    console.log(`   Puntos actuales: ${pointsExisting} — vaciando colección...`);

    // Usar DELETE /points con filtro "eliminar todos" en lugar de borrar la colección
    // (evita el error de acceso denegado en Windows cuando Qdrant tiene el dir en uso)
    const deleteRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/delete?wait=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filter: { must: [{ is_empty: { key: '__non_existent__' } }] }
      })
    });

    // Fallback: si el filtro "vaciar todo" no funciona en esta versión de Qdrant,
    // intentar con el endpoint de scroll + delete batch
    if (!deleteRes.ok) {
      console.log('   Método 1 falló, intentando método alternativo (scroll + delete)...');
      await truncateViaScrollDelete();
    } else {
      console.log(`✅ Colección "${COLLECTION}" vaciada correctamente.`);
    }

    // Verificar que quedó vacía
    const verRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`);
    const verData = await verRes.json();
    const remaining = verData.result?.points_count ?? 0;
    console.log(`   Puntos restantes post-limpieza: ${remaining}`);

  } catch (e) {
    console.error(`❌ Error al vaciar colección: ${e.message}`);
    console.log('   Continuando de todas formas con la reingesta...');
  }
}

async function truncateViaScrollDelete() {
  console.log('   Eliminando puntos en batches via scroll...');
  let deleted = 0;
  let hasMore = true;
  let nextOffset = null;

  while (hasMore) {
    // Obtener IDs de puntos en lote de 100
    const scrollBody = { limit: 100, with_payload: false, with_vector: false };
    if (nextOffset) scrollBody.offset = nextOffset;

    const scrollRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scrollBody)
    });

    if (!scrollRes.ok) break;
    const scrollData = await scrollRes.json();
    const points = scrollData.result?.points || [];
    nextOffset = scrollData.result?.next_page_offset;

    if (points.length === 0) { hasMore = false; break; }

    const ids = points.map(p => p.id);
    const delRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/delete?wait=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points: ids })
    });

    if (delRes.ok) { deleted += ids.length; }
    if (!nextOffset || points.length < 100) hasMore = false;
  }

  console.log(`   ✅ ${deleted} puntos eliminados vía scroll+delete.`);
}

async function createCollection() {
  sep('3. CREANDO COLECCIÓN (768 dims, Cosine)');
  try {
    // Verificar primero si existe
    const checkRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`);
    if (checkRes.ok) {
      console.log(`   Colección "${COLLECTION}" ya existe. Omitiendo creación.`);
      return;
    }

    const vectorSize = embeddingsService.getEmbeddingDimension();
    console.log(`   Dimensión de vectores: ${vectorSize}`);
    console.log(`   Distancia: Cosine`);

    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vectors: { size: vectorSize, distance: 'Cosine' }
      })
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status}: ${body}`);
    }
    console.log(`✅ Colección "${COLLECTION}" creada exitosamente.`);
  } catch (e) {
    console.error(`❌ Error al crear colección: ${e.message}`);
    throw e;
  }
}

async function verifyCollection() {
  sep('5. VERIFICANDO COLECCIÓN POST-INGESTA');
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const points   = data.result?.points_count   ?? 0;
    const vectors  = data.result?.vectors_count  ?? 0;
    const config   = data.result?.config?.params?.vectors;

    console.log(`   Colección     : ${COLLECTION}`);
    console.log(`   Points count  : ${points}`);
    console.log(`   Vectors count : ${vectors}`);
    console.log(`   Config        : size=${config?.size}  distance=${config?.distance}`);

    if (points === 0) {
      console.error('\n🚨 CRÍTICO: La colección sigue vacía después de la ingesta.');
      console.error('   Revisa los errores durante el paso 4 (Ingesta).');
    } else {
      console.log(`\n✅ Colección con ${points} puntos lista para búsqueda semántica.`);
    }

    return points;
  } catch (e) {
    console.error(`❌ Error al verificar colección: ${e.message}`);
    return 0;
  }
}

async function runTestQuery(pointsCount) {
  sep('6. QUERY DE PRUEBA');

  if (pointsCount === 0) {
    console.log('⏭️  Saltando query de prueba (colección vacía).');
    return;
  }

  console.log(`   Query: "${TEST_QUERY}"\n`);

  try {
    // Generar embedding de la query de prueba
    const t0 = performance.now();
    const vector = await embeddingsService.generateEmbedding(TEST_QUERY);
    const embedTime = (performance.now() - t0).toFixed(0);
    console.log(`   Embedding generado en ${embedTime}ms (dim: ${vector.length})`);

    // Buscar en Qdrant topK=5
    const t1 = performance.now();
    const results = await qdrantService.searchSimilar(vector, 5);
    const searchTime = (performance.now() - t1).toFixed(0);
    console.log(`   Búsqueda completada en ${searchTime}ms — ${results?.length ?? 0} resultados\n`);

    if (!results || results.length === 0) {
      console.error('🚨 La búsqueda no retornó resultados.');
      console.error('   Posibles causas: dimensión incorrecta, colección vacía o error en Qdrant.');
      return;
    }

    // Mostrar resultados
    console.log('   ┌─────────────────────────────────────────────────────┐');
    results.forEach((r, i) => {
      const score    = r.score?.toFixed(4) ?? 'N/A';
      const fuente   = r.payload?.fuente || '(sin fuente)';
      const texto    = (r.payload?.texto_original || '').substring(0, 160).replace(/\n/g, ' ');
      const relevant = r.score >= 0.80 ? '🟢' : r.score >= 0.55 ? '🟡' : '🔴';
      console.log(`   │ [${i + 1}] ${relevant} Score: ${score}  │  Fuente: ${fuente}`);
      console.log(`   │     "${texto}${texto.length >= 160 ? '...' : ''}"`);
      if (i < results.length - 1) console.log('   │');
    });
    console.log('   └─────────────────────────────────────────────────────┘');

    // Diagnóstico automático
    const scores  = results.map(r => r.score ?? 0);
    const maxScore = Math.max(...scores);
    const avgScore = (scores.reduce((a, b) => a + b, 0) / scores.length);

    console.log(`\n   Score máximo  : ${maxScore.toFixed(4)}`);
    console.log(`   Score promedio: ${avgScore.toFixed(4)}`);

    if (maxScore >= 0.80) {
      console.log('\n   ✅ RETRIEVAL FUNCIONAL — Hay chunks altamente relevantes.');
      console.log('   El sistema RAG debería responder correctamente preguntas sobre BPM.');
    } else if (maxScore >= 0.55) {
      console.log('\n   ⚠️  RETRIEVAL PARCIAL — Relevancia moderada.');
      console.log('   El sistema puede responder, pero considera mejorar el chunking.');
    } else {
      console.log('\n   🚨 RETRIEVAL FALLIDO — Scores muy bajos.');
      console.log('   Posibles causas:');
      console.log('   a) El PDF I-RH-003 BPMM es de imágenes y no se extrajo texto.');
      console.log('   b) El modelo de embedding es diferente entre ingesta y búsqueda.');
      console.log('   c) La colección tiene muy pocos vectores para este tema.');
    }

  } catch (e) {
    console.error(`❌ Error en query de prueba: ${e.message}`);
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║       REBUILD RAG — Reingestión Completa             ║');
  console.log('║       Asistente RRHH IA — Plastitec                  ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`\nIniciado: ${new Date().toLocaleString('es-CO')}`);

  // 1. Verificar Qdrant
  const qdrantOk = await checkQdrant();
  if (!qdrantOk) {
    console.error('\n🛑 Abortando: Qdrant no está disponible.');
    process.exit(1);
  }

  // 2. Eliminar colección existente
  await deleteCollection();

  // 3. Recrear colección
  await createCollection();

  // 4. Ejecutar ingesta
  sep('4. INGESTA DE DOCUMENTOS (/docs)');
  await ingestionService.run();

  // 5. Verificar resultado
  const pointsCount = await verifyCollection();

  // 6. Query de prueba
  await runTestQuery(pointsCount);

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  ✅ rebuild_rag.js completado                        ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');
}

main().catch(err => {
  console.error('\n❌ Error fatal en rebuild_rag.js:', err.message);
  process.exit(1);
});
