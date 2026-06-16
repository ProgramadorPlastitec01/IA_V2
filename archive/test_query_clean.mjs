async function test() {
  try {
    const response = await fetch('http://localhost:3001/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: "¿Cuáles son las normas BPM?" })
    });
    const data = await response.json();
    console.log('Respuesta del servidor:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error en el test:', e.message);
  }
}
test();
