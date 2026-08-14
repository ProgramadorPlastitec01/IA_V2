/**
 * Regresión RAG — Jornada Laboral / Horarios
 *
 * Verifica que queries sobre jornada/horario/horas extras recuperen
 * en top-3 chunks del RIT (CAPITULO VII-VIII) con score > 0.40.
 *
 * Uso: node tests/test_rit_jornada_regression.mjs
 *
 * Prerequisito: Qdrant activo, colección indexada desde knowledge/
 * (incluye RIT_PLASTITEC_01_DE_JULIO_2026_VF.md).
 */

import dotenv from 'dotenv';
dotenv.config();

import embeddingsService from '../services/embeddingsService.js';
import qdrantService from '../services/qdrantService.js';

const QDRANT_URL   = process.env.QDRANT_URL        || 'http://localhost:6333';
const COLLECTION   = process.env.QDRANT_COLLECTION || 'rrhh_docs';
const TOP_K        = 5;
const MIN_SCORE    = 0.40;   // Score mínimo aceptable para chunk relevante
const RIT_MARKER   = 'rit_plastitec';  // substring esperado en fuente del chunk
const RIT_IN_TOP_N = 3;      // Exige que al menos un hit RIT aparezca en los primeros N resultados

// ── Queries de prueba ─────────────────────────────────────────────────────────
const TEST_CASES = [
    {
        id: 'T01',
        query: 'Cuales son las horas laborales para el 2026',
        expectKeywords: ['jornada', 'horas', '42'],
        expectSource: RIT_MARKER,
    },
    {
        id: 'T02',
        query: 'horario de trabajo personal administrativo',
        expectKeywords: ['administrativo', 'horario', 'lunes', 'jueves'],
        expectSource: RIT_MARKER,
    },
    {
        id: 'T03',
        query: 'jornada laboral reduccion ley 2101',
        expectKeywords: ['jornada', 'ley', '2101', 'horas'],
        expectSource: RIT_MARKER,
    },
    {
        id: 'T04',
        query: 'trabajo por turnos plastitec',
        expectKeywords: ['turno', 'turnos', 'jornada', 'sucesiva'],
        expectSource: RIT_MARKER,
    },
    {
        id: 'T05',
        query: 'cuantas horas trabajo semanal',
        expectKeywords: ['semana', 'horas', 'jornada'],
        expectSource: RIT_MARKER,
    },
    {
        id: 'T06',
        query: 'horas extras trabajo nocturno recargo',
        expectKeywords: ['nocturno', 'extra', 'recargo', 'suplementario'],
        expectSource: RIT_MARKER,
    },
    {
        id: 'T07',
        query: 'horario turno operativo producción',
        expectKeywords: ['operativo', 'turno', 'jornada'],
        expectSource: RIT_MARKER,
    },
    {
        id: 'T08',
        query: 'jornada maxima legal horas dia',
        expectKeywords: ['jornada', 'máxima', 'horas', 'diaria'],
        expectSource: RIT_MARKER,
    },
    {
        id: 'T09',
        query: 'descanso remunerado dia sabado dominical',
        expectKeywords: ['descanso', 'remunerado', 'domingo'],
        expectSource: RIT_MARKER,
    },
    {
        id: 'T10',
        query: 'que articulo del reglamento habla del horario de entrada',
        expectKeywords: ['reglamento', 'horario', 'jornada'],
        expectSource: RIT_MARKER,
    },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalize(str) {
    return str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function chunkContainsKeywords(chunkText, keywords) {
    const norm = normalize(chunkText);
    return keywords.filter(kw => norm.includes(normalize(kw)));
}

function sourceIsRIT(fuente) {
    return (fuente || '').toLowerCase().includes(RIT_MARKER);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║  Regresión RAG — Jornada / Horarios / Horas Extras  ║');
    console.log('╚══════════════════════════════════════════════════════╝\n');

    // Verificar Qdrant
    try {
        const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`);
        const data = await res.json();
        const pts  = data.result?.points_count ?? 0;
        console.log(`Qdrant: ${QDRANT_URL} | colección: ${COLLECTION} | puntos: ${pts}\n`);
        if (pts === 0) {
            console.error('❌ Colección vacía — ejecuta option 4 (rebuild_rag.js) primero.');
            process.exit(1);
        }
    } catch (e) {
        console.error(`❌ No se pudo conectar a Qdrant: ${e.message}`);
        process.exit(1);
    }

    let passed = 0;
    let failed = 0;
    const results = [];

    for (const tc of TEST_CASES) {
        process.stdout.write(`[${tc.id}] "${tc.query.substring(0, 50)}"... `);

        try {
            // Generar embedding
            const vector = await embeddingsService.generateEmbedding(tc.query);

            // Buscar en Qdrant
            const hits = await qdrantService.searchSimilar(vector, TOP_K);

            if (!hits || hits.length === 0) {
                console.log('❌ SIN RESULTADOS');
                failed++;
                results.push({ ...tc, status: 'FAIL', reason: 'No results' });
                continue;
            }

            // Evaluar: el RIT debe aparecer en los primeros RIT_IN_TOP_N resultados
            const topN    = hits.slice(0, RIT_IN_TOP_N);
            const allHits = hits; // top-K completo para buscar el mejor chunk RIT
            const ritInTopN = topN.some(h => sourceIsRIT(h.payload?.fuente));

            // Seleccionar el chunk RIT con más keywords coincidentes de todo top-K
            const ritHits = allHits.filter(h => sourceIsRIT(h.payload?.fuente));
            const scoredRITHits = ritHits.map(h => {
                const kw = chunkContainsKeywords(h.payload?.texto_original || '', tc.expectKeywords);
                return { hit: h, kwMatched: kw, pos: allHits.indexOf(h) + 1 };
            });
            scoredRITHits.sort((a, b) => b.kwMatched.length - a.kwMatched.length);
            const bestRIT     = scoredRITHits[0];
            const matchedKw   = bestRIT?.kwMatched ?? [];
            const bestScore   = bestRIT?.hit?.score ?? 0;
            const bestPos     = bestRIT?.pos ?? 99;

            const kwRatio = matchedKw.length / tc.expectKeywords.length;

            if (ritInTopN && bestScore >= MIN_SCORE && kwRatio >= 0.5) {
                console.log(`✅ PASS  score=${bestScore.toFixed(3)}  kw=${matchedKw.length}/${tc.expectKeywords.length}  pos=${bestPos}`);
                passed++;
                results.push({ ...tc, status: 'PASS', score: bestScore, kwMatched: matchedKw.length, pos: bestPos });
            } else {
                const reason = !ritInTopN
                    ? `RIT no en top-${RIT_IN_TOP_N} (fuentes: ${topN.map(h => (h.payload?.fuente || '?').substring(0, 25)).join(', ')})`
                    : bestScore < MIN_SCORE
                    ? `score bajo: ${bestScore.toFixed(3)} < ${MIN_SCORE}`
                    : `kw insuficientes: ${matchedKw.length}/${tc.expectKeywords.length} (${matchedKw.join(',')})`;
                console.log(`❌ FAIL  ${reason}`);
                failed++;
                results.push({ ...tc, status: 'FAIL', reason, score: bestScore });
            }

        } catch (e) {
            console.log(`❌ ERROR: ${e.message}`);
            failed++;
            results.push({ ...tc, status: 'ERROR', reason: e.message });
        }
    }

    // Resumen
    console.log('\n' + '─'.repeat(60));
    console.log(`RESULTADO: ${passed}/${TEST_CASES.length} PASS  |  ${failed} FAIL`);

    if (failed === 0) {
        console.log('\n✅ REGRESIÓN COMPLETA — Top-3 contiene chunks RIT jornada en todos los casos.');
    } else {
        console.log('\n⚠️  Casos fallidos:');
        results.filter(r => r.status !== 'PASS').forEach(r => {
            console.log(`   [${r.id}] ${r.query.substring(0, 50)} → ${r.reason || r.status}`);
        });
        console.log('\nSi el RIT aún no está indexado, ejecuta primero:');
        console.log('  node services/rebuild_rag.js');
    }

    console.log('─'.repeat(60) + '\n');
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('\n❌ Error fatal:', err.message);
    process.exit(1);
});
