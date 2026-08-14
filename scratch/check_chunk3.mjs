import qdrantService from "../services/qdrantService.js";
const url = "http://localhost:6333";
const collection = "plastitec_docs";
const resp = await fetch(`${url}/collections/${collection}/points/scroll`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ limit: 700, with_payload: true, with_vector: false })
});
const data = await resp.json();
const points = data.result?.points || [];
const p = points.find(pt => pt.payload?.chunk_index === 3 && pt.payload?.fuente?.includes("RIT"));
console.log(p.payload.texto_original);
console.log("=== BM25 search test ===");
const bm25 = await qdrantService.searchKeyword("¿Qué tipo de información o pruebas tiene estrictamente prohibido exigir la empresa a los aspirantes durante el proceso de selección?", 15);
bm25.forEach((r,i)=>console.log(i+1, r.score?.toFixed(3), r.payload?.chunk_index, r.payload?.fuente));
process.exit(0);
