// Benchmark del nuevo modelo mxbai-embed-large
async function benchmarkEmbedding() {
    const OLLAMA_URL = 'http://localhost:11434';
    const MODEL = 'mxbai-embed-large';
    const testTexts = [
        'El COPASST es el Comité Paritario de Seguridad y Salud en el Trabajo.',
        'Los visitantes que no manipulan productos pueden conservar ropa de calle debajo del overol.',
        'El lavado de manos debe realizarse correctamente según las normas BPM.',
        'El SAGRILAFT es el sistema de autocontrol y gestión del riesgo de lavado de activos.',
        'Los objetivos del SG-SST incluyen la prevención de accidentes y enfermedades laborales.',
    ];

    console.log(`\n🔬 BENCHMARK: ${MODEL}`);
    console.log('='.repeat(50));

    let totalMs = 0;
    let dimension = null;

    for (let i = 0; i < testTexts.length; i++) {
        const start = Date.now();
        const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: MODEL, prompt: testTexts[i] }),
        });
        const data = await response.json();
        const elapsed = Date.now() - start;
        totalMs += elapsed;

        const emb = data.embedding || [];
        if (!dimension) dimension = emb.length;

        console.log(`  [${i+1}] ${elapsed}ms — dim: ${emb.length} — texto: "${testTexts[i].substring(0, 50)}..."`);
    }

    console.log('\n📊 RESULTADO:');
    console.log(`  Dimensión vectorial: ${dimension}`);
    console.log(`  Tiempo promedio:     ${(totalMs / testTexts.length).toFixed(0)} ms`);
    console.log(`  Tiempo total:        ${totalMs} ms`);
    console.log('='.repeat(50));
}

benchmarkEmbedding().catch(console.error);
