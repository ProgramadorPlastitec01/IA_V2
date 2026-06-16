// ─────────────────────────────────────────────────────────────────────────────
// Experimento A/B de prompts (2026-06-12) — NO toca producción.
//
// Hipótesis: el prompt Tri-Estado (CoT XML + reglas de clasificación) es
// demasiado complejo para Llama 3.2 3B y causa sobre-abstención (20 FN en
// benchmark V2 con chunks correctos en mano).
//
// Método (control de variables estricto):
//   1. Para cada query de fn_test_set.json, obtiene el contexto recuperado
//      REAL del pipeline llamando a /api/query (el endpoint expone `context`).
//   2. Envía el MISMO contexto a Ollama con dos prompts:
//        A (control):      Tri-Estado actual, copiado verbatim de llmService.js
//        B (experimental): prompt simplificado sin XML/CoT/clasificación
//      Mismo modelo (llama3.2), temperature 0.1, top_p 0.85, num_predict 300
//      (RESPONSE_MODES.SHORT_ANSWER de producción).
//   3. Clasifica RESPONDIÓ vs DECLINÓ y estima fidelidad al contexto.
//
// Criterio de éxito: B recupera ≥10/20 con contenido fiel → la palanca es el
// prompt. B recupera <5 → la palanca es el modelo (bake-off).
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');

const API_URL    = 'http://localhost:3000/api/query';
const OLLAMA_URL = 'http://localhost:11434/api/generate';
const MODEL      = 'llama3.2';
const OPTIONS    = { temperature: 0.1, top_p: 0.85, num_predict: 300 }; // SHORT_ANSWER prod

const TEST_SET_FILE = path.join(__dirname, 'fn_test_set.json');
const RESULTS_FILE  = path.join(__dirname, '../reports/prompt_ab_results.json');

// ── PROMPT A: Tri-Estado actual (verbatim de llmService.generateRAGResponse) ──
function buildPromptA(context, question) {
    return `<|begin_of_text|><|start_header_id|>system<|end_header_id|>
Eres el motor de Inferencia Tri-Estado de Plastitec AI.
Tu tarea es leer el contexto, analizar la pregunta y decidir si existe información suficiente para responder.

REGLAS DE CLASIFICACIÓN:
- FULL_MATCH: Todas las entidades o condiciones solicitadas están en el contexto y responden a la pregunta.
- PARTIAL_MATCH: El sustantivo principal (ej. "teletrabajo") existe, pero falta un modificador o condición secundaria (ej. "comercial").
- NO_INFORMATION_FOUND: El SUSTANTIVO PRINCIPAL O TEMA CENTRAL (ej. "drones", "España", "SAP") no existe en absoluto en el contexto.

REGLA ESPECIAL — PREGUNTAS COMPUESTAS:
Si la pregunta del empleado contiene múltiples sub-preguntas conectadas con "y", "además", "también" o "asimismo":
1. Evalúa CADA sub-pregunta de forma independiente contra el contexto.
2. Si AL MENOS UNA sub-pregunta tiene respuesta en el contexto:
   → Clasifica como PARTIAL_MATCH (nunca NO_INFORMATION_FOUND).
   → En <respuesta>, responde las partes que SÍ tienen información.
   → Al final indica explícitamente: "No encontré información sobre: [parte sin respuesta]."
3. Solo clasifica NO_INFORMATION_FOUND si NINGUNA sub-pregunta tiene respuesta en el contexto.

FORMATO DE RESPUESTA OBLIGATORIO:
<razonamiento>
- Entidades clave: [X, Y, Z]
- Hallazgos: [Qué encontraste y qué no]
</razonamiento>
<clasificacion>PARTIAL_MATCH</clasificacion>
<respuesta>
[Aquí tu respuesta final.]
</respuesta>
<|end|>

<|user|>
CONTEXTO DOCUMENTAL:
${context}

PREGUNTA DEL EMPLEADO:
"${question}"
<|end|>

<|assistant|>`;
}

// ── PROMPT B: experimental simplificado ──────────────────────────────────────
function buildPromptB(context, question) {
    return `Eres el asistente de RRHH de Plastitec. Responde la pregunta del empleado usando ÚNICAMENTE la información del contexto.

CONTEXTO:
${context}

PREGUNTA: ${question}

Instrucciones:
- Si el contexto contiene información relacionada con la pregunta, respóndela citando lo que dice el documento. Una respuesta parcial es mejor que ninguna.
- Solo responde "NO_INFO" si el contexto no menciona NADA relacionado con el tema de la pregunta.

Respuesta:`;
}

async function callOllama(prompt) {
    const res = await fetch(OLLAMA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, prompt, stream: false, options: OPTIONS }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.response || '';
}

// Clasificación del resultado de Prompt A (mismo parser que llmService)
function classifyA(raw) {
    const clasifMatch = raw.match(/<clasificacion>([\s\S]*?)<\/clasificacion>/i);
    const respMatch   = raw.match(/<respuesta>([\s\S]*?)<\/respuesta>/i);
    const clasificacion = clasifMatch ? clasifMatch[1].trim() : 'NO_INFORMATION_FOUND';
    const respuesta     = respMatch ? respMatch[1].trim() : '';
    const declined = clasificacion === 'NO_INFORMATION_FOUND' || respuesta.length === 0;
    return { declined, clasificacion, respuesta };
}

