import qdrantService from './services/qdrantService.js';

async function testQdrant() {
  console.log('--- Iniciando Prueba de Qdrant Service ---');

  try {
    // 1. Inicializar colección
    console.log('\n1. Verificando colección...');
    await qdrantService.createCollectionIfNotExists(3); // Usamos dimensión 3 para pruebas simples

    // 2. Upsert de un vector de prueba
    console.log('\n2. Insertando vector de prueba...');
    const testId = Date.now();
    const testVector = [0.1, 0.5, 0.9];
    const testPayload = {
      texto_original: 'Este es un texto de prueba para RRHH.',
      fuente: 'RIT-2024',
      metadata: {
        departamento: 'TI',
        autor: 'IA Assistant'
      }
    };

    const upsertResult = await qdrantService.upsertVector(testId, testVector, testPayload);
    console.log('Resultado del Upsert:', JSON.stringify(upsertResult, null, 2));

    // 3. Búsqueda por similitud
    console.log('\n3. Buscando vectores similares...');
    const searchResults = await qdrantService.searchSimilar([0.12, 0.48, 0.88], 1);
    console.log('Resultados de búsqueda:', JSON.stringify(searchResults, null, 2));

    if (searchResults.length > 0 && searchResults[0].id === testId) {
      console.log('\n✅ PRUEBA EXITOSA: El vector recuperado coincide con el insertado.');
    } else {
      console.log('\n⚠️ ADVERTENCIA: Los resultados no son los esperados.');
    }

  } catch (error) {
    console.error('\n❌ ERROR DURANTE LA PRUEBA:', error.message);
    if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
      console.log('\nCONSEJO: Asegúrate de que Qdrant esté corriendo en ' + process.env.QDRANT_URL);
    }
  }
}

testQdrant();
