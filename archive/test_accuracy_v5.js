import ragService from './services/ragService.js';
import dotenv from 'dotenv';
dotenv.config();

// ─── Casos de prueba reales del usuario ───────────────────────────────────
const TEST_CASES = [
    {
        id: 'visitantes',
        query: '¿Los visitantes que no manipulan productos pueden conservar ropa de calle y zapatos debajo del overol y las polainas?',
        expectedKeywords: ['visitantes', 'ropa de calle', 'overol', 'polainas'],
        expectedDocs: ['bpm', 'bpmm', 'induccion']
    },
    {
        id: 'lavado_uniformes',
        query: '¿Cómo se deben lavar los uniformes en casa?',
        expectedKeywords: ['uniforme', 'lavado', 'hipoclorito', 'secado'],
        expectedDocs: ['bpm', 'bpmm']
    },
    {
        id: 'cofia',
        query: '¿Cómo debe realizarse el cambio de cofia y escafandra entre áreas?',
        expectedKeywords: ['cofia', 'escafandra'],
        expectedDocs: ['bpm', 'bpmm', 'induccion']
    },
    {
        id: 'maquillaje',
        query: '¿Está permitido el uso de maquillaje dentro de la planta?',
        expectedKeywords: ['maquillaje'],
        expectedDocs: ['bpm', 'bpmm']
    },
    {
        id: 'copasst',
        query: '¿Qué es el COPASST?',
        expectedKeywords: ['copasst'],
        expectedDocs: ['induccion', 'rit']
    },
    {
        id: 'sagrilaft',
        query: '¿Qué es el SAGRILAFT?',
        expectedKeywords: ['sagrilaft'],
        expectedDocs: []
    },
    {
        id: 'datos_prohibidos',
        query: '¿Qué datos están prohibidos solicitar?',
        expectedKeywords: ['datos', 'prohibidos'],
        expectedDocs: ['etica', 'rit']
    },
    {
        id: 'aprendiz_sena',
        query: '¿Cómo se termina el contrato de aprendiz SENA?',
        expectedKeywords: ['aprendiz', 'sena', 'contrato'],
        expectedDocs: ['rit', 'reglamento']
    },
    {
        id: 'lavado_manos',
        query: '¿Cuánto tiempo debe durar el lavado de manos?',
        expectedKeywords: ['lavado', 'manos', 'tiempo'],
        expectedDocs: ['bpm', 'induccion']
    }
];

// ─── Evaluación ──────────────────────────────────────────────────────────
async function runTests() {
    console.log('\n' + '═'.repeat(65));
    console.log('  🧪 TEST DE PRECISIÓN RAG v5.0 — Plastitec');
    console.log('═'.repeat(65));

    let passed = 0, failed = 0, noInfo = 0;

    for (const tc of TEST_CASES) {
        try {
            const result = await ragService.processQuery(tc.query);

            const sourcesLower = (result.sources || []).map(s => s.toLowerCase());
            const docHit = tc.expectedDocs.length === 0
                ? true
                : tc.expectedDocs.some(d => sourcesLower.some(s => s.includes(d)));

            const noInfoResponse = result.answer.toLowerCase().includes('no se encuentra') ||
                                   result.answer.toLowerCase().includes('no encuentro');

            const status = noInfoResponse ? '⚪ NO_INFO' : (docHit ? '✅ PASS' : '⚠️  WRONG_DOC');
            if (noInfoResponse) noInfo++;
            else if (docHit) passed++;
            else failed++;

            console.log('\n' + '─'.repeat(65));
            console.log(`[${tc.id}] ${status}`);
            console.log(`Pregunta  : ${tc.query}`);
            console.log(`Confianza : ${(result.confidence * 100).toFixed(1)}%`);
            console.log(`Keywords  : [${(result.keywords || []).join(', ')}]`);
            console.log(`Chunks    : ${result.chunksUsed || 0}`);
            console.log(`Fuentes   : ${(result.sources || []).join(' | ') || '—'}`);
            console.log(`Respuesta : ${result.answer.substring(0, 300)}${result.answer.length > 300 ? '…' : ''}`);
        } catch (err) {
            failed++;
            console.error(`[${tc.id}] 💥 ERROR: ${err.message}`);
        }
    }

    console.log('\n' + '═'.repeat(65));
    console.log(`  📊 RESULTADO FINAL: ✅ ${passed} PASS | ⚪ ${noInfo} NO_INFO | ⚠️  ${failed} WRONG`);
    console.log(`  📈 Precisión: ${((passed / TEST_CASES.length) * 100).toFixed(1)}%`);
    console.log('═'.repeat(65) + '\n');
}

runTests();
