import ragService from './services/ragService.js';
import dotenv from 'dotenv';

dotenv.config();

const queries = [
    "¿Cuál es la misión de Plastitec?",
    "¿Qué es el COPASST?",
    "¿Qué componentes integran la salud integral?",
    "¿Cuáles son las reglas de uso de la cofia?",
    "¿Qué datos están prohibidos solicitar?",
    "¿Cuáles son los objetivos del SG-SST?"
];

async function runTests() {
    console.log("🚀 INICIANDO TEST DE PRECISIÓN RAG V3.0");
    
    for (const q of queries) {
        try {
            const result = await ragService.processQuery(q);
            console.log("\n==================================================");
            console.log(`PREGUNTA: ${q}`);
            console.log(`CONFIANZA: ${(result.confidence * 100).toFixed(1)}%`);
            console.log(`FUENTES: ${result.sources.join(', ')}`);
            console.log(`RESPUESTA: ${result.answer}`);
            console.log("==================================================\n");
        } catch (err) {
            console.error(`Error en query "${q}":`, err.message);
        }
    }
}

runTests();
