import 'dotenv/config';
import qdrantService from '../services/qdrantService.js';

const kw = await qdrantService.searchKeyword('aprendiz pasante contrato de aprendizaje', 10);
console.log('KEYWORD SEARCH "aprendiz pasante contrato de aprendizaje":');
for (const r of kw) {
    const preview = (r.payload.texto_original || '').slice(0, 160).replace(/\n/g, ' ');
    console.log(`  score=${r.score?.toFixed(4)} fuente=${r.payload.fuente} idx=${r.payload.chunk_index} :: ${preview}`);
}

// Chequeo de duplicados: contar puntos con mismo (fuente, chunk_index)
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION = process.env.QDRANT_COLLECTION || 'plastitec_docs';
let offset = null;
const seen = new Map();
let total = 0;
for (;;) {
    const body = { limit: 300, with_payload: true, with_vector: false };
    if (offset) body.offset = offset;
    const resp = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const json = await resp.json();
    for (const p of json.result.points) {
        total++;
        const key = `${p.payload.fuente}::${p.payload.chunk_index}`;
        seen.set(key, (seen.get(key) || 0) + 1);
    }
    offset = json.result.next_page_offset;
    if (!offset) break;
}
const dups = Array.from(seen.entries()).filter(([, c]) => c > 1);
console.log(`\nTotal puntos: ${total}, claves únicas (fuente+chunk_index): ${seen.size}, claves duplicadas: ${dups.length}`);
console.log('Ejemplos de duplicados:', dups.slice(0, 5));
