async function inspect() {
  try {
    const response = await fetch('http://localhost:6333/collections/rrhh_docs/points/scroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 5, with_payload: true })
    });
    const data = await response.json();
    console.log('--- MUESTRA DE DATOS EN QDRANT ---');
    data.result.points.forEach(p => {
      console.log(`ID: ${p.id}`);
      console.log(`Fuente: ${p.payload.fuente}`);
      console.log(`Texto: ${p.payload.texto_original.substring(0, 200)}...`);
      console.log('-----------------------------------');
    });
  } catch (e) {
    console.error('Error:', e.message);
  }
}
inspect();
