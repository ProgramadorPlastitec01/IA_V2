/**
 * Regresión — Supervivencia Semántica Post-Reranking
 *
 * Verifica que para 3 temas (celular, turno, vacaciones), tanto la query
 * CORTA como la LARGA devuelvan el chunk correcto en el contexto final,
 * incluso cuando la query larga contiene palabras genéricas ("trabajo",
 * "empresa") que antes inflaban chunks irrelevantes vía phrase-boost.
 *
 * Uso: node tests/test_semantic_survival.mjs
 * Prerequisito: Qdrant activo, Ollama activo.
 */

import dotenv from 'dotenv';
dotenv.config();
import ragService from '../services/ragService.js';

// ─── Casos de prueba ──────────────────────────────────────────────────────────

const PAIRS = [
    {
        id: 'C',
        topic: 'celular en planta/oficina',
        short: '¿Puedo usar mi celular en la planta?',
        long:  'Yo trabajo en oficina, puedo tener mi celular cerca de mi puesto de trabajo o esta totalmente prohibido?',
        // El numeral 31 del RIT prohíbe "Usar teléfonos celulares, dispositivos móviles..."
        expectInContext: ['celular', 'telefono', 'teléfono', 'movil', 'móvil'],
    },
    {
        id: 'T',
        topic: 'horario de turno',
        short: '¿Cuál es el horario del turno operativo?',
        long:  '¿En qué horario trabajan los empleados de producción en turnos durante la semana de trabajo en la planta?',
        expectInContext: ['turno', 'jornada', 'operativo', 'produccion'],
    },
    {
        id: 'V',
        topic: 'días de vacaciones',
        short: '¿Cuántos días de vacaciones me corresponden?',
        long:  '¿Cuántos días de vacaciones anuales tienen derecho los trabajadores de la empresa según el reglamento interno de trabajo?',
        expectInContext: ['vacacion', 'vacaciones'],
    },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalize(s) {
    return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function contextHasSignal(context, keywords) {
    const norm = normalize(context || '');
    return keywords.filter(k => norm.includes(normalize(k)));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  Supervivencia Semántica — Queries Cortas vs. Largas         ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

for (const pair of PAIRS) {
    for (const variant of ['short', 'long']) {
        const query = pair[variant];
        const label = `[${pair.id}-${variant === 'short' ? 'S' : 'L'}] "${query.substring(0, 60)}"`;
        process.stdout.write(`${label}...\n`);

        try {
            const result = await ragService.processQuery(query, `test-surv-${pair.id}`);

            // Si la confianza fue < 0.20 la respuesta viene sin context
            if (!result.context && result.chunksUsed === 0) {
                console.log(`  ❌ FAIL — sin contexto (confidence gate o no resultados)`);
                console.log(`     answer: "${(result.answer || '').substring(0, 80)}"`);
                failed++;
                continue;
            }

            const hits = contextHasSignal(result.context, pair.expectInContext);
            if (hits.length > 0) {
                console.log(`  ✅ PASS — contexto contiene: ${hits.join(', ')} | chunks=${result.chunksUsed} conf=${result.confidence?.toFixed(3)}`);
                passed++;
            } else {
                console.log(`  ❌ FAIL — ninguna señal esperada en contexto`);
                console.log(`     esperado: [${pair.expectInContext.join(', ')}]`);
                console.log(`     contexto preview: "${(result.context || '').substring(0, 120)}..."`);
                failed++;
            }
        } catch (e) {
            console.log(`  ❌ ERROR — ${e.message}`);
            failed++;
        }
    }
    console.log();
}

console.log('─'.repeat(60));
console.log(`RESULTADO: ${passed}/${passed + failed} PASS  |  ${failed} FAIL`);
if (failed === 0) {
    console.log('\n✅ Supervivencia semántica OK — queries largas = mismo chunk que queries cortas.\n');
} else {
    console.log('\n⚠️  Hay casos fallidos — revisar ragService.js / rerankingService.js.\n');
}
process.exit(failed > 0 ? 1 : 0);
