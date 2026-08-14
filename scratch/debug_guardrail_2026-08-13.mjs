import 'dotenv/config';
import ragService from '../services/ragService.js';

const queries = [
    '¿Cuáles son los beneficios extralegales para pasantes?',
    '¿Existe un programa de pausas activas exclusivo para personal de oficinas?',
];

for (const q of queries) {
    console.log('='.repeat(60));
    console.log('QUERY:', q);
    const result = await ragService.processQuery(q);
    console.log('confidence:', result.confidence, 'chunksUsed:', result.chunksUsed);
    console.log('sources:', result.sources);
    console.log('answer:', result.answer);
}
