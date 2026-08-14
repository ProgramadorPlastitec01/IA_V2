import qdrantService from "../services/qdrantService.js";
import embeddingsService from "../services/embeddingsService.js";
const q = "¿Cuál es la jornada máxima semanal de trabajo y cómo se distribuye para el personal administrativo a partir del 14 de julio?";
const vec = await embeddingsService.generateEmbedding(q);
const sem = await qdrantService.searchSimilar(vec, 30);
const idx = sem.findIndex(r => r.payload.chunk_index === 31 && r.payload.fuente.includes("RIT"));
console.log("semantic rank of chunk31:", idx===-1?"NOT IN TOP30":(idx+1), idx===-1?"":sem[idx].score);
console.log("top1:", sem[0].score, sem[0].payload.chunk_index);

const bm25 = await qdrantService.searchKeyword("jornada personal administrativo horario 14 de julio 2026 lunes viernes", 15);
const idx2 = bm25.findIndex(r => r.payload.chunk_index === 31 && r.payload.fuente.includes("RIT"));
console.log("bm25 rank of chunk31:", idx2===-1?"NOT IN TOP15":(idx2+1), idx2===-1?"":bm25[idx2].score);
process.exit(0);
