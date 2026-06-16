/**
 * Semantic QA Suite — Plastitec AI (Fase 1.4)
 *
 * Utiliza LLM-as-a-judge para validar la calidad SEMÁNTICA de las respuestas del RAG,
 * evitando falsos positivos (como "PASS" cuando la respuesta invierte una prohibición).
 */

import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import llmService from './services/llmService.js';

const BACKEND_URL = 'http://localhost:3000/api/query';
const REPORTS_DIR = path.join(process.cwd(), 'reports');

const QUERIES = [
    {
        query: "¿Los visitantes pueden conservar ropa de calle debajo del overol?",
        intent: "Saber si la regla permite dejar la ropa de calle",
        expectedPolarity: "POSITIVA",
        keyEntities: ["visitantes", "ropa de calle", "overol", "no manipulan producto"],
        mustNotContain: ["prohibido conservar ropa", "no pueden"]
    },
    {
        query: "¿Los hombres pueden dejarse la barba y el bigote si tienen contacto con el producto?",
        intent: "Saber si se permite vello facial en áreas de proceso",
        expectedPolarity: "NEGATIVA",
        keyEntities: ["barba", "bigote", "prohibido"],
        mustNotContain: ["sí pueden", "está permitido"]
    },
    {
        query: "¿Cómo se deben lavar los uniformes?",
        intent: "Conocer el procedimiento o regla de lavado",
        expectedPolarity: "INFORMATIVA",
        keyEntities: ["cada vez que sean utilizados", "no aplica rotación si hay lavandería externa"],
        mustNotContain: ["no se encuentra información"]
    },
    {
        query: "¿Qué es el SAGRILAFT?",
        intent: "Definición del acrónimo",
        expectedPolarity: "INFORMATIVA",
        keyEntities: ["Sistema", "Riesgo", "Lavado de Activos", "Financiación del Terrorismo"],
        mustNotContain: ["no se encuentra información"]
    },
    {
        query: "¿Cuáles son los objetivos del SG-SST?",
        intent: "Conocer el propósito del sistema de gestión",
        expectedPolarity: "INFORMATIVA",
        keyEntities: ["mejorar condiciones", "salud", "controlar exposición a factores de riesgo"],
        mustNotContain: ["no se encuentra información"]
    },
    {
        query: "¿Está permitido el uso de maquillaje dentro de la planta?",
        intent: "Verificar la regla sobre maquillaje",
        expectedPolarity: "NEGATIVA",
        keyEntities: ["prohibido", "no usar maquillaje de ningún tipo"],
        mustNotContain: ["sí está permitido", "pueden usar maquillaje"]
    },
    {
        query: "¿Qué es el COPASST?",
        intent: "Definición del comité",
        expectedPolarity: "INFORMATIVA",
        keyEntities: ["Comité Paritario de Seguridad y Salud en el Trabajo", "promover cuidado"],
        mustNotContain: ["no se encuentra información", "business process"]
    },
    {
        query: "¿Qué significa BPM en Plastitec? ¿Es Business Process Management?",
        intent: "Aclaración de acrónimo en el diccionario corporativo",
        expectedPolarity: "NEGATIVA a la segunda parte, INFORMATIVA a la primera",
        keyEntities: ["Buenas Prácticas de Manufactura"],
        mustNotContain: ["Sí, es Business Process Management"]
    },
    {
        query: "¿Cuánto tiempo debe durar el lavado de manos?",
        intent: "Saber duración del lavado de manos",
        expectedPolarity: "DESCONOCIDA/NO ENCONTRADA", // Si no está explícito en el contexto
        keyEntities: [],
        mustNotContain: ["inventar un tiempo que no está en el texto"]
    },
    {
        query: "¿Cómo se termina el contrato de aprendiz SENA?",
        intent: "Saber causales de terminación",
        expectedPolarity: "INFORMATIVA o NO ENCONTRADA",
        keyEntities: [],
        mustNotContain: ["inventar causales no mencionadas"]
    }
];

/**
 * Llama al LLM (Llama 3.2) como Juez para evaluar la respuesta del RAG.
 */
