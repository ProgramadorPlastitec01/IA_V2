const url = "http://localhost:6333";
const collection = "plastitec_docs";
const resp = await fetch(`${url}/collections/${collection}/points/scroll`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ limit: 700, with_payload: true, with_vector: false })
});
const data = await resp.json();
const points = data.result?.points || [];
const hits = points.filter(p => (p.payload?.texto_original||"").includes("14 de julio") || (p.payload?.texto_original||"").includes("7:30"));
for (const h of hits) {
  console.log("chunk_index=", h.payload.chunk_index, "fuente=", h.payload.fuente);
  console.log(h.payload.texto_original.slice(0,600));
  console.log("===");
}
console.log("total hits:", hits.length);
process.exit(0);
