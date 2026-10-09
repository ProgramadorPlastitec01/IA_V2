// ¿El índice full-text de Qdrant encuentra palabras acentuadas si la query llega sin tilde?
const coll = process.argv[2] || 'plastitec_docs';
const count = async (t) => {
  const r = await fetch(`http://localhost:6333/collections/${coll}/points/count`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filter: { must: [{ key: 'texto_original', match: { text: t } }] }, exact: true }),
  });
  return (await r.json()).result.count;
};
for (const [con, sin] of [['certificación', 'certificacion'], ['dotación', 'dotacion'], ['inducción', 'induccion'], ['período', 'periodo'], ['vacaciones', 'vacaciones'], ['corrección', 'correccion'], ['jornada', 'jornada']]) {
  console.log(`${con.padEnd(14)} con tilde: ${String(await count(con)).padStart(4)} chunks | sin tilde (lo que envía _tokenizeQuery): ${String(await count(sin)).padStart(4)}`);
}
