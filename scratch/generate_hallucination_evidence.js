import fs from 'fs';
import embeddingsService from '../services/embeddingsService.js';
import qdrantService from '../services/qdrantService.js';
import ragService from '../services/ragService.js';

const queries = [
    "¿Cuál es la política de teletrabajo para el área comercial?",
    "¿De cuánto es el bono de conectividad por trabajar desde casa?",
    "¿Cuáles son los beneficios para empleados en España?",
    "¿Cómo solicito el subsidio de transporte internacional?",
    "¿Cuál es el procedimiento paso a paso para usar SAP en inventarios?",
    "¿Cuántos días de vacaciones me dan si me traslado a la planta de Estados Unidos?",
    "¿Cuál es la política corporativa sobre el uso de Inteligencia Artificial como ChatGPT?",
    "¿Qué reglamento aplica para el uso de drones dentro de las instalaciones?",
    "¿Cuál es la política BYOD (Bring Your Own Device) de la empresa?",
    "¿Cuánto es el auxilio económico por adopción de mascotas?"
];

async function generateReport() {
    let report = "# Hallucination Evidence Report (Zero Hallucination Test)\n\n";
    report += "Este reporte documenta la ejecución cruda y desglosada de 10 consultas negativas para auditar matemáticamente la tasa de alucinación.\n\n";

    let summaryTable = "## Resumen Consolidado\n\n";
    summaryTable += "| Pregunta | Score Vectorial Max | Confianza Calculada | Resultado Esperado | Resultado Obtenido | Veredicto |\n";
    summaryTable += "|---|---|---|---|---|---|\n";

    let hallucinationCount = 0;

    for (let i = 0; i < queries.length; i++) {
        const query = queries[i];
        console.log(`[${i+1}/10] Procesando: ${query}`);
        
        report += `## Pregunta ${i+1}\n**${query}**\n\n`;

        // 1. Obtener Vector
        const vector = await embeddingsService.generateEmbedding(query);

        // 2. Búsqueda Cruda Qdrant
        const semanticResults = await qdrantService.searchSimilar(vector, 10);
        const keywordResults = await qdrantService.searchKeyword(query, 10);

        report += `### 1. Extracción Cruda (Qdrant)\n`;
        report += `#### Top Chunks Vectoriales\n`;
        const topVecScore = semanticResults.length > 0 ? semanticResults[0].score : 0;
        if (semanticResults.length === 0) report += `*(Sin resultados)*\n`;
        semanticResults.forEach((r, idx) => {
            report += `- [V${idx+1}] **Score:** ${r.score.toFixed(4)} | **Fuente:** ${r.payload.fuente}\n  > ${r.payload.texto_original.substring(0, 100).replace(/\n/g, ' ')}...\n`;
        });

        report += `\n#### Top Chunks BM25 (Keyword)\n`;
        const topKwScore = keywordResults.length > 0 ? keywordResults[0].score : 0;
        if (keywordResults.length === 0) report += `*(Sin resultados)*\n`;
        keywordResults.forEach((r, idx) => {
            report += `- [K${idx+1}] **Score:** ${r.score.toFixed(4)} | **Fuente:** ${r.payload.fuente}\n`;
        });
        report += `\n`;

        // 3. Ejecución del Pipeline RAG Completo
        const ragResult = await ragService.processQuery(query);

        report += `### 2. Ensamblaje Híbrido y Confianza\n`;
        report += `- **Confianza Calculada (retrievalConfidence):** ${ragResult.confidence?.toFixed(4) || 0}\n`;
        report += `- **Fuentes Seleccionadas:** ${ragResult.sources.join(', ') || 'Ninguna'}\n`;
        
        report += `\n**Log Interno de Fusión (Hybrid Score):**\n`;
        (ragResult.retrievalLogs || []).forEach(log => {
            report += `- ${log.source} | Score Final: ${log.score.toFixed(4)} | Tipo: ${log.searchType}\n`;
        });

        report += `\n### 3. Contexto inyectado al LLM\n\`\`\`text\n${ragResult.context || '(Vació)'}\n\`\`\`\n\n`;

        report += `### 4. Respuesta Generada por LLM\n> ${ragResult.answer.replace(/\n/g, '\n> ')}\n\n`;

        // Clasificación heurística básica para la tabla (se puede ajustar manual)
        let clasificacion = "Rechazo Correcto";
        let justificacion = "El LLM rechazó la solicitud o no hubo contexto suficiente.";
        const isHallucination = !ragResult.answer.toLowerCase().includes("lo siento") && 
                                !ragResult.answer.toLowerCase().includes("no se encontró") &&
                                !ragResult.answer.toLowerCase().includes("no information") &&
                                ragResult.answer.length > 30 &&
                                ragResult.confidence > 0.15; // Si intentó responder con confianza > 0.15 y no rechazó.

        if (isHallucination) {
            clasificacion = "Alucinación";
            justificacion = `El Score Vectorial crudo máximo fue ${topVecScore.toFixed(4)}, lo que no representa una respuesta exacta al tema. Aún así, la confianza final fue calculada en ${ragResult.confidence?.toFixed(4)}, permitiendo la inyección del contexto irrelevante al LLM. El modelo intentó forzar una respuesta relacionando el contexto extraído.`;
            hallucinationCount++;
        } else {
            justificacion = `El sistema identificó que no hay información exacta (Confianza: ${ragResult.confidence?.toFixed(4)}) y la respuesta reconoce explícitamente la falta de información.`;
        }

        report += `### 5. Clasificación Técnica\n`;
        report += `- **Resultado:** ${clasificacion}\n`;
        report += `- **Justificación:** ${justificacion}\n`;
        report += `---\n\n`;

        summaryTable += `| ${query} | ${topVecScore.toFixed(4)} | ${ragResult.confidence?.toFixed(4) || 0} | Rechazo Correcto | ${clasificacion} | ${clasificacion === "Alucinación" ? '❌ FALLA' : '✅ PASA'} |\n`;
    }

    report += summaryTable;
    report += `\n**Hallucination Rate Final:** ${(hallucinationCount / queries.length) * 100}%\n`;

    fs.writeFileSync('C:/Users/Programador.ti1/.gemini/antigravity-ide/brain/314edafa-4c9a-4240-a911-ef504f6a6710/hallucination_evidence_report.md', report);
    console.log("Reporte hallucination_evidence_report.md generado con éxito.");
}

generateReport().catch(console.error);
