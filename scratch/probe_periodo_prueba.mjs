import qdrantService from "../services/qdrantService.js";
import embeddingsService from "../services/embeddingsService.js";

const queries = ["periodo de prueba duracion maxima requisito escrito", "prohibido exigir aspirantes seleccion estado civil embarazo sida libreta militar"];
for (const q of queries) {
  const vec = await embeddingsService.generateEmbedding(q);
  const res = await qdrantService.searchSimilar(vec, 5);
  console.log("QUERY:", q);
  for (const r of res) {
    console.log("  score=", r.score.toFixed(3), "fuente=", r.payload?.fuente, "chunk_index=", r.payload?.chunk_index, "text=", (r.payload?.texto||r.payload?.text||"").slice(0,150).replace(/\n/g," "));
  }
}
process.exit(0);
