import fs from 'fs';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import embeddingsService from '../services/embeddingsService.js';
import qdrantService from '../services/qdrantService.js';
import intentRoutingService from '../services/intentRoutingService.js';
import queryUnderstandingService from '../services/queryUnderstandingService.js';
import acronymResolver from '../services/acronymResolver.js';
import rerankingService from '../services/rerankingService.js';
import neuralRerankingService from '../services/neuralRerankingService.js';

dotenv.config({ path: '../.env' });

async function analyzeDuplicates() {
    const url = 'http://localhost:6333';
    let col = 'plastitec_docs';
    let res = await fetch(url + '/collections/' + col);
    if (!res.ok) {
        col = 'rrhh_docs';
        res = await fetch(url + '/collections/' + col);
    }
    const pointsCountRes = await res.json();
    const totalChunks = pointsCountRes.result.points_count;

    let allPoints = [];
    let offset = null;
    do {
        const body = { limit: 1000, with_payload: true, with_vector: false };
        if (offset) body.offset = offset;
        const scrollRes = await fetch(url + '/collections/' + col + '/points/scroll', {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)
        });
        const scrollData = await scrollRes.json();
        if (scrollData.result && scrollData.result.points) {
            allPoints.push(...scrollData.result.points);
            offset = scrollData.result.next_page_offset;
        } else break;
    } while (offset);

    let uniqueMap = {};
    let duplicatesCount = 0;
    
    for (const p of allPoints) {
        const f = p.payload.fuente;
        const text = p.payload.texto_original;
        const key = f + '|||' + text;
        if (!uniqueMap[key]) {
            uniqueMap[key] = { count: 1, source: f };
        } else {
            uniqueMap[key].count++;
            duplicatesCount++;
        }
    }

    let uniqueCount = Object.keys(uniqueMap).length;
    let docDuplicates = {};
    for (const key in uniqueMap) {
        const entry = uniqueMap[key];
        if (entry.count > 1) {
            if (!docDuplicates[entry.source]) docDuplicates[entry.source] = { total: 0, dups: 0 };
            docDuplicates[entry.source].dups += (entry.count - 1);
        }
        if (!docDuplicates[entry.source]) docDuplicates[entry.source] = { total: 0, dups: 0 };
        docDuplicates[entry.source].total += entry.count;
    }

    console.log("==================================================");
    console.log(" ANÁLISIS DE DUPLICADOS EN QDRANT");
    console.log("==================================================");
    console.log(`1. Chunks únicos reales: ${uniqueCount}`);
    console.log(`2. Chunks duplicados: ${duplicatesCount}`);
    console.log(`5. Vectores esperados (última ingesta): 269`);
    console.log(`6. Vectores existentes en DB: ${totalChunks}`);
    console.log(`7. ¿Fue limpiada la colección antes de la reindexación?: ${duplicatesCount > 0 ? "NO" : "SÍ"}`);
    
    console.log("\n3. Documentos con repetición (4. % Duplicación):");
    let hasDups = false;
    for (const doc in docDuplicates) {
        const d = docDuplicates[doc];
        if (d.dups > 0) {
            hasDups = true;
            const pct = ((d.dups / d.total) * 100).toFixed(2);
            console.log(`   - ${doc}: ${d.dups} repeticiones de ${d.total} chunks totales (${pct}% duplicación)`);
        }
    }
    if (!hasDups) console.log("   - Ninguno. La colección está saneada.");
}

// Custom weighted fusion replica
function _weightedFusion(semantic, wSem, bm25, wBM25, exact, wExact, expanded, wExp) {
    const scores = new Map();
    const addResults = (results, weight, type) => {
        if (!results) return;
        results.forEach((res, rank) => {
            let itemScore = res.score || (1 / (rank + 1));
            if (itemScore > 1) itemScore = 1;
            const weightedScore = itemScore * weight;
            if (scores.has(res.id)) {
                const entry   = scores.get(res.id);
                entry.score  += weightedScore;
                entry.types.push(type);
                // Keep the max score from semantic vs bm25 for individual reference later
                if (type === 'semantic') entry.semanticScore = res.score;
                if (type === 'bm25') entry.bm25Score = res.score;
            } else {
                scores.set(res.id, { 
                    res, 
                    score: weightedScore, 
                    types: [type],
                    semanticScore: type === 'semantic' ? res.score : 0,
                    bm25Score: type === 'bm25' ? res.score : 0
                });
            }
        });
    };
    addResults(semantic, wSem, 'semantic');
    addResults(bm25, wBM25, 'bm25');
    addResults(exact, wExact, 'exact_phrase');
    addResults(expanded, wExp, 'expanded_semantic');

    return Array.from(scores.values())
        .sort((a, b) => b.score - a.score)
        .map(item => ({
            ...item.res,
            fusionScore: item.score,
            searchType:  item.types.join('+'),
            finalScore:  item.score,
            semanticScore: item.semanticScore,
            bm25Score: item.bm25Score
        }));
}

