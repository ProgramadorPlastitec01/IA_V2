import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import fetch from 'node-fetch'; // if not globally available, but we use node 18+ fetch
import embeddingsService from './services/embeddingsService.js';
import qdrantService from './services/qdrantService.js';
import gemmaService from './services/gemmaService.js';
import sqlite from 'sqlite3';
import { open } from 'sqlite';

const backendUrl = 'http://localhost:3000';
const ollamaUrl = 'http://localhost:11434';
const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';

async function logStep(title) {
  console.log(`\n==================================================`);
  console.log(`=== ${title}`);
  console.log(`==================================================`);
}

async function runTests() {
  const report = {};
  
  // 1. INFRAESTRUCTURA
  logStep('1. VALIDACION DE INFRAESTRUCTURA');
  try {
    const ollamaRes = await fetch(`${ollamaUrl}/api/tags`);
    const ollamaData = await ollamaRes.json();
    const models = ollamaData.models.map(m => m.name);
    console.log(`[Ollama] Responde OK. Modelos: ${models.join(', ')}`);
    report.ollama = { ok: true, models };
  } catch (e) {
    console.error(`[Ollama] Error: ${e.message}`);
    report.ollama = { ok: false, error: e.message };
  }

  try {
    const qdrantRes = await fetch(`${qdrantUrl}/collections`);
    const qdrantData = await qdrantRes.json();
    console.log(`[Qdrant] Responde OK. Colecciones:`, qdrantData.result.collections.map(c => c.name));
    report.qdrant = { ok: true };
  } catch (e) {
    console.error(`[Qdrant] Error: ${e.message}`);
    report.qdrant = { ok: false, error: e.message };
  }

  try {
    const backendRes = await fetch(`${backendUrl}/`); // or health check
    console.log(`[Backend] Responde OK (${backendRes.status})`);
    report.backend = { ok: true };
  } catch (e) {
    console.error(`[Backend] Error: ${e.message}`);
    report.backend = { ok: false, error: e.message };
  }

  // 2. EMBEDDINGS
  logStep('2. VALIDACION DE EMBEDDINGS');
  try {
    const startEmbed = performance.now();
    const embedding = await embeddingsService.generateEmbedding("vacaciones empleados");
    const embedTime = performance.now() - startEmbed;
    
    if (Array.isArray(embedding) && typeof embedding[0] === 'number') {
      console.log(`[Embeddings] Generado OK. Dimensión: ${embedding.length}, Tiempo: ${embedTime.toFixed(2)}ms`);
      report.embeddings = { ok: true, time: embedTime, dim: embedding.length };
    } else {
      console.error(`[Embeddings] Error: Resultado no es un array numérico.`);
      report.embeddings = { ok: false, error: 'Not numeric array' };
    }
  } catch (e) {
    console.error(`[Embeddings] Error: ${e.message}`);
    report.embeddings = { ok: false, error: e.message };
  }

  // 3. QDRANT
  logStep('3. VALIDACION DE QDRANT');
  try {
    const startSearch = performance.now();
    const results = await qdrantService.searchSimilar("vacaciones empleados", 3);
    const searchTime = performance.now() - startSearch;
    
    if (results && results.length > 0) {
      console.log(`[Qdrant] Búsqueda OK. Resultados: ${results.length}, Tiempo: ${searchTime.toFixed(2)}ms`);
      console.log(`[Qdrant] Top 1 Score: ${results[0].score}`);
      console.log(`[Qdrant] Payload:`, Object.keys(results[0].payload));
      report.qdrantSearch = { ok: true, count: results.length, topScore: results[0].score, time: searchTime };
    } else {
      console.error(`[Qdrant] Error: Búsqueda sin resultados.`);
      report.qdrantSearch = { ok: false, error: 'No results' };
    }
  } catch (e) {
    console.error(`[Qdrant] Error: ${e.message}`);
    report.qdrantSearch = { ok: false, error: e.message };
  }

  // 4. GEMMA
  logStep('4. VALIDACION DE GEMMA');
  try {
    const startGemma = performance.now();
    const gemmaResp = await gemmaService.generateResponse(
      "Los empleados tienen 15 días hábiles de vacaciones",
      "¿Cuántos días tengo?"
    );
    const gemmaTime = performance.now() - startGemma;
    
    console.log(`[Gemma] Respuesta: ${gemmaResp}`);
    console.log(`[Gemma] Tiempo: ${gemmaTime.toFixed(2)}ms`);
    report.gemma = { ok: true, time: gemmaTime, response: gemmaResp };
  } catch (e) {
    console.error(`[Gemma] Error: ${e.message}`);
    report.gemma = { ok: false, error: e.message };
  }

  // 5. RAG COMPLETO
  logStep('5. VALIDACION RAG COMPLETO (/api/query)');
  const ragQueries = [
    { name: "Caso 1", q: "¿Cuántos días de vacaciones tengo?" },
    { name: "Caso 2", q: "¿Cómo funcionan los permisos?" },
    { name: "Caso 3 (CRÍTICO)", q: "¿Cuál es la capital de Francia?" },
    { name: "Caso 4", q: "vacaciones empleados" }
  ];
  
  report.rag = [];
  for (const tc of ragQueries) {
    try {
      const startRag = performance.now();
      const res = await fetch(`${backendUrl}/api/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: tc.q,
          sessionId: 'QA-Test-Session'
        })
      });
      const data = await res.json();
      const ragTime = performance.now() - startRag;
      
      console.log(`[${tc.name}] Q: "${tc.q}"`);
      console.log(`   - Status: ${res.status}`);
      console.log(`   - Respuesta: ${data.response?.substring(0, 80)}...`);
      console.log(`   - Tiempo Total: ${ragTime.toFixed(2)}ms`);
      if (data.metrics) {
         console.log(`   - T.Emb: ${data.metrics.embeddingsTime}ms, T.Qdrant: ${data.metrics.qdrantTime}ms, T.Gemma: ${data.metrics.gemmaTime}ms`);
      }
      report.rag.push({ ok: true, name: tc.name, q: tc.q, response: data.response, time: ragTime, metrics: data.metrics });
    } catch (e) {
      console.error(`[${tc.name}] Error: ${e.message}`);
      report.rag.push({ ok: false, name: tc.name, error: e.message });
    }
  }

  // 6. CACHE (SQLITE)
  logStep('6. VALIDACION DE CACHE (SQLITE)');
  try {
    const qCache = "¿Qué es el manual de empleado?";
    // Req 1
    const res1 = await fetch(`${backendUrl}/api/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: qCache, sessionId: 'QA-Test-Session-Cache' })
    });
    const d1 = await res1.json();
    
    // Req 2
    const res2 = await fetch(`${backendUrl}/api/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: qCache, sessionId: 'QA-Test-Session-Cache' })
    });
    const d2 = await res2.json();
    
    console.log(`[Cache] Req 1 Status: ${res1.status}`);
    console.log(`[Cache] Req 2 Status: ${res2.status}`);
    console.log(`[Cache] Req 2 usedCache?: ${d2.cached}`);
    
    // Check SQLite
    const db = await open({ filename: 'hr_cache.db', driver: sqlite.Database });
    const row = await db.get(`SELECT usage_count FROM responses_cache WHERE query = ? COLLATE NOCASE`, [qCache]);
    console.log(`[Cache] usage_count en DB para "${qCache}": ${row?.usage_count}`);
    report.cache = { ok: true, usedCache: d2.cached, dbCount: row?.usage_count };
  } catch (e) {
    console.error(`[Cache] Error: ${e.message}`);
    report.cache = { ok: false, error: e.message };
  }
}

runTests().then(() => console.log('\n✅ PRUEBAS FINALIZADAS.')).catch(console.error);
