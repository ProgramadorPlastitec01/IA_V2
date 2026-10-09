// ¿En qué posición del ranking semántico aparece un chunk dado?
// Uso: node scratch/rank_of_chunk_2026-10-08.mjs <coleccion> <substring-fuente> <chunk_index> "pregunta"
const [coll, src, idx, q] = process.argv.slice(2);
const { default: emb } = await import('../services/embeddingsService.js');
const v = await emb.generateEmbedding(q);
const r = await fetch(`http://localhost:6333/collections/${coll}/points/search`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ vector: v, limit: 60, with_payload: true }),
});
const res = (await r.json()).result;
const pos = res.findIndex(p => p.payload.fuente.toLowerCase().includes(src.toLowerCase()) && p.payload.chunk_index === Number(idx));
console.log(`[${coll}] chunk ${src}#${idx}: posición ${pos === -1 ? '>60' : pos + 1}${pos >= 0 ? ` score=${res[pos].score.toFixed(4)}` : ''}`);
if (pos >= 0) console.log('   texto:', res[pos].payload.texto_original.replace(/\s+/g, ' ').slice(0, 260));
console.log('   top-5:', res.slice(0, 5).map(p => `${p.payload.fuente.slice(0, 14)}#${p.payload.chunk_index}:${p.score.toFixed(3)}`).join(' | '));
process.exit(0);
