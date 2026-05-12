import ragService from '../services/ragService.js';
import intentRoutingService from '../services/intentRoutingService.js';

async function testIntents() {
    const queries = [
        "¿Cuál es la misión de Plastitec?",
        "Dime 5 normas de seguridad",
        "¿Cuántos días de vacaciones tengo?",
        "¿Qué fabrica la empresa?",
        "¿Qué dice sobre EPP?"
    ];

    console.log("=== TEST DE RUTEOS POR INTENCIÓN ===\n");

    for (const q of queries) {
        console.log(`\n❓ PREGUNTA: "${q}"`);
        const result = await ragService.processQuery(q);
        
        const intent = intentRoutingService.detectIntent(q);
        console.log(`✅ INTENSIÓN DETECTADA: ${intent.toUpperCase()}`);
        console.log(`📄 FUENTE PRINCIPAL: ${result.qdrantResults[0]?.payload?.fuente}`);
        console.log(`🤖 RESPUESTA (Primeros 150 chars): ${result.answer.substring(0, 150)}...`);
        console.log("--------------------------------------------------");
    }
}

testIntents().catch(console.error);
