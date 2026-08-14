const url = "http://localhost:6333";
const collection = "plastitec_docs";
const resp = await fetch(`${url}/collections/${collection}/points/scroll`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ limit: 700, with_payload: true, with_vector: false })
});
const data = await resp.json();
const points = data.result?.points || [];
console.log("total points:", points.length);
const hits = points.filter(p => (p.payload?.texto_original||"").includes("libreta Militar") || (p.payload?.texto_original||"").includes("estado civil"));
for (const h of hits) {
  console.log("id=", h.id, "chunk_index=", h.payload.chunk_index, "fuente=", h.payload.fuente);
  console.log(h.payload.texto_original.slice(0,250));
  console.log("---");
}
process.exit(0);
