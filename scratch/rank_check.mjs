import qdrantService from "../services/qdrantService.js";
import embeddingsService from "../services/embeddingsService.js";
const queries = [
  "¿Qué tipo de información o pruebas tiene estrictamente prohibido exigir la empresa a los aspirantes durante el proceso de selección?",
  "prohibiciones en la admision de personal condiciones de admision aspirante"
];
for (const q of queries) {
  const vec = await embeddingsService.generateEmbedding(q);
  const res = await qdrantService.searchSimilar(vec, 30);
  const idx = res.findIndex(r => r.payload?.chunk_index === 3 && r.payload?.fuente?.includes("RIT"));
  console.log("QUERY:", q);
  console.log("  rank of correct chunk (chunk_index=3):", idx === -1 ? "NOT IN TOP 30" : (idx+1), idx===-1?"":("score="+res[idx].score.toFixed(3)));
  console.log("  top1 score:", res[0].score.toFixed(3), "chunk_index=", res[0].payload?.chunk_index);
}
process.exit(0);
