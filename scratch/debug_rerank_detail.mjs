import ragService from "../services/ragService.js";
import qdrantService from "../services/qdrantService.js";
import embeddingsService from "../services/embeddingsService.js";
import queryUnderstandingService from "../services/queryUnderstandingService.js";
import rerankingService from "../services/rerankingService.js";

const q = "¿Qué tipo de información o pruebas tiene estrictamente prohibido exigir la empresa a los aspirantes durante el proceso de selección?";
const { expanded_query, expanded_terms } = queryUnderstandingService.understand(q);
console.log("expanded_terms:", expanded_terms);

const vec = await embeddingsService.generateEmbedding(q);
const sem = await qdrantService.searchSimilar(vec, 20);
const bm25 = await qdrantService.searchKeyword(expanded_terms.join(" "), 15);

// crude fusion just to test rerank directly on a merged set incl chunk 3
const merged = [...sem, ...bm25].reduce((acc, r) => {
  const key = r.payload.fuente + "_" + r.payload.chunk_index;
  if (!acc[key]) acc[key] = { ...r, fusionScore: r.score };
  return acc;
}, {});
const candidates = Object.values(merged);
const keywords = ["tipo","informacion","pruebas","estrictamente","prohibido","exigir","aspirantes","proceso","seleccion"];
const reranked = rerankingService.rerank(candidates, q, keywords, {boost:["rit"],penalize:[]}, [], expanded_terms);
reranked.slice(0,8).forEach((r,i)=>console.log(i+1, r.finalScore.toFixed(4), "chunk="+r.payload.chunk_index, JSON.stringify(r.scoreDetail)));
const c3 = reranked.find(r => r.payload.chunk_index===3 && r.payload.fuente.includes("RIT"));
console.log("chunk3 rank:", reranked.indexOf(c3)+1, "score:", c3?.finalScore, JSON.stringify(c3?.scoreDetail));
process.exit(0);
