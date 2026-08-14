import ragService from "../services/ragService.js";
import qdrantService from "../services/qdrantService.js";
import embeddingsService from "../services/embeddingsService.js";
import queryUnderstandingService from "../services/queryUnderstandingService.js";
import rerankingService from "../services/rerankingService.js";
import intentRoutingService from "../services/intentRoutingService.js";

const q = "¿Qué tipo de información o pruebas tiene estrictamente prohibido exigir la empresa a los aspirantes durante el proceso de selección?";
const intent = intentRoutingService.detectIntent(q);
const intentParams = intentRoutingService.getParams(intent);
const { expanded_query, expanded_terms } = queryUnderstandingService.understand(q);
const { normalizedQuery: spellCorrectedQuery } = queryUnderstandingService._normalizeSpelling(q.trim());
const keywords = ragService._extractKeywords(spellCorrectedQuery);
const docPriority = ragService._detectDocPriority(q);
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
const merged = ragService._weightedFusion(semanticResults,0.45, keywordResults,0.25, exactPhraseResults,0.20, expandedSemanticResults,0.10);
let reranked = rerankingService.rerank(merged, spellCorrectedQuery, keywords, docPriority, [], expanded_terms);

const top6Ids  = new Set(reranked.slice(0, 6).map(r => r.id));
const displaced = semanticResults.slice(0, 2).filter(r => !top6Ids.has(r.id));
if (displaced.length > 0) {
    const displacedIds = new Set(displaced.map(r => r.id));
    const rescued  = reranked.filter(r => displacedIds.has(r.id));
    const rest     = reranked.filter(r => !displacedIds.has(r.id));
    let evictFrom  = Math.max(0, 6 - rescued.length);
    while (evictFrom < rest.length && parseFloat(rest[evictFrom]?.scoreDetail?.domain || 0) > 0) evictFrom++;
    rest.splice(evictFrom, rescued.length, ...rescued);
    reranked = rest;
}
reranked.slice(0,8).forEach((r,i)=>console.log(i+1, r.finalScore.toFixed(4), "chunk="+r.payload.chunk_index, r.payload.fuente.slice(0,10)));
process.exit(0);
