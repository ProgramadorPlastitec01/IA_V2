import llmService from './llmService.js';
import ragLogger from './ragLogger.js';

/**
 * Polarity Validator (Fase 2)
 * Se encarga de validar si la polaridad semántica (Sí/No, Permitido/Prohibido)
 * de la respuesta generada coincide con la polaridad de la evidencia extraída.
 */
class PolarityValidator {
    
    /**
     * Valida la polaridad usando LLM-as-a-judge enfocado exclusivamente en intención obligatoria/prohibitiva.
     * @param {string} question - Pregunta original
     * @param {string} evidence - Evidencia extraída
     * @param {string} generatedResponse - Respuesta preliminar generada
     * @param {object} session - Log session
     * @returns {Promise<{ isValid: boolean, reason: string }>}
     */
    async validate(question, evidence, generatedResponse, session) {
        if (!evidence || evidence.trim() === '' || generatedResponse.includes('NO ESPECIFICADO')) {
            return { isValid: true, reason: 'N/A' };
        }

        const prompt = `<|start_header_id|>system<|end_header_id|>
Eres un validador estricto de polaridad lógica. Tu única función es detectar si una RESPUESTA CONTRADICE DIRECTAMENTE la EVIDENCIA en términos de permisos, obligaciones o prohibiciones.

Reglas:
1. Si la evidencia dice "Prohibido" y la respuesta dice "Permitido" o "Sí", devuelve isValid: false.
2. Si la evidencia dice "Debe hacer" y la respuesta dice "No debe hacer", devuelve isValid: false.
3. Si la pregunta no es de polaridad (ej. "Qué es X") o si la respuesta es una explicación válida, devuelve isValid: true.
4. Si la respuesta dice "NO ESPECIFICADO EN EL DOCUMENTO" y la evidencia no contiene la respuesta directa, devuelve isValid: true.
5. NO asumas contradicción por falta de información.
6. Responde ÚNICAMENTE en JSON: { "isValid": true/false, "reason": "Justificación corta" }

Ejemplos:
- E: "Se prohíbe el uso de joyas." / R: "Sí, puedes usar joyas." -> {"isValid": false, "reason": "Contradice prohibición de joyas"}
- E: "Se prohíbe el uso de joyas." / R: "No, no está permitido el uso de joyas." -> {"isValid": true, "reason": "Confirma la prohibición"}
<|eot_id|><|start_header_id|>user<|end_header_id|>
EVIDENCIA:
"${evidence}"

PREGUNTA:
"${question}"

RESPUESTA A EVALUAR:
"${generatedResponse}"
<|eot_id|><|start_header_id|>assistant<|end_header_id|>`;

        try {
            const result = await llmService.generateResponse(prompt, 'llama3.2');
            const jsonMatch = result.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                ragLogger._log('info', 'Polarity Validation Executed', {
                    isValid: parsed.isValid,
                    reason: parsed.reason
                });
                return parsed;
            }
        } catch (e) {
            ragLogger._log('warn', 'Polarity Validator falló, aprobando por defecto', { error: e.message });
        }
        return { isValid: true, reason: 'Fallback to true' };
    }
}

export default new PolarityValidator();
