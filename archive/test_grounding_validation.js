import ragService from './services/ragService.js';

const testCases = [
    {
        name: "visitantes ropa calle",
        query: "¿Los visitantes pueden conservar ropa de calle debajo del overol?",
        expectRefusal: true // El OCR local no extrajo esta frase
    },
    {
        name: "vello facial",
        query: "¿Los hombres pueden dejarse la barba y el bigote si tienen contacto con el producto?",
        expectRefusal: false
    },
    {
        name: "aprendices sena",
        query: "¿A los aprendices SENA se les paga prestaciones sociales?",
        expectRefusal: false
    },
    {
        name: "sagrilaft",
        query: "¿Qué es el SAGRILAFT?",
        expectRefusal: false
    },
    {
        name: "bpm oficina",
        query: "¿Qué significa BPM en Plastitec? ¿Es Business Process Management?",
        expectRefusal: false
    },
    {
        name: "lavado uniformes",
        query: "¿Cómo se deben lavar los uniformes?",
        expectRefusal: false
    }
];

async function runTests() {
    console.log("🚀 Iniciando Test de Grounding y Extracción Literal v7.0...\n");
    let passed = 0;
    
    for (const test of testCases) {
        console.log(`\n─────────────────────────────────────────────────────────────────`);
        console.log(`[${test.name}]`);
        console.log(`Pregunta : ${test.query}`);
        
        try {
            const res = await ragService.processQuery(test.query);
            console.log(`Respuesta: ${res.answer}`);
            
            const isRefusal = res.answer.toLowerCase().includes('no se encuentra explícitamente') || 
                              res.answer.toLowerCase().includes('lo siento') ||
                              res.answer.toLowerCase().includes('no hay información');
            
            if (isRefusal === test.expectRefusal) {
                console.log(`✅ PASS`);
                passed++;
            } else {
                console.log(`❌ FAIL (Esperaba refusal=${test.expectRefusal}, obtuvo ${isRefusal})`);
            }
        } catch (e) {
            console.error(`❌ ERROR: ${e.message}`);
        }
    }
    
    console.log(`\n🏁 Tests completados: ${passed}/${testCases.length} exitosos.`);
}

runTests();
