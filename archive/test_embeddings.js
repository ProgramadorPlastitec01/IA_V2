import embeddingsService from './services/embeddingsService.js';

async function testEmbeddings() {
  console.log('\n--- Iniciando Prueba de Embeddings Service ---\n');

  try {
    const textToEmbed = 'Este es un documento de prueba para validar el servicio de embeddings.';
    console.log(`Texto a procesar: "${textToEmbed}"`);
    console.log(`Proveedor configurado: ${process.env.EMBEDDINGS_PROVIDER || 'openai'}`);
    
    // Generar embedding
    const vector = await embeddingsService.generateEmbedding(textToEmbed);
    
    if (vector && Array.isArray(vector)) {
      console.log('\n✅ PRUEBA EXITOSA: Embedding generado correctamente.');
      console.log(`- Dimensión del vector: ${vector.length}`);
      console.log(`- Muestra (primeros 5 valores): [${vector.slice(0, 5).map(v => v.toFixed(4)).join(', ')}, ...]`);
    } else {
      console.log('\n⚠️ ADVERTENCIA: El resultado no es un vector válido.');
    }

  } catch (error) {
    console.error('\n❌ ERROR DURANTE LA PRUEBA:', error.message);
    if (error.message.includes('401') || error.message.includes('API_KEY')) {
      console.log('\nCONSEJO: Verifica que tu OPENAI_API_KEY en .env sea válida.');
    }
  }
}

testEmbeddings();
