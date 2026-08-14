import ragService from "../services/ragService.js";
import qdrantService from "../services/qdrantService.js";
import embeddingsService from "../services/embeddingsService.js";
import queryUnderstandingService from "../services/queryUnderstandingService.js";
import rerankingService from "../services/rerankingService.js";
import intentRoutingService from "../services/intentRoutingService.js";

const q = "¿Qué tipo de información o pruebas tiene estrictamente prohibido exigir la empresa a los aspirantes durante el proceso de selección?";
const intent = intentRoutingService.detectIntent(q);
const intentParams = intentRoutingService.getParams(intent);
console.log("intent:", intent, "topK:", intentParams.topK);

const { expanded_query, expanded_terms } = queryUnderstandingService.understand(q);
const { normalizedQuery: spellCorrectedQuery } = queryUnderstandingService._normalizeSpelling(q.trim());
const keywords = ragService._extractKeywords(spellCorrectedQuery);
const docPriority = ragService._detectDocPriority(q);
const foundAcronyms = [];

const topK = intentParams.topK || 20;
const originalQueryEmbedding = await embeddingsService.generateEmbedding(spellCorrectedQuery);
const expandedQueryEmbedding = await embeddingsService.generateEmbedding(expanded_query);
const cleanKeywordQuery = expanded_terms.length > 0 ? expanded_terms.join(" ") : keywords.join(" ");

const [semanticResults, expandedSemanticResults, keywordResults, exactPhraseResults] = await Promise.all([
  qdrantService.searchSimilar(originalQueryEmbedding, topK),
  qdrantService.searchSimilar(expandedQueryEmbedding, topK),
  qdrantService.searchKeyword(cleanKeywordQuery, 15),
  qdrantService.searchExactPhrase(spellCorrectedQuery, 10),
]);

console.log("keywordResults chunk3 present:", keywordResults.some(r=>r.payload.chunk_index===3));
console.log("semanticResults chunk3 present:", semanticResults.some(r=>r.payload.chunk_index===3));

const merged = ragService._weightedFusion(semanticResults,0.45, keywordResults,0.25, exactPhraseResults,0.20, expandedSemanticResults,0.10);
console.log("merged total:", merged.length, "chunk3 in merged:", merged.some(r=>r.payload.chunk_index===3));

const reranked = rerankingService.rerank(merged, spellCorrectedQuery, keywords, docPriority, foundAcronyms, expanded_terms);
reranked.slice(0,8).forEach((r,i)=>console.log(i+1, r.finalScore.toFixed(4), "chunk="+r.payload.chunk_index, JSON.stringify(r.scoreDetail)));
process.exit(0);