async function evaluateResponse(testCase, ragResponse, context) {
    const evalPrompt = `<|system|>
Eres un evaluador de QA estricto. Tu tarea es analizar una respuesta generada por un sistema RAG (Asistente) frente a la consulta del usuario y el contexto documental proporcionado.

Debes evaluar 3 dimensiones y devolver un objeto JSON estricto:
1. "semantic_correctness" (0.0 a 1.0): ¿Responde a la intención real del usuario usando el contexto?
2. "hallucination_score" (0.0 a 1.0): 0.0 es perfecto (sin inventar). 1.0 es que inventó todo. ¿Incluyó información fuera del contexto?
3. "polarity_match" (boolean): ¿La polaridad de la respuesta coincide con la esperada? (ej: si la regla prohíbe algo, ¿el Asistente dijo "No" correctamente en lugar de "Sí"?)
4. "reasoning": Breve justificación.

REGLAS PARA EL EVALUADOR:
- Si la respuesta dice "Sí" al inicio pero luego describe una PROHIBICIÓN, eso es un fallo de polaridad (polarity_match: false).
- Si la respuesta fabrica números, duraciones o datos que no están en el contexto, es alucinación (hallucination_score alto).

Responde ÚNICAMENTE con el objeto JSON, sin formato markdown ni texto adicional.
<|end|>

<|user|>
INTENCIÓN ESPERADA: ${testCase.intent}
POLARIDAD ESPERADA: ${testCase.expectedPolarity}
ENTIDADES CLAVE ESPERADAS: ${testCase.keyEntities.join(', ')}

PREGUNTA ORIGINAL: "${testCase.query}"
RESPUESTA DEL ASISTENTE: "${ragResponse}"

Evalúa y devuelve JSON:
<|end|>

<|assistant|>`;

    try {
        // Use BALANCED_SUMMARY mode for judge to get 768 tokens (avoids JSON truncation)
        const prevMode = llmService.responseMode;
        llmService.responseMode = 'BALANCED_SUMMARY';
        const result = await llmService.generateResponse(evalPrompt, 'llama3.2');
        llmService.responseMode = prevMode;
        
        // Robust JSON extraction: try multiple strategies
        let parsed = null;
        
        // Strategy 1: Find all { } blocks and try to parse each
        const jsonCandidates = result.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
        if (jsonCandidates) {
            for (const candidate of jsonCandidates) {
                try {
                    const obj = JSON.parse(candidate);
                    if (obj.semantic_correctness !== undefined || obj.hallucination_score !== undefined) {
                        parsed = obj;
                        break;
                    }
                } catch (e) { /* try next candidate */ }
            }
        }
        
        // Strategy 2: Greedy match with cleanup
        if (!parsed) {
            const greedyMatch = result.match(/\{[\s\S]*\}/);
            if (greedyMatch) {
                let raw = greedyMatch[0];
                // Remove trailing junk after last }
                const lastBrace = raw.lastIndexOf('}');
                raw = raw.substring(0, lastBrace + 1);
                try { parsed = JSON.parse(raw); } catch (e) { /* fallback below */ }
            }
        }

        if (parsed) {
            return {
                semantic_correctness: parsed.semantic_correctness ?? 0,
                hallucination_score: parsed.hallucination_score ?? 1,
                polarity_match: parsed.polarity_match ?? false,
                reasoning: parsed.reasoning || 'Parsed successfully'
            };
        } else {
            console.warn(`   ⚠️ No se pudo parsear JSON del Juez. Raw: ${result.substring(0, 80)}...`);
            return { semantic_correctness: 0, hallucination_score: 1, polarity_match: false, reasoning: "Fallo al parsear JSON del Juez" };
        }
    } catch (e) {
        console.error(`   ❌ Error en LLM Judge: ${e.message}`);
        return { semantic_correctness: 0, hallucination_score: 1, polarity_match: false, reasoning: "Error de ejecución LLM Judge" };
    }
}

