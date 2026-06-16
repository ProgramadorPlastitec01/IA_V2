import llmService from './llmService.js';
import ragLogger from './ragLogger.js';

/**
 * Answer Verifier (Fase 2)
 * Valida de forma posterior a la generación si el LLM introdujo alucinaciones
 * o entidades que no estaban presentes en la evidencia.
 */
class AnswerVerifier {
    
    /**
     * Valida la ausencia de alucinaciones usando LLM-as-a-judge.
     * @param {string} evidence - Evidencia extraída
     * @param {string} generatedResponse - Respuesta final generada
     * @param {object} session - Log session
     * @returns {Promise<{ isClean: boolean, hallucinatedEntities: string[] }>}
     */
    async verify(evidence, generatedResponse, session) {
        if (!evidence || evidence.trim() === '' || generatedResponse.includes('NO ESPECIFICADO')) {
            return { isClean: true, hallucinatedEntities: [] };
        }

        const prompt = `<|system|>
Eres un auditor estricto de documentos empresariales. Tu función es verificar si una respuesta contiene información INVENTADA o ASUMIDA que NO esté en la evidencia.

Reglas:
1. Si la respuesta contiene afirmaciones de hechos, políticas, cifras o pasos que no están presentes (o deducibles de forma directa y obvia) en la evidencia, ES UNA ALUCINACIÓN.
2. Responde ÚNICAMENTE en JSON estricto: 
{ 
  "isClean": true/false, 
  "hallucinatedEntities": ["entidad1", "entidad2"] 
}
Si isClean es true, hallucinatedEntities debe ser [].
<|end|>

<|user|>
EVIDENCIA BASE:
"${evidence}"

RESPUESTA A AUDITAR:
"${generatedResponse}"
<|end|>

<|assistant|>`;

        try {
            const result = await llmService.generateResponse(prompt, 'llama3.2');
            const jsonMatch = result.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                ragLogger._log('info', 'Answer Verifier Executed', {
                    isClean: parsed.isClean,
                    hallucinatedEntities: parsed.hallucinatedEntities
                });
                return parsed;
            }
        } catch (e) {
            ragLogger._log('warn', 'Answer Verifier falló, asumiendo limpio', { error: e.message });
        }
        return { isClean: true, hallucinatedEntities: [] };
    }
}

export default new AnswerVerifier();
