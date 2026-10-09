// Copia TODOS los puntos (payload + vector) de una colección a otra, vaciando antes el destino.
// Uso: node scratch/copy_collection_points_2026-10-08.mjs <origen> <destino>
const [src, dst] = process.argv.slice(2);
if (!src || !dst || src === dst) { console.error('Uso: <origen> <destino>'); process.exit(1); }
const Q = 'http://localhost:6333/collections';
const post = (url, body, method = 'POST') => fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());

// 1. Leer origen completo
let points = [], offset = null;
do {
  const r = await post(`${Q}/${src}/points/scroll`, { limit: 200, with_payload: true, with_vector: true, ...(offset ? { offset } : {}) });
  points.push(...r.result.points); offset = r.result.next_page_offset;
} while (offset);
console.log(`Origen ${src}: ${points.length} puntos leídos`);

// 2. Vaciar destino
const ids = [];
offset = null;
do {
  const r = await post(`${Q}/${dst}/points/scroll`, { limit: 500, with_payload: false, with_vector: false, ...(offset ? { offset } : {}) });
  ids.push(...r.result.points.map(p => p.id)); offset = r.result.next_page_offset;
} while (offset);
if (ids.length) console.log('Vaciado destino:', (await post(`${Q}/${dst}/points/delete?wait=true`, { points: ids })).status, `(${ids.length} puntos)`);

// 3. Insertar en lotes
for (let i = 0; i < points.length; i += 100) {
  const batch = points.slice(i, i + 100).map(p => ({ id: p.id, vector: p.vector, payload: p.payload }));
  const r = await post(`${Q}/${dst}/points?wait=true`, { points: batch }, 'PUT');
  if (r.status !== 'ok') { console.error('Error en lote', i, JSON.stringify(r).slice(0, 200)); process.exit(1); }
}
const info = await (await fetch(`${Q}/${dst}`)).json();
console.log(`Destino ${dst}: ${info.result.points_count} puntos`);
