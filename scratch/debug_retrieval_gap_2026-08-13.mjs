import 'dotenv/config';
import embeddingsService from '../services/embeddingsService.js';
import qdrantService from '../services/qdrantService.js';

const queries = [
    '¿Cuáles son los beneficios extralegales para pasantes?',
    '¿Existe un programa de pausas activas exclusivo para personal de oficinas?',
];

for (const q of queries) {
    console.log('='.repeat(70));
    console.log('QUERY:', q);
    const emb = await embeddingsService.generateEmbedding(q);
    const results = await qdrantService.searchSimilar(emb, 8);
    for (const r of results) {
        const preview = (r.payload.texto_original || '').slice(0, 140).replace(/\n/g, ' ');
        console.log(`  score=${r.score.toFixed(4)} fuente=${r.payload.fuente} idx=${r.payload.chunk_index} :: ${preview}`);
    }
}
