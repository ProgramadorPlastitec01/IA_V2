import 'dotenv/config';
import PrivacyService, { CATEGORIES } from '../services/privacy.js';
import qdrantService from '../services/qdrantService.js';
import citationBuilder from '../services/citationBuilder.js';
import { SYSTEM_MESSAGES } from '../config/systemMessages.js';

console.log('--- Mensajes canónicos ---');
console.log(SYSTEM_MESSAGES);

console.log('\n--- Clasificación de privacidad (salario/pago ampliado) ---');
const testQueries = [
    '¿Cuál es el salario de un operario?',
    '¿Cómo se calcula el pago de horas extra?',
    'Si trabajo un domingo como se liquida el pago',
    '¿Cómo reporto un accidente laboral?',
    '¿Cuánto gano?',
    '¿Cómo solicito vacaciones?',
];
for (const q of testQueries) {
    console.log(`  "${q}" -> ${PrivacyService.classify(q)}`);
}

console.log('\n--- Documentos base (para /api/documents) ---');
const sources = await qdrantService.listDistinctSources();
const names = new Set();
sources.forEach(src => {
    const name = citationBuilder._displayName(src);
    if (name) names.add(name);
});
console.log(Array.from(names).sort((a, b) => a.localeCompare(b, 'es')));
