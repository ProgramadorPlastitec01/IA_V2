const body = JSON.stringify({ vectors: { size: 768, distance: "Cosine" } });

fetch("http://localhost:6333/collections/rrhh_docs", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body
})
  .then(r => r.json())
  .then(data => {
    console.log("Resultado PUT:", JSON.stringify(data, null, 2));
    return fetch("http://localhost:6333/collections/rrhh_docs");
  })
  .then(r => r.json())
  .then(data => console.log("Validación GET:", JSON.stringify(data.result?.config?.params?.vectors, null, 2)))
  .catch(e => console.error("Error:", e.message));
