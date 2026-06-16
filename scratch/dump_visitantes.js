import qdrantService from '../services/qdrantService.js';

async function test() {
    const source = 'I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf';
    // Let's get ALL chunks for this file to see what it contains
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
    
    // Find the word "visitante" and print surrounding chunks
    for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].texto_original.toLowerCase().includes('visitante')) {
            console.log(`\n--- CHUNK ${i} ---`);
            for (let j = Math.max(0, i-2); j <= Math.min(sorted.length-1, i+4); j++) {
                console.log(`[${j}] ${sorted[j].texto_original.replace(/\n/g, ' ')}`);
            }
        }
    }
}
test().catch(console.error);
