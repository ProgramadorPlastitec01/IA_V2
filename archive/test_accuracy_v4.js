import ragService from './services/ragService.js';
import dotenv from 'dotenv';

dotenv.config();

const queries = [
    "¿Qué es el COPASST y cuál es su función principal?", // Pregunta larga con sigla
    "¿Cuáles son las reglas de uso de la cofia?",         // Pregunta técnica
    "¿Qué datos están prohibidos solicitar?",             // Pregunta de RRHH
    "trabajador enfermo",                                  // Pregunta corta/keyword
    "¿Qué es el SAGRILAFT?"                                // Nueva sigla
];

async function runTests() {
    console.log("🚀 INICIANDO TEST DE PRECISIÓN RAG V4.0 (Zero-Hallucination)");
    
    for (const q of queries) {
        try {
            const result = await ragService.processQuery(q);
            console.log("\n==================================================");
            console.log(`PREGUNTA: ${q}`);
            console.log(`CONFIANZA: ${(result.confidence * 100).toFixed(1)}%`);
            console.log(`FUENTES: ${result.sources.join(', ')}`);
            console.log(`RESPUESTA:\n${result.answer}`);
            console.log("==================================================\n");
        } catch (err) {
            console.error(`Error en query "${q}":`, err.message);
        }
    }
}

runTests();