async function runSemanticBenchmark() {
    console.log("🚀 INICIANDO BENCHMARK SEMÁNTICO");
    await fs.mkdir(REPORTS_DIR, { recursive: true });

    let totalScore = 0;
    let falseNegations = 0;
    let hallucinations = 0;
    let totalConfidence = 0;

    let mdReport = `# Reporte Benchmark RAG - Fase 2.1 Retrieval Intelligence Layer\n`;
    mdReport += `Fecha: ${new Date().toISOString()}\n\n`;
    mdReport += `## 1. EVALUACIÓN SEMÁNTICA END-TO-END (LLM-as-a-Judge)\n\n`;

    for (let i = 0; i < QUERIES.length; i++) {
        const tc = QUERIES[i];
        console.log(`\n[${i+1}/${QUERIES.length}] Evaluando: ${tc.query}`);

        try {
            const startReq = Date.now();
            const res = await fetch(BACKEND_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: tc.query,
                    sessionId: 'Semantic-Benchmark-Session',
                    bypass_cache: true   // Force full RAG pipeline, skip SQLite cache
                })
            });

            const data = await res.json();
            const latency = Date.now() - startReq;
            const ragResp = data.response || "ERROR: Sin respuesta";
            
            // Reconstruir el contexto de los sources devueltos (para que el juez sepa qué texto tenía el LLM)
            const retrievedContextSnippet = data.retrievalLogs ? JSON.stringify(data.retrievalLogs) : "Log de retrieval no disponible";

            console.log(`   ⏱️  Latencia: ${latency}ms | Confianza RAG: ${(data.confidence || 0).toFixed(2)}`);
            console.log(`   💬 Respuesta RAG: "${ragResp.substring(0, 100)}..."`);

            const evaluation = await evaluateResponse(tc, ragResp, retrievedContextSnippet);
            
            if (evaluation.polarity_match === false) {
                falseNegations++;
            }
            if (evaluation.hallucination_score > 0.3) {
                hallucinations++;
            }
            totalConfidence += data.confidence || 0;

            console.log(`   ⚖️  Juez: Correctitud: ${evaluation.semantic_correctness} | Alucinación: ${evaluation.hallucination_score} | Polaridad OK: ${evaluation.polarity_match}`);
            console.log(`   📝 Justificación: ${evaluation.reasoning}`);

            totalScore += evaluation.semantic_correctness;
            // Detección heurística rápida de "falsa negación" si el Juez dice que es incorrecto y contiene "no hay información"
            const isRefusal = /no (se encuentra|tengo|hay) información/i.test(ragResp);
            if (isRefusal && evaluation.semantic_correctness < 0.5) {
                falseNegations++;
            }

            // Registrar en Markdown
            mdReport += `### Query ${i+1}: ${tc.query}\n`;
            mdReport += `- **Intención:** ${tc.intent}\n`;
            mdReport += `- **Respuesta RAG:** > ${ragResp.replace(/\n/g, '\n> ')}\n`;
            mdReport += `- **Métricas QA:**\n`;
            mdReport += `  - Semantic Correctness: ${evaluation.semantic_correctness}\n`;
            mdReport += `  - Hallucination Score: ${evaluation.hallucination_score}\n`;
            mdReport += `  - Polarity Match: ${evaluation.polarity_match ? '✅ Sí' : '❌ No'}\n`;
            mdReport += `  - Retrieval Confidence: ${data.confidence}\n`;
            mdReport += `- **Razonamiento del Juez:** ${evaluation.reasoning}\n`;
            mdReport += `- **Latencia Total:** ${latency}ms\n\n`;
            mdReport += `---\n\n`;

        } catch (e) {
            console.error(`   ❌ Error al consultar backend: ${e.message}`);
            mdReport += `### Query ${i+1}: ${tc.query}\n- **ERROR:** ${e.message}\n\n---\n\n`;
        }
    }

    const avgScore = (totalScore / QUERIES.length) * 100;
    const avgConfidence = totalConfidence / QUERIES.length;
    
    console.log(`\n=============================================================`);
    console.log(`🏁 RESULTADOS FINALES BENCHMARK SEMÁNTICO (FASE 2.1)`);
    console.log(`=============================================================`);
    console.log(`Score Promedio:                ${avgScore.toFixed(1)}%`);
    console.log(`Retrieval Confidence Promedio: ${avgConfidence.toFixed(4)}`);
    console.log(`Negaciones Falsas:             ${falseNegations}`);
    console.log(`Alucinaciones Graves:          ${hallucinations}`);

    mdReport += `## 2. RESUMEN EJECUTIVO\n\n`;
    mdReport += `- **Score Semántico Promedio**: ${avgScore.toFixed(1)}%\n`;
    mdReport += `- **Retrieval Confidence Promedio**: ${avgConfidence.toFixed(4)}\n`;
    mdReport += `- **Negaciones Falsas Detectadas**: ${falseNegations}\n`;
    mdReport += `- **Alucinaciones Graves (Score > 0.3)**: ${hallucinations}\n\n`;

    const reportPath = path.join(REPORTS_DIR, 'phase_2_1_retrieval_benchmark.md');
    await fs.writeFile(reportPath, mdReport, 'utf8');
    console.log(`\n✅ Reporte final generado en: ${reportPath}`);
}

runSemanticBenchmark();
