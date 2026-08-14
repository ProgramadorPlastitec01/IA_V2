import qdrantService from "../services/qdrantService.js";
import embeddingsService from "../services/embeddingsService.js";
const vec = await embeddingsService.generateEmbedding("estado civil numero de hijos religion filiacion politica prueba de embarazo examen de sida libreta militar prohibido exigir aspirantes");
const res = await qdrantService.searchSimilar(vec, 4);
for (const r of res) {
  console.log("score=", r.score.toFixed(3), "chunk_index=", r.payload?.chunk_index);
  console.log(r.payload?.texto_original?.slice(0,600));
  console.log("---");
}
process.exit(0);
