/**
 * tests/test_manual_fase30.js
 * Pruebas Manuales — Fase 3.0: Modo Conversacional RRHH
 *
 * Captura para cada pregunta:
 *   - Respuesta generada
 *   - Modo de respuesta seleccionado (SHORT_ANSWER / PROCEDURE / DETAILED_POLICY)
 *   - Evidencia utilizada (fuentes, confianza)
 *   - Evaluación cualitativa: síntesis, tono, omisión de excepciones
 */

import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import intentRoutingService from '../services/intentRoutingService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_URL = 'http://localhost:3000/api/query';
const REPORTS_DIR = path.join(process.cwd(), 'reports');

// ─── Las 10 Preguntas de Validación Manual (Fase 3.0 Balance) ───────────────
const MANUAL_CASES = [
    {
        id: 1,
        pregunta: '¿Puedo hacer horas extras como aprendiz SENA?',
        expected_mode: 'SHORT_ANSWER',
        expected_tone: 'directa',
        criteria: '0 mezcla, 0 reglas inventadas, no citas de artículos'
    },
    {
        id: 2,
        pregunta: '¿Qué datos están prohibidos pedir en entrevista?',
        expected_mode: 'SHORT_ANSWER',
        expected_tone: 'directa',
        criteria: '0 mezcla, 0 reglas inventadas, no citas de artículos'
    },
    {
        id: 3,
        pregunta: '¿Cuál es la sanción por llegada tarde?',
        expected_mode: 'SHORT_ANSWER',
        expected_tone: 'directa',
        criteria: '0 mezcla, 0 reglas inventadas, no citas de artículos'
    },
    {
        id: 4,
        pregunta: '¿Cómo reporto un accidente de trabajo?',
        expected_mode: 'PROCEDURE',
        expected_tone: 'pasos',
        criteria: '0 mezcla de procedimientos ajenos, 0 pasos inventados'
    },
    {
        id: 5,
        pregunta: '¿Qué es el SAGRILAFT?',
        expected_mode: 'DEFINITION',
        expected_tone: 'síntesis',
        criteria: 'Sin falsos negativos, definición sintetizada'
    },
    {
        id: 6,
        pregunta: '¿Qué es el Código de Ética?',
        expected_mode: 'DEFINITION',
        expected_tone: 'síntesis',
        criteria: 'Sin falsos negativos, definición sintetizada'
    },
    {
        id: 7,
        pregunta: '¿Qué debo hacer si observo una conducta irregular?',
        expected_mode: 'PROCEDURE',
        expected_tone: 'pasos',
        criteria: '0 mezcla de procedimientos, pasos literales'
    },
    {
        id: 8,
        pregunta: '¿Quién puede recibir una denuncia?',
        expected_mode: 'SHORT_ANSWER',
        expected_tone: 'directa',
        criteria: 'Lista de responsables sin artículos'
    },
    {
        id: 9,
        pregunta: '¿Qué elementos de protección debo usar?',
        expected_mode: 'LIST',
        expected_tone: 'lista',
        criteria: 'Elementos del documento sin inventar adicionales'
    },
    {
        id: 10,
        pregunta: '¿Qué ocurre si incumplo una norma de seguridad?',
        expected_mode: 'SHORT_ANSWER',
        expected_tone: 'directa',
        criteria: 'Consecuencias de la evidencia sin inventar sanciones'
    }
];

// ─── Utilidades ───────────────────────────────────────────────────────────────
function countWords(text) {
    return text.trim().split(/\s+/).length;
}

function countLines(text) {
    return text.trim().split('\n').length;
}

function detectsArticleCitations(text) {
    return /artículo\s+\d+|art\.\s*\d+|según\s+el\s+art/i.test(text);
}

function detectsJuridicalLanguage(text) {
    return /de conformidad con|en virtud de|conforme al|según lo dispuesto|parágrafo|inciso/i.test(text);
}

