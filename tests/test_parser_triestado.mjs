/**
 * Test unitario del parser Tri-Estado (llmService.generateRAGResponse).
 *
 * Casos:
 *   P01 — Salida XML válida → FULL_MATCH, respuesta extraída
 *   P02 — Texto plano "Clasificación: PARTIAL_MATCH / Respuesta: ..." → fallback nivel 1
 *   P03 — Sin clasificación, texto sustancial → fallback nivel 2 (PARTIAL_MATCH)
 *   P04 — NO_INFORMATION_FOUND explícito → se respeta, sin respuesta al usuario
 *
 * Uso: node tests/test_parser_triestado.mjs
 */

import dotenv from 'dotenv';
dotenv.config();

// ─── Importar servicio real y parchear generateResponse ───────────────────────
import llmService from '../services/llmService.js';

let passed = 0;
let failed = 0;

function assert(cond, label, detail = '') {
    if (cond) {
        console.log(`  ✅ ${label}`);
        passed++;
    } else {
        console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`);
        failed++;
    }
}

async function runCase(id, rawLLMOutput, assertions, question = 'pregunta de prueba') {
    console.log(`\n[${id}] LLM output: "${rawLLMOutput.substring(0, 80).replace(/\n/g,' ')}..."`);
    // Sustituir generateResponse para devolver el output de prueba
    const orig = llmService.generateResponse.bind(llmService);
    llmService.generateResponse = async () => rawLLMOutput;

    const result = await llmService.generateRAGResponse(
        question,
        'contexto de prueba',
        null, 0.8, ['doc_test.md']
    );

    llmService.generateResponse = orig;
    assertions(result);
}

// ─── P01: XML válido ───────────────────────────────────────────────────────────
await runCase(
    'P01',
    `<razonamiento>
- Entidades clave: [celular, planta]
- Hallazgos: RIT art.32 regula el uso.
</razonamiento>
<clasificacion>FULL_MATCH</clasificacion>
<respuesta>
El uso del celular en planta está permitido solo en emergencias y descansos.
</respuesta>`,
    (r) => {
        assert(r.jsonFacts?.answer, 'Tiene jsonFacts.answer');
        assert(r.jsonFacts?.answer?.includes('celular'), 'Respuesta contiene "celular"');
        assert(!r.jsonFacts?.error, 'No tiene error NO_INFORMATION_FOUND');
        assert(r.citations?.length > 0 || r.citations !== undefined, 'Campo citations presente');
    }
);

// ─── P02: Texto plano estilo "Clasificación: PARTIAL_MATCH\nRespuesta: ..." ───
await runCase(
    'P02',
    `Razonamiento: el RIT artículo 32 menciona restricciones de celular.
Clasificación: PARTIAL_MATCH
Respuesta: El celular está permitido únicamente en descansos y emergencias según el RIT.`,
    (r) => {
        assert(r.jsonFacts?.answer, 'Fallback nivel 1: tiene jsonFacts.answer');
        assert(r.jsonFacts?.answer?.toLowerCase().includes('celular'), 'Respuesta contiene contenido relevante');
        assert(!r.jsonFacts?.error, 'No descartado como NO_INFORMATION_FOUND');
    }
);

// ─── P03: Sin clasificación, texto sustancial ──────────────────────────────────
await runCase(
    'P03',
    `De acuerdo con el Reglamento Interno de Trabajo de Plastitec, el uso del teléfono celular en las áreas de producción está restringido. Solo se permite en situaciones de emergencia debidamente justificadas o durante los períodos de descanso autorizados por la empresa. El incumplimiento de esta norma puede acarrear sanciones disciplinarias según lo establece el capítulo de prohibiciones del RIT.`,
    (r) => {
        assert(r.jsonFacts?.answer, 'Fallback nivel 2: tiene jsonFacts.answer');
        assert(r.jsonFacts?.answer?.length > 50, 'Respuesta tiene contenido sustancial');
        assert(!r.jsonFacts?.error, 'No descartado como NO_INFORMATION_FOUND');
    }
);

// ─── P04: NO_INFORMATION_FOUND explícito ──────────────────────────────────────
await runCase(
    'P04',
    `<razonamiento>
- Entidades clave: [drones, planta]
- Hallazgos: No se menciona nada sobre drones en el contexto.
</razonamiento>
<clasificacion>NO_INFORMATION_FOUND</clasificacion>
<respuesta></respuesta>`,
    (r) => {
        assert(r.jsonFacts?.error === 'no_information_found', 'NIF explícito → error no_information_found');
        assert(!r.jsonFacts?.answer, 'No hay answer cuando es NIF');
    }
);

// ─── P05: Respuesta con frase contradictoria al final → debe quedar limpia ────
await runCase(
    'P05',
    `<razonamiento>
- Entidades clave: [jornada laboral, horas, 2026]
- Hallazgos: RIT CAPÍTULO VII establece 42 horas semanales.
</razonamiento>
<clasificacion>FULL_MATCH</clasificacion>
<respuesta>
Según el Reglamento Interno de Trabajo de Plastitec, la jornada laboral semanal es de 42 horas conforme a la Ley 2101 de 2021, vigente en 2026. No hay información específica sobre las horas laborales para el año 2026.
</respuesta>`,
    (r) => {
        assert(r.jsonFacts?.answer, 'P05: tiene answer');
        assert(r.jsonFacts?.answer?.includes('42'), 'P05: contiene las 42 horas');
        const tieneFrase = /no\s+hay\s+informaci[oó]n\s+espec[ií]fica/i.test(r.jsonFacts?.answer || '');
        assert(!tieneFrase, 'P05: frase contradictoria eliminada');
    }
);

// ─── P06: Solo hay frase de faltante, sin contenido sustantivo → se conserva ─
await runCase(
    'P06',
    `<razonamiento>
- Entidades clave: [horario verano]
- Hallazgos: No se menciona ningún horario especial de verano en el contexto.
</razonamiento>
<clasificacion>PARTIAL_MATCH</clasificacion>
<respuesta>
No encontré información sobre horarios especiales de verano en los documentos disponibles.
</respuesta>`,
    (r) => {
        // El contenido sin la frase sería < 80 chars → se conserva la respuesta original
        // o llega como NIF (ambas son aceptables; lo importante es que no quede vacío)
        const tieneAlgo = r.jsonFacts?.answer?.length > 0 || r.jsonFacts?.error === 'no_information_found';
        assert(tieneAlgo, 'P06: hay una respuesta o NIF (no vacío)');
    }
);

// ─── P07: Frase legítima — contexto irrelevante, frase cubre query ────────────
// El LLM respondió sobre uniformes (contexto equivocado) y añadió
// "No encontré información sobre: defecar en un recipiente".
// B2 debe detectar que la frase cubre los keywords de la pregunta y el resto NO,
// y escalar a NIF en lugar de mostrar el texto de uniformes.
await runCase(
    'P07',
    `<razonamiento>
- Entidades clave: [BPM, uniformes, defecar, recipiente]
- Hallazgos: El contexto habla de lavado de uniformes, no de higiene corporal.
</razonamiento>
<clasificacion>PARTIAL_MATCH</clasificacion>
<respuesta>
Las reglas del BPM indican que los uniformes deben lavarse con agua caliente y jabón neutro, usando los equipos designados por la empresa. No encontré información sobre: defecar en un recipiente.
</respuesta>`,
    (r) => {
        assert(r.jsonFacts?.error === 'no_information_found', 'P07: frase legítima → NIF');
        const tieneUniforme = (r.jsonFacts?.answer || '').toLowerCase().includes('uniforme');
        assert(!tieneUniforme, 'P07: contenido irrelevante de uniformes NO expuesto');
    },
    'puedo defecar en un recipiente en la planta'   // pregunta real con keywords
);

// ─── P08: Respuesta truncada mid-sentence en "pero" ───────────────────────────
// Simula que el LLM fue cortado por límite de tokens justo en la conjunción "pero".
// El reintento (mock) devuelve lo mismo → _trimToLastSentence debe rescatar el texto.
await runCase(
    'P08',
    `<razonamiento>
- Entidades clave: [horas extras, autorización]
- Hallazgos: RIT Capítulo VIII regula las horas extras.
</razonamiento>
<clasificacion>FULL_MATCH</clasificacion>
<respuesta>
Según el Reglamento Interno de Trabajo, los trabajadores podrán laborar horas extras cuando las necesidades de la empresa lo requieran, pero`,
    (r) => {
        assert(r.jsonFacts?.answer, 'P08: hay respuesta a pesar del truncamiento');
        const text = (r.jsonFacts?.answer || '').trim();
        const endsTruncated = /\b(?:pero|y|o|ni|para|con|de|en)\s*$/i.test(text);
        assert(!endsTruncated, 'P08: no termina en conjunción/preposición');
        assert(text.length > 10, 'P08: respuesta tiene contenido útil');
    }
);

// ─── P09: B2 no deja texto colgante tras recortar frase de faltante ───────────
// Situación: "...podrán solicitarlo, pero no encontré información sobre los plazos."
// B2 recorta "no encontré..." y debe producir una oración completa, no "...pero"
await runCase(
    'P09',
    `<razonamiento>
- Entidades clave: [permiso, plazo]
- Hallazgos: El RIT menciona permisos pero no especifica plazos exactos.
</razonamiento>
<clasificacion>PARTIAL_MATCH</clasificacion>
<respuesta>
Los trabajadores tienen derecho a solicitar permisos remunerados según el Reglamento Interno, pero no encontré información sobre los plazos específicos de respuesta.
</respuesta>`,
    (r) => {
        assert(r.jsonFacts?.answer || r.jsonFacts?.error, 'P09: hay resultado');
        if (r.jsonFacts?.answer) {
            const text = r.jsonFacts.answer.trim();
            const endsTruncated = /\b(?:pero|y|o|ni|para|con|de|en)\s*[,.]?\s*$/i.test(text);
            assert(!endsTruncated, 'P09: B2 no dejó texto colgante tras eliminar frase');
        }
    },
    'cuáles son los plazos para solicitar un permiso'
);

// ─── Resumen ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(60));
console.log(`RESULTADO: ${passed}/${passed + failed} PASS  |  ${failed} FAIL`);
if (failed === 0) {
    console.log('\n✅ PARSER TRI-ESTADO — todos los fallbacks funcionan correctamente.\n');
} else {
    console.log('\n⚠️  Hay casos fallidos — revisar llmService.js parser.\n');
}
process.exit(failed > 0 ? 1 : 0);
