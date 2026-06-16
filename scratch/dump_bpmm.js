import qdrantService from '../services/qdrantService.js';

async function test() {
    const source = 'I-RH-003 - 18 BPMM (Material Visual) (1).pdf';
    const response = await fetch(`${qdrantService.url}/collections/${qdrantService.collection}/points/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            filter: {
                must: [ { key: 'fuente', match: { value: source } } ]
            },
            with_payload: true,
            limit: 500
        })
    });
    const result = await response.json();
    const sorted = result.result.points.map(p => p.payload).sort((a, b) => a.chunk_index - b.chunk_index);
    
    for (let i = 0; i < sorted.length; i++) {
        const text = sorted[i].texto_original.toLowerCase();
        if (text.includes('visitante') || text.includes('ropa') || text.includes('calle') || text.includes('polaina') || text.includes('overol')) {
            console.log(`\n--- CHUNK ${i} ---`);
            for (let j = Math.max(0, i-1); j <= Math.min(sorted.length-1, i+2); j++) {
                console.log(`[${j}] ${sorted[j].texto_original.replace(/\n/g, ' ')}`);
            }
        }
    }
}
test().catch(console.error);