function detectsDirectAnswer(text) {
    return /^(sí|no|debes|puedes|está|están|es|son|el\s|la\s|los\s|las\s)/i.test(text.trim());
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function runManualTests() {
    console.log('═'.repeat(72));
    console.log('🧪 PRUEBAS MANUALES — Fase 3.0: Modo Conversacional RRHH');
    console.log('═'.repeat(72));
    console.log(`   Fecha: ${new Date().toISOString()}`);
    console.log(`   Backend: ${BACKEND_URL}\n`);

    const results = [];

    for (const testCase of MANUAL_CASES) {
        console.log(`\n${'─'.repeat(72)}`);
        console.log(`[${testCase.id}/5] ${testCase.pregunta}`);
        console.log(`  Modo esperado: ${testCase.expected_mode}`);
        console.log(`  Criterio:      ${testCase.criteria}`);
        console.log('─'.repeat(72));

        // Pre-clasificar el modo localmente para validación
        const detectedMode = intentRoutingService.classifyResponseType(testCase.pregunta);

        let response = null;
        let error = null;
        const t0 = Date.now();

        try {
            const res = await fetch(BACKEND_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: testCase.pregunta, bypass_cache: true }),
            });
            response = await res.json();
        } catch (err) {
            error = err.message;
        }

        const latency = Date.now() - t0;
        const answer   = response?.response || response?.answer || '';
        const sources  = response?.sources  || [];
        const confidence = response?.confidence || 0;

        // ─── Análisis Cualitativo ──────────────────────────────────────────
        const analysis = {
            words:            countWords(answer),
            lines:            countLines(answer),
            cites_articles:   detectsArticleCitations(answer),
            juridical_lang:   detectsJuridicalLanguage(answer),
            direct_answer:    detectsDirectAnswer(answer),
            mode_correct:     detectedMode === testCase.expected_mode,
            sources:          sources,
            confidence:       confidence,
            latency_ms:       latency,
        };

        // ─── Evaluación ────────────────────────────────────────────────────
        const modeOk      = analysis.mode_correct   ? '✅' : '⚠️ ';
        const directOk    = analysis.direct_answer  ? '✅' : '❌';
        const noJuridical = !analysis.juridical_lang ? '✅' : '⚠️ ';
        const noArticles  = !analysis.cites_articles ? '✅' : '⚠️ ';
        const lengthOk    = analysis.words <= 120    ? '✅' : '⚠️ ';

        console.log(`\n📝 RESPUESTA GENERADA:\n`);
        console.log(answer);

        console.log(`\n📊 ANÁLISIS:`);
        console.log(`   ${modeOk} Modo detectado: ${detectedMode} (esperado: ${testCase.expected_mode})`);
        console.log(`   ${directOk} Respuesta directa (empieza con Sí/No/Debes/...): ${analysis.direct_answer}`);
        console.log(`   ${noJuridical} Sin lenguaje jurídico: ${!analysis.juridical_lang}`);
        console.log(`   ${noArticles} Sin citas de artículos: ${!analysis.cites_articles}`);
        console.log(`   ${lengthOk} Longitud: ${analysis.words} palabras | ${analysis.lines} líneas`);
        console.log(`   📎 Fuentes: ${sources.join(', ') || 'ninguna'}`);
        console.log(`   🔍 Confianza RAG: ${(confidence * 100).toFixed(1)}%`);
        console.log(`   ⏱  Latencia: ${latency}ms`);

        if (error) {
            console.log(`   ❌ ERROR: ${error}`);
        }

        results.push({
            ...testCase,
            detected_mode:    detectedMode,
            answer,
            sources,
            confidence,
            latency_ms:       latency,
            analysis,
            error,
        });
    }

    // ─── Resumen Global ────────────────────────────────────────────────────
    console.log(`\n${'═'.repeat(72)}`);
    console.log('🏁 RESUMEN DE PRUEBAS MANUALES');
    console.log('═'.repeat(72));

    const passed    = results.filter(r => !r.error);
    const modeOk    = results.filter(r => r.analysis.mode_correct).length;
    const directOk  = results.filter(r => r.analysis.direct_answer).length;
    const noJur     = results.filter(r => !r.analysis.juridical_lang).length;
    const noArt     = results.filter(r => !r.analysis.cites_articles).length;
    const shortEnough = results.filter(r => r.analysis.words <= 120).length;

    console.log(`   Pruebas completadas:   ${passed.length}/5`);
    console.log(`   Modo correcto:         ${modeOk}/5`);
    console.log(`   Respuesta directa:     ${directOk}/5`);
    console.log(`   Sin lenguaje jurídico: ${noJur}/5`);
    console.log(`   Sin citas artículos:   ${noArt}/5`);
    console.log(`   Respuesta concisa:     ${shortEnough}/5 (≤120 palabras)`);

    const overallOk = modeOk >= 4 && directOk >= 3 && noJur >= 4;
    console.log(`\n   ${overallOk ? '✅ VALIDACIÓN MANUAL APROBADA' : '❌ VALIDACIÓN MANUAL CON OBSERVACIONES'}`);
    console.log(`   Recomendación: ${overallOk ? 'Proceder con Benchmark Completo (75 preguntas)' : 'Revisar prompt antes de Benchmark'}`);

    // ─── Guardar reporte ───────────────────────────────────────────────────
    await fs.mkdir(REPORTS_DIR, { recursive: true });

    const md = buildMarkdownReport(results, overallOk);
    const reportPath = path.join(REPORTS_DIR, 'manual_test_fase30.md');
    await fs.writeFile(reportPath, md);
    console.log(`\n📁 Reporte guardado en: reports/manual_test_fase30.md`);

    return overallOk;
}

