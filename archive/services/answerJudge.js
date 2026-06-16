import llmService from './llmService.js';

/**
 * Hallucination Judge V2
 * Evalúa la respuesta final basándose en grounding, evidencia, polaridad y consistencia.
 * Genera un score global de 0 a 100.
 */
class AnswerJudge {
    
    /**
     * Evalúa la respuesta utilizando LLM-as-a-judge.
     * @param {string} question - La pregunta original
     * @param {string} evidence - La evidencia proporcionada por el Retrieval
     * @param {string} response - La respuesta generada por el pipeline
     * @returns {Promise<object>} - Objeto con métricas (score de 0 a 100, y sub-scores de 0 a 1)
     */
    async evaluate(question, evidence, response) {
        if (!response || response.trim() === '') {
            return {
                score: 0,
                grounding: 0,
                evidence: 0,
                polarity: 0,
                consistency: 0,
                justification: "Respuesta vacía."
            };
        }

        const prompt = `<|start_header_id|>system<|end_header_id|>
Eres un Juez experto en evaluar la calidad de respuestas de un sistema RAG corporativo.
Evalúa la RESPUESTA basándote EXCLUSIVAMENTE en la EVIDENCIA proporcionada, para responder a la PREGUNTA.

Criterios a evaluar (0 = Falla total, 1 = Perfecto):
1. grounding (0 o 1): ¿La respuesta se basa estrictamente en la evidencia sin alucinar o inventar datos?
2. evidence (0 o 1): ¿La respuesta extrajo y utilizó adecuadamente los hechos de la evidencia relevantes para la pregunta? (Si la respuesta es "NO ESPECIFICADO", y la evidencia es irrelevante, es 1).
3. polarity (0 o 1): ¿La respuesta respetó la polaridad de la evidencia? (Ej: Si la evidencia dice prohibido, la respuesta no debe decir permitido).
4. consistency (0 o 1): ¿La respuesta es coherente consigo misma y no fabrica contradicciones absurdas como "detecté una contradicción en mi respuesta"?

Calcula un "score" global de 0 a 100 basado en estos criterios (promedio * 100).
Genera una justificación corta ("justification").

Responde ÚNICAMENTE en JSON válido con este formato:
{
  "grounding": 1,
  "evidence": 1,
  "polarity": 1,
  "consistency": 1,
  "score": 100,
  "justification": "Razonamiento aquí..."
}
<|eot_id|><|start_header_id|>user<|end_header_id|>
PREGUNTA:
"${question}"

EVIDENCIA:
"${evidence}"

RESPUESTA:
"${response}"
<|eot_id|><|start_header_id|>assistant<|end_header_id|>`;

        try {
            // Using a more deterministic model or the default one.
            const result = await llmService.generateResponse(prompt, process.env.OLLAMA_MODEL || 'llama3.2');
            const jsonMatch = result.match(/\{[\s\S]*\}/);
            
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    score: parsed.score || 0,
                    grounding: parsed.grounding || 0,
                    evidence: parsed.evidence || 0,
                    polarity: parsed.polarity || 0,
                    consistency: parsed.consistency || 0,
                    justification: parsed.justification || "Sin justificación."
                };
            } else {
                throw new Error("No se pudo parsear el JSON del juez.");
            }
        } catch (e) {
            console.error(`[AnswerJudge] Error evaluando: ${e.message}`);
            return {
                score: 0,
                grounding: 0,
                evidence: 0,
                polarity: 0,
                consistency: 0,
                justification: `Fallo en la evaluación: ${e.message}`
            };
        }
    }
}

export default new AnswerJudge();
