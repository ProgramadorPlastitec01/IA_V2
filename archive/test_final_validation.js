import ragService from './services/ragService.js';
import fs from 'fs';

const testCases = [
    {
        name: "visitantes ropa de calle",
        query: "¿Los visitantes que no manipulan productos pueden conservar ropa de calle y zapatos debajo del overol?",
        expectedKeywords: ['ropa de calle', 'overol', 'zapatos', 'visitantes', 'sí']
    },
    {
        name: "vello facial hombres",
        query: "¿Los hombres pueden dejarse la barba y el bigote si tienen contacto directo con el producto?",
        expectedKeywords: ['barba', 'bigote', 'prohibido', 'no']
    },
    {
        name: "SAGRILAFT",
        query: "¿Qué significa SAGRILAFT y qué es?",
        expectedKeywords: ['sistema', 'autocontrol', 'gestión', 'riesgo', 'lavado de activos', 'financiación', 'terrorismo']
    },
    {
        name: "lavado uniformes",
        query: "¿Cómo se deben lavar los uniformes en casa? Dame el procedimiento.",
        expectedKeywords: ['agua', 'jabón', 'hipoclorito', 'minutos', 'bolsa']
    },
    {
        name: "contrato aprendiz SENA",
        query: "¿A los aprendices SENA se les paga prestaciones sociales?",
        expectedKeywords: ['prestaciones', 'sociales', 'no', 'contrato de aprendizaje']
    },
    {
        name: "BPM oficina",
        query: "¿Qué significa BPM en Plastitec? ¿Es Business Process Management?",
        expectedKeywords: ['buenas prácticas de manufactura', 'no', 'plastitec']
    },
    {
        name: "cambio de cofia y escafandra",
        query: "¿Cuándo se debe cambiar la cofia y la escafandra?",
        expectedKeywords: ['cambio', 'diario', 'sucio', 'deterioro', 'turno']
    }
];

function checkAnswerCorrectness(answer, expectedKeywords) {
    const ansLower = answer.toLowerCase();
    
    if (ansLower.includes("no hay información") || 
        ansLower.includes("no se encuentra explícitamente") ||
        ansLower.includes("lo siento") ||
        ansLower.includes("no se especifica")) {
        return "INCORRECTO (No hay información / Falso Negativo)";
    }
    
    if (ansLower.includes("según conocimiento general") ||
        ansLower.includes("inteligencia artificial") ||
        ansLower.includes("en general")) {
        return "INCORRECTO (Alucinación / Conocimiento Externo)";
    }
    
    let matches = 0;
    for (const kw of expectedKeywords) {
        // match flexibility
        if (ansLower.includes(kw)) {
            matches++;
        } else {
            // Try matching variations or words
            const parts = kw.split(' ');
            if (parts.length > 1 && parts.some(p => ansLower.includes(p))) {
                matches += 0.5;
            }
        }
    }
    
    const coverage = matches / expectedKeywords.length;
    if (coverage >= 0.7) return "CORRECTO";
    if (coverage >= 0.3) return "PARCIAL";
    
    return "INCORRECTO (Respuesta vaga o incorrecta)";
}

async function runValidation() {
    console.log("=========================================================");
    console.log("  RAG END-TO-END VALIDATION (POST-HYBRID OCR)");
    console.log("=========================================================\n");
    
    let retrievalCorrect = 0;
    let generationCorrect = 0;
    let partialGeneration = 0;
    let errors = [];

    for (const test of testCases) {
        console.log(`\n---------------------------------------------------------`);
        console.log(`📝 PRUEBA: ${test.name.toUpperCase()}`);
        console.log(`❓ PREGUNTA: ${test.query}`);
        
        try {
            const res = await ragService.processQuery(test.query);
            
            console.log(`\n🔍 CHUNKS RECUPERADOS: ${res.chunksUsed}`);
            if (res.chunksUsed > 0) {
                console.log(`📄 FUENTES: ${res.sources.join(', ')}`);
            } else {
                console.log(`📄 FUENTES: Ninguna`);
            }
            
            console.log(`\n🤖 RESPUESTA FINAL:`);
            console.log(`${res.answer}`);
            
            console.log(`\n📊 CONFIDENCE SCORE: ${(res.confidence * 100).toFixed(1)}%`);
            
            const resultStatus = checkAnswerCorrectness(res.answer, test.expectedKeywords);
            console.log(`\n🟢 CLASIFICACIÓN: ${resultStatus}`);
            
            // Evaluaciones
            if (res.chunksUsed > 0) retrievalCorrect++;
            if (resultStatus === "CORRECTO") {
                generationCorrect++;
            } else if (resultStatus === "PARCIAL") {
                partialGeneration++;
                errors.push({ name: test.name, reason: resultStatus });
            } else {
                errors.push({ name: test.name, reason: resultStatus });
            }
            
        } catch (e) {
            console.error(`❌ ERROR CRÍTICO: ${e.message}`);
            errors.push({ name: test.name, reason: `Excepción: ${e.message}` });
        }
    }
    
    console.log(`\n=========================================================`);
    console.log(`  REPORTE FINAL DE VALIDACIÓN`);
    console.log(`=========================================================`);
    console.log(`🎯 Precisión Retrieval : ${((retrievalCorrect / testCases.length) * 100).toFixed(1)}% (${retrievalCorrect}/${testCases.length} encontraron contexto)`);
    console.log(`🧠 Precisión Generación: ${((generationCorrect / testCases.length) * 100).toFixed(1)}% (Completamente correctos)`);
    if (partialGeneration > 0) {
        console.log(`   (Aciertos parciales : ${partialGeneration})`);
    }
    
    console.log(`\n⚠️  Errores restantes:`);
    if (errors.length === 0) {
        console.log(`   ¡Ninguno! Sistema 100% estable y preciso.`);
    } else {
        errors.forEach(e => {
            console.log(`   - [${e.name}]: ${e.reason}`);
        });
    }
    console.log(`=========================================================\n`);
}

runValidation();