const SPANISH_STOPWORDS = new Set(['el','la','los','las','de','del','que','como','puede','pueden','durante','empresa','para','por','una','un','en','y','es','se','su','sus','con','al','lo','no','si','más','pero','o','qué','cuál','cuáles','cómo','debe','deben','son','hay','entre','sobre','este','esta','estos','estas','ser','tiene','tienen','vez']);

function _extractKeywords(query) {
    return query.toLowerCase().replace(/[¿?¡!]/g, '').split(/\s+/).filter(w => w.length > 2 && !SPANISH_STOPWORDS.has(w));
}

function _detectDocPriority(query) {
    // Basic mock of RagService priority
    const lower = query.toLowerCase();
    if (lower.includes('visitante') || lower.includes('lavado') || lower.includes('cofia')) return { boost: ['bpm', 'visita', 'higiene', 'induccion'], penalize: ['rit'] };
    if (lower.includes('aprendiz') || lower.includes('sena')) return { boost: ['rit'], penalize: ['bpm'] };
    if (lower.includes('copasst')) return { boost: ['induccion', 'sst'], penalize: ['bpm', 'etica'] };
    if (lower.includes('sagrilaft') || lower.includes('acoso')) return { boost: ['i-rh-017', 'etica', 'rit'], penalize: ['bpm', 'induccion'] };
    return { boost: [], penalize: [] };
}

async function runQueries() {
    const queries = [
        "COPASST",
        "SAGRILAFT",
        "Acoso sexual laboral",
        "Salud Integral",
        "Lavado de manos",
        "Cofia",
        "Desinfección de uniforme",
        "Aprendiz fase práctica",
        "Apoyo de sostenimiento",
        "Responsabilidades SST"
    ];

    console.log("\n==================================================");
    console.log(" PRUEBAS DE RETRIEVAL (TOP 10 CHUNKS)");
    console.log("==================================================");

    for (const query of queries) {
        console.log(`\n--------------------------------------------------`);
        console.log(`🔍 QUERY: "${query}"`);
        
        const { expanded_query, expanded_terms } = queryUnderstandingService.understand(query);
        const keywords = _extractKeywords(query);
        const docPriority = _detectDocPriority(query);
        const foundAcronyms = acronymResolver.resolveAcronyms(query);

        const cleanKeywordQuery = expanded_terms.length > 0 ? expanded_terms.join(' ') : keywords.join(' ');

        const originalQueryEmbedding = await embeddingsService.generateEmbedding(query);
        const expandedQueryEmbedding = await embeddingsService.generateEmbedding(expanded_query);

        const semanticResults = await qdrantService.searchSimilar(originalQueryEmbedding, 20);
        const expandedSemanticResults = await qdrantService.searchSimilar(expandedQueryEmbedding, 20);
        const keywordResults = await qdrantService.searchKeyword(cleanKeywordQuery, 15);
        const exactPhraseResults = await qdrantService.searchExactPhrase(query, 10);

        const merged = _weightedFusion(
            semanticResults, 0.45,
            keywordResults, 0.25,
            exactPhraseResults, 0.20,
            expandedSemanticResults, 0.10
        );

        const lexicalReranked = rerankingService.rerank(merged, query, keywords, docPriority, foundAcronyms);

        let reranked = lexicalReranked;
        if (neuralRerankingService.isEnabled) {
            const { results } = await neuralRerankingService.rank(query, lexicalReranked);
            reranked = results;
        }

        // We want Top 10
        const top10 = reranked.slice(0, 10);
        
        for (let i = 0; i < top10.length; i++) {
            const c = top10[i];
            const src = c.payload.fuente;
            const textPreview = c.payload.texto_original.substring(0, 60).replace(/\n/g, ' ') + '...';
            const vecScore = c.semanticScore ? c.semanticScore.toFixed(4) : "N/A";
            const bmScore = c.bm25Score ? c.bm25Score.toFixed(4) : "N/A";
            const neuralScore = c.neuralScore !== undefined ? c.neuralScore.toFixed(4) : "N/A";
            
            console.log(`[${i+1}] ${src}`);
            console.log(`    Vectorial: ${vecScore} | BM25: ${bmScore} | Reranker: ${neuralScore}`);
            console.log(`    Texto: "${textPreview}"`);
        }
    }
}

async function main() {
    await analyzeDuplicates();
    await runQueries();
    console.log("\n DONE");
}

main().catch(console.error);
