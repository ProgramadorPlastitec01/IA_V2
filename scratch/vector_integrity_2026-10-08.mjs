// Integridad de vectores: cada chunk, buscado con SU PROPIO texto, debe salir
// 1º con score ~1.0. Si sale otro chunk, el vector guardado no corresponde al texto.
// Uso: node scratch/vector_integrity_2026-10-08.mjs <coleccion> [maxChunks]
const [coll, maxArg] = process.argv.slice(2);
const { default: emb } = await import('../services/embeddingsService.js');
const r = await fetch(`http://localhost:6333/collections/${coll}/points/scroll`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ limit: 1000, with_payload: true, with_vector: false }),
});
let pts = (await r.json()).result.points;
pts.sort((a, b) => a.payload.fuente.localeCompare(b.payload.fuente) || a.payload.chunk_index - b.payload.chunk_index);
if (maxArg) pts = pts.filter((_, i) => i % Math.ceil(pts.length / Number(maxArg)) === 0);

let ok = 0, bad = [];
for (const p of pts) {
  const v = await emb.generateEmbedding(p.payload.texto_original);
  const s = await fetch(`http://localhost:6333/collections/${coll}/points/search`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vector: v, limit: 3, with_payload: true }),
  });
  const top = (await s.json()).result;
  const self = top.findIndex(t => t.id === p.id);
  if (self === 0 && top[0].score > 0.98) ok++;
  else bad.push({ src: p.payload.fuente, idx: p.payload.chunk_index, selfPos: self, top1: `${top[0].payload.fuente}#${top[0].payload.chunk_index}`, score: top[0].score.toFixed(4) });
}
console.log(`[${coll}] vectores correctos: ${ok}/${pts.length}`);
bad.slice(0, 25).forEach(b => console.log(`   MAL ${b.src}#${b.idx} → posición propia ${b.selfPos === -1 ? '>3' : b.selfPos + 1}, top1=${b.top1} (${b.score})`));
const bySrc = {};
bad.forEach(b => bySrc[b.src] = (bySrc[b.src] || 0) + 1);
console.log('   por documento:', JSON.stringify(bySrc));
process.exit(0);
