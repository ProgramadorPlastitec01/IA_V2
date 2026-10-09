// Recrea el índice full-text de `texto_original` con ascii_folding en una colección.
// Uso: node scratch/recreate_text_index_2026-10-08.mjs <coleccion>
const coll = process.argv[2];
if (!coll) { console.error('Falta el nombre de la colección'); process.exit(1); }
const base = `http://localhost:6333/collections/${coll}`;

const del = await fetch(`${base}/index/texto_original?wait=true`, { method: 'DELETE' });
console.log('DELETE índice:', del.status, (await del.text()).slice(0, 120));

const put = await fetch(`${base}/index?wait=true`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    field_name: 'texto_original',
    field_schema: { type: 'text', tokenizer: 'word', min_token_len: 2, max_token_len: 25, lowercase: true, ascii_folding: true },
  }),
});
console.log('PUT índice:', put.status, (await put.text()).slice(0, 160));

const info = await (await fetch(base)).json();
console.log('payload_schema.texto_original =', JSON.stringify(info.result.payload_schema.texto_original));
