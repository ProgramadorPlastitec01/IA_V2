import ragService from "../services/ragService.js";
import qdrantService from "../services/qdrantService.js";
import embeddingsService from "../services/embeddingsService.js";
import queryUnderstandingService from "../services/queryUnderstandingService.js";
import rerankingService from "../services/rerankingService.js";

const q = "¿Qué tipo de información o pruebas tiene estrictamente prohibido exigir la empresa a los aspirantes durante el proceso de selección?";
const { expanded_query, expanded_terms } = queryUnderstandingService.understand(q);
const keywords = ragService._extractKeywords(q);
const spellCorrectedQuery = q;

const originalQueryEmbedding = await embeddingsService.generateEmbedding(spellCorrectedQuery);
const expandedQueryEmbedding = await embeddingsService.generateEmbedding(expanded_query);
const cleanKeywordQuery = expanded_terms.length > 0 ? expanded_terms.join(" ") : keywords.join(" ");

const [semanticResults, expandedSemanticResults, keywordResults, exactPhraseResults] = await Promise.all([
  qdrantService.searchSimilar(originalQueryEmbedding, 20),
  qdrantService.searchSimilar(expandedQueryEmbedding, 20),
  qdrantService.searchKeyword(cleanKeywordQuery, 15),
  qdrantService.searchExactPhrase(spellCorrectedQuery, 10),
]);

const merged = ragService._weightedFusion(semanticResults,0.45, keywordResults,0.25, exactPhraseResults,0.20, expandedSemanticResults,0.10);
const docPriority = ragService._detectDocPriority(q);
const foundAcronyms = [];
const reranked = rerankingService.rerank(merged, spellCorrectedQuery, keywords, docPriority, foundAcronyms, expanded_terms);

reranked.slice(0,8).forEach((r,i)=>console.log(i+1, r.finalScore.toFixed(4), "chunk="+r.payload.chunk_index, JSON.stringify(r.scoreDetail)));
const c3idx = reranked.findIndex(r => r.payload.chunk_index===3 && r.payload.fuente.includes("RIT"));
console.log("chunk3 actual rank:", c3idx+1, "score:", reranked[c3idx]?.finalScore, JSON.stringify(reranked[c3idx]?.scoreDetail));
process.exit(0);
