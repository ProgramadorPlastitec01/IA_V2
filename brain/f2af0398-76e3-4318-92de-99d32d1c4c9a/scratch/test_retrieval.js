import ragService from '../../../services/ragService.js';

async function testRetrieval() {
    const testQueries = [
        "Dime 5 normas de seguridad",
        "Qué dice sobre EPP",
        "Cuáles son las reglas de seguridad",
        "Qué pasa si incumplo normas SST",
        "Normas para uso de maquinaria"
    ];

    console.log('=== TEST DE RETRIEVAL RAG ===\n');

    for (const query of testQueries) {
        console.log(`\n❓ PREGUNTA: "${query}"`);
        console.log('-'.repeat(40));
        
        try {
            const result = await ragService.processQuery(query);
            
            console.log(`🔍 Query Expandida: "${result.expandedQuery}"`);
            console.log(`📦 Chunks usados: ${result.chunksUsed}`);
            
            if (result.qdrantResults && result.qdrantResults.length > 0) {
                console.log('\n--- TOP 3 RESULTADOS QDRANT ---');
                result.qdrantResults.slice(0, 3).forEach((r, i) => {
                    console.log(`[${i+1}] Score: ${r.score.toFixed(4)} | Fuente: ${r.payload.fuente}`);
                    console.log(`    Contenido: ${r.payload.texto_original.substring(0, 150)}...`);
                });
            } else {
                console.log('❌ No se encontraron resultados en Qdrant.');
            }

            if (result.answer) {
                console.log('\n🤖 RESPUESTA GEMMA:');
                console.log(result.answer);
            } else if (result.error === 'no_context') {
                console.log('\n❌ ERROR: No se encontró contexto suficiente (Min Score 0.40)');
            }

            console.log('\n' + '='.repeat(60));
        } catch (error) {
            console.error(`❌ Error procesando query "${query}":`, error.message);
        }
    }
}

testRetrieval().catch(err => console.error('Error fatal:', err));
