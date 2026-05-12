import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DOCS_DIR = path.join(__dirname, '..', 'docs');
const STATE_FILE = path.join(DOCS_DIR, '.indexing_state.json');

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const COLLECTION = 'rrhh_docs';

async function checkOllama() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!res.ok) return { ok: false, error: 'Ollama no responde' };
    const data = await res.json();
    const models = data.models || [];
    const names = models.map(m => m.name);
    
    const required = ['gemma', 'nomic-embed-text'];
    const missing = required.filter(r => !names.some(n => n.startsWith(r)));
    
    return { ok: missing.length === 0, models: names, missing };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function checkQdrant() {
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`);
    if (res.status === 404) return { ok: false, exists: false, points: 0 };
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    
    const data = await res.json();
    const points = data.result?.points_count || 0;
    
    return { ok: points > 0, exists: true, points };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function checkDocs() {
  try {
    const files = await fs.readdir(DOCS_DIR);
    const supported = files.filter(f => f.endsWith('.pdf') || f.endsWith('.txt'));
    
    const currentStats = {};
    for (const file of supported) {
      const stats = await fs.stat(path.join(DOCS_DIR, file));
      currentStats[file] = {
        size: stats.size,
        mtime: stats.mtimeMs
      };
    }

    let previousState = null;
    try {
      const content = await fs.readFile(STATE_FILE, 'utf-8');
      previousState = JSON.parse(content);
    } catch (e) {
      // No state file, assume first time
    }

    if (!previousState) {
      return { changed: true, count: supported.length, reason: 'Sin registro previo' };
    }

    const changedFiles = [];
    for (const file of supported) {
      if (!previousState[file] || 
          previousState[file].size !== currentStats[file].size || 
          previousState[file].mtime !== currentStats[file].mtime) {
        changedFiles.push(file);
      }
    }

    // Check for deleted files
    const deletedFiles = Object.keys(previousState).filter(f => !currentStats[f]);

    return {
      changed: changedFiles.length > 0 || deletedFiles.length > 0,
      changedFiles,
      deletedFiles,
      count: supported.length
    };
  } catch (e) {
    return { error: e.message };
  }
}

async function run() {
  const mode = process.argv[2]; // 'ollama', 'qdrant', 'docs', or 'summary'
  
  if (mode === 'ollama') {
    const status = await checkOllama();
    console.log(JSON.stringify(status));
    process.exit(status.ok ? 0 : 1);
  }
  
  if (mode === 'qdrant') {
    const status = await checkQdrant();
    console.log(JSON.stringify(status));
    process.exit(status.ok ? 0 : 1);
  }
  
  if (mode === 'docs') {
    const status = await checkDocs();
    console.log(JSON.stringify(status));
    process.exit(status.changed ? 1 : 0);
  }

  // Summary mode for full startup validation
  const ollama = await checkOllama();
  const qdrant = await checkQdrant();
  const docs = await checkDocs();

  console.log('\n🔍 DIAGNÓSTICO DE ARRANQUE RAG');
  console.log('─'.repeat(40));

  if (ollama.ok) {
    console.log('✅ Ollama: Activo y con modelos necesarios.');
  } else {
    console.log('❌ Ollama: ERROR');
    if (ollama.error) console.log(`   - ${ollama.error}`);
    if (ollama.missing?.length > 0) {
      console.log(`   - Faltan modelos: ${ollama.missing.join(', ')}`);
      console.log('     Ejecute: ollama pull ' + ollama.missing[0]);
    }
  }

  if (qdrant.exists) {
    if (qdrant.points > 0) {
      console.log(`✅ Qdrant: Colección "${COLLECTION}" con ${qdrant.points} documentos.`);
    } else {
      console.log(`⚠️  Qdrant: Colección "${COLLECTION}" existe pero está VACÍA.`);
    }
  } else {
    console.log(`❌ Qdrant: Colección "${COLLECTION}" NO EXISTE.`);
  }

  if (docs.error) {
    console.log(`⚠️  Docs: No se pudo validar directorio /docs (${docs.error})`);
  } else if (docs.changed) {
    console.log(`⚠️  Docs: Se detectaron cambios pendientes por indexar.`);
    if (docs.changedFiles?.length > 0) console.log(`   - Nuevos/Modificados: ${docs.changedFiles.length}`);
    if (docs.deletedFiles?.length > 0) console.log(`   - Eliminados: ${docs.deletedFiles.length}`);
  } else {
    console.log(`✅ Docs: Sincronizados con el último índice.`);
  }
  console.log('─'.repeat(40) + '\n');

  // Logic for exit code to help CMD
  if (!ollama.ok) process.exit(10); // Critical: Models
  if (!qdrant.ok) process.exit(11); // Critical: No data
  if (docs.changed) process.exit(12); // Warning: Changes
  
  process.exit(0);
}

run();
