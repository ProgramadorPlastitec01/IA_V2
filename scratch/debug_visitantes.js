import ragService from '../services/ragService.js';
import qdrantService from '../services/qdrantService.js';
import embeddingsService from '../services/embeddingsService.js';

async function test() {
    const q = 'visitantes conservar ropa de calle overol polainas zapatos';
    const embed = await embeddingsService.generateEmbedding(q);
    const semanticRes = await qdrantService.searchSimilar(embed, 10);
    // mock RRF format
    const reranked = semanticRes.map(res => ({ ...res, finalScore: res.score, boosted: false }));
    const context = await ragService._buildContextExpanded(reranked, q, ['visitantes', 'ropa', 'calle', 'overol', 'polainas', 'zapatos']);
    console.log(context.contextText);
}
test().catch(console.error);