function buildMarkdownReport(results, overallOk) {
    const date = new Date().toISOString();

    const rows = results.map(r => {
        const modeOk  = r.analysis.mode_correct   ? '✅' : '⚠️';
        const dirOk   = r.analysis.direct_answer  ? '✅' : '❌';
        const jurOk   = !r.analysis.juridical_lang ? '✅' : '⚠️';
        const artOk   = !r.analysis.cites_articles ? '✅' : '⚠️';
        const lenOk   = r.analysis.words <= 120    ? '✅' : '⚠️';
        return `| ${r.id} | ${r.pregunta.substring(0, 45)}... | ${r.detected_mode} ${modeOk} | ${dirOk} | ${jurOk} | ${artOk} | ${lenOk} (${r.analysis.words}w) | ${(r.confidence * 100).toFixed(0)}% | ${r.latency_ms}ms |`;
    }).join('\n');

    const details = results.map(r => `
### Caso ${r.id}: ${r.pregunta}

**Modo detectado:** \`${r.detected_mode}\` (esperado: \`${r.expected_mode}\`) ${r.analysis.mode_correct ? '✅' : '⚠️'}

**Confianza RAG:** ${(r.confidence * 100).toFixed(1)}% | **Fuentes:** ${r.sources.join(', ') || 'ninguna'} | **Latencia:** ${r.latency_ms}ms

**Criterio de evaluación:**
> ${r.criteria}

**Respuesta generada:**
${r.answer}

**Análisis:**
- Respuesta directa (Sí/No/Debes...): ${r.analysis.direct_answer ? '✅' : '❌'}
- Sin lenguaje jurídico: ${!r.analysis.juridical_lang ? '✅' : '⚠️ CONTIENE lenguaje jurídico'}
- Sin citas de artículos: ${!r.analysis.cites_articles ? '✅' : '⚠️ CITA artículos'}
- Longitud: ${r.analysis.words} palabras, ${r.analysis.lines} líneas ${r.analysis.words <= 120 ? '✅' : '⚠️ EXCEDE 120 palabras'}
`).join('\n---\n');

    return `# Reporte de Pruebas Manuales — Fase 3.0 Conversacional
> Fecha: ${date}
> Resultado Global: ${overallOk ? '✅ APROBADO — Proceder con Benchmark' : '⚠️ CON OBSERVACIONES — Revisar antes de Benchmark'}

## Resumen por Caso

| # | Pregunta | Modo | Directa | Sin Juridico | Sin Arts | Longitud | Conf. | Lat. |
|---|----------|------|---------|--------------|----------|----------|-------|------|
${rows}

---

## Detalle por Caso
${details}
`;
}

runManualTests().catch(console.error);