// Clasificación del resultado de Prompt B
function classifyB(raw) {
    const text = raw.trim();
    const declined = /^NO_INFO\b/i.test(text) || /\bNO_INFO\b/.test(text.substring(0, 60));
    return { declined, respuesta: text };
}

// Fidelidad heurística: ≥1 keyword esperada (si existen) en la respuesta, o
// — si no hay keywords — ≥40% de las palabras de contenido (>4 chars) de la
// respuesta aparecen en el contexto (la respuesta no inventa vocabulario).
function checkFidelity(answer, context, expectedKeywords) {
    if (!answer) return { fiel: false, motivo: 'sin respuesta' };
    const ansLower = answer.toLowerCase();
    const ctxLower = context.toLowerCase();

    if (expectedKeywords && expectedKeywords.length > 0) {
        const hit = expectedKeywords.find(k => ansLower.includes(k.toLowerCase()));
        return hit
            ? { fiel: true, motivo: `keyword esperada: "${hit}"` }
            : { fiel: false, motivo: 'sin keywords esperadas en la respuesta' };
    }

    const contentWords = [...new Set(
        ansLower.replace(/[^\wáéíóúñü\s]/g, ' ').split(/\s+/).filter(w => w.length > 4)
    )];
    if (contentWords.length === 0) return { fiel: false, motivo: 'respuesta sin contenido' };
    const grounded = contentWords.filter(w => ctxLower.includes(w)).length;
    const ratio = grounded / contentWords.length;
    return {
        fiel: ratio >= 0.4,
        motivo: `grounding ${(ratio * 100).toFixed(0)}% (${grounded}/${contentWords.length} palabras en contexto)`,
    };
}

async function main() {
    const testSet = JSON.parse(fs.readFileSync(TEST_SET_FILE, 'utf8'));
    console.log(`🧪 Experimento A/B de prompts — ${testSet.length} queries FN\n`);

    const results = [];
    let aResponded = 0, bResponded = 0, bFaithful = 0;

    for (let i = 0; i < testSet.length; i++) {
        const t = testSet[i];
        console.log(`[${i + 1}/${testSet.length}] ${t.id} — ${t.query}`);

        // 1. Contexto real del pipeline
        let context = null;
        try {
            const res = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: t.query, conversationId: 'ab-test', bypass_cache: true }),
            });
            const data = await res.json();
            context = data.context || null;
        } catch (e) {
            console.log(`   ❌ Error obteniendo contexto: ${e.message}`);
        }

        if (!context) {
            console.log('   ⚠ Sin contexto recuperado (gate rechazó o error) — query omitida');
            results.push({ ...t, error: 'sin contexto del pipeline' });
            continue;
        }

        // 2. Prompt A (control) y Prompt B (experimental) — mismo contexto
        let rawA = '', rawB = '';
        try { rawA = await callOllama(buildPromptA(context, t.query)); }
        catch (e) { console.log(`   ❌ Prompt A: ${e.message}`); }
        try { rawB = await callOllama(buildPromptB(context, t.query)); }
        catch (e) { console.log(`   ❌ Prompt B: ${e.message}`); }

        const a = classifyA(rawA);
        const b = classifyB(rawB);
        const fidelityB = b.declined
            ? { fiel: false, motivo: 'declinó' }
            : checkFidelity(b.respuesta, context, t.expected_keywords);

        if (!a.declined) aResponded++;
        if (!b.declined) bResponded++;
        if (!b.declined && fidelityB.fiel) bFaithful++;

        console.log(`   A (tri-estado): ${a.declined ? 'DECLINÓ (' + a.clasificacion + ')' : 'RESPONDIÓ'}`);
        console.log(`   B (simple):     ${b.declined ? 'DECLINÓ' : 'RESPONDIÓ'} ${!b.declined ? '| fiel: ' + fidelityB.fiel + ' (' + fidelityB.motivo + ')' : ''}\n`);

        results.push({
            id: t.id,
            category: t.category,
            query: t.query,
            expected_keywords: t.expected_keywords,
            contextLength: context.length,
            promptA: { declined: a.declined, clasificacion: a.clasificacion, respuesta: a.respuesta.substring(0, 500), raw: rawA.substring(0, 800) },
            promptB: { declined: b.declined, respuesta: b.respuesta.substring(0, 500), fiel: fidelityB.fiel, fidelidad_motivo: fidelityB.motivo },
        });
    }

    const summary = {
        total: testSet.length,
        promptA_respondio: aResponded,
        promptB_respondio: bResponded,
        promptB_respondio_fiel: bFaithful,
        criterio: bFaithful >= 10 ? 'PALANCA ES EL PROMPT (>=10 recuperados fieles)'
                : bFaithful < 5  ? 'PALANCA ES EL MODELO (<5 recuperados)'
                : 'ZONA GRIS (5-9 recuperados)',
    };

    console.log('═══════════════════════════════════════');
    console.log('📊 RESUMEN A/B');
    console.log(`Prompt A (tri-estado) respondió: ${aResponded}/${testSet.length}`);
    console.log(`Prompt B (simple) respondió:     ${bResponded}/${testSet.length}`);
    console.log(`Prompt B respondió Y fiel:       ${bFaithful}/${testSet.length}`);
    console.log(`Veredicto: ${summary.criterio}`);
    console.log('═══════════════════════════════════════');

    fs.writeFileSync(RESULTS_FILE, JSON.stringify({ summary, results }, null, 2) + '\n');
    console.log(`Resultados completos en: ${RESULTS_FILE}`);
}

main();
