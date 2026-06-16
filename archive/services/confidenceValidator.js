import fs from 'fs';
import path from 'path';
import polarityValidator from './polarityValidator.js';
import answerVerifier from './answerVerifier.js';
import ragLogger from './ragLogger.js';

const AUDIT_LOG_FILE = path.join(process.cwd(), 'logs', 'validation_audit.jsonl');

/**
 * Registra auditoría de rechazos y alteraciones de validación.
 */
function logAudit(record) {
    try {
        if (!fs.existsSync(path.dirname(AUDIT_LOG_FILE))) {
            fs.mkdirSync(path.dirname(AUDIT_LOG_FILE), { recursive: true });
        }
        record.timestamp = new Date().toISOString();
        fs.appendFileSync(AUDIT_LOG_FILE, JSON.stringify(record) + '\n');
    } catch (e) {
        ragLogger._log('error', 'Fallo al escribir en validation_audit.jsonl', { error: e.message });
    }
}

/**
 * Confidence Validator (Fase 2.4.1)
 * Actúa como orquestador de validación post-generación.
 * Relaja o endurece las reglas de validación basándose en el Retrieval Confidence.
 */
class ConfidenceValidator {
    
    /**
     * @param {string} question 
     * @param {string} evidence 
     * @param {string} generatedResponse 
     * @param {number} retrievalConfidence 
     * @param {object} session 
     */
    async validate(question, evidence, generatedResponse, retrievalConfidence, session) {
        const hasEvidence = evidence && evidence.trim().length > 0;
        const isNotSpecified = generatedResponse.includes('NO ESPECIFICADO');

        // ─── 1. False Negative Detector ─────────────────────────────────────
        if (hasEvidence && retrievalConfidence > 0.70 && isNotSpecified) {
            ragLogger._log('warn', 'FALSE NEGATIVE DETECTADO: El LLM omitió evidencia con alta confianza.');
            logAudit({
                type: 'FALSE_NEGATIVE',
                query: question,
                retrieval_confidence: retrievalConfidence,
                evidence: evidence.substring(0, 500) + '...',
                generated_response: generatedResponse,
                reason: 'El modelo emitió NO ESPECIFICADO a pesar de tener evidencia y confianza > 0.70'
            });
            return { 
                isValid: false, 
                reason: 'FALSE_NEGATIVE', 
                type: 'false_negative' 
            };
        }

        // Si es un "NO ESPECIFICADO" válido (confianza baja o sin evidencia), pasarlo
        if (isNotSpecified) {
            return { isValid: true, finalResponse: generatedResponse };
        }

        // ─── 2. Confidence Calibration Zones ────────────────────────────────

        // ZONA 1: Confianza Plena (0.85 - 1.00)
        if (retrievalConfidence >= 0.85) {
            ragLogger._log('info', 'Confianza Plena (>=0.85). Se acepta respuesta tal cual.');
            return { isValid: true, finalResponse: generatedResponse };
        }

        // ZONA 2: Respuesta Normal (0.60 - 0.84)
        if (retrievalConfidence >= 0.60 && retrievalConfidence < 0.85) {
            ragLogger._log('info', 'Confianza Normal (0.60-0.84). Aplicando validación de polaridad ligera.');
            // Solo bloqueamos por polaridad evidente (no exigimos answerVerifier estricto que causa falsos rechazos)
            const polarityCheck = await polarityValidator.validate(question, evidence, generatedResponse, session);
            if (!polarityCheck.isValid) {
                logAudit({
                    type: 'POLARITY_REJECT',
                    query: question,
                    retrieval_confidence: retrievalConfidence,
                    evidence: evidence.substring(0, 500) + '...',
                    generated_response: generatedResponse,
                    reason: polarityCheck.reason
                });
                return { isValid: false, reason: polarityCheck.reason, type: 'polarity' };
            }
            return { isValid: true, finalResponse: generatedResponse };
        }

        // ZONA 3: Respuesta con Advertencia (0.40 - 0.59)
        if (retrievalConfidence >= 0.40 && retrievalConfidence < 0.60) {
            ragLogger._log('info', 'Confianza Media/Baja (0.40-0.59). Validando y añadiendo advertencia.');
            
            const polarityCheck = await polarityValidator.validate(question, evidence, generatedResponse, session);
            if (!polarityCheck.isValid) {
                 logAudit({
                    type: 'POLARITY_REJECT',
                    query: question,
                    retrieval_confidence: retrievalConfidence,
                    evidence: evidence.substring(0, 500) + '...',
                    generated_response: generatedResponse,
                    reason: polarityCheck.reason
                });
                return { isValid: false, reason: polarityCheck.reason, type: 'polarity' };
            }

            const answerCheck = await answerVerifier.verify(evidence, generatedResponse, session);
            if (!answerCheck.isClean) {
                 logAudit({
                    type: 'HALLUCINATION_REJECT',
                    query: question,
                    retrieval_confidence: retrievalConfidence,
                    evidence: evidence.substring(0, 500) + '...',
                    generated_response: generatedResponse,
                    reason: 'Alucinación detectada: ' + answerCheck.hallucinatedEntities.join(', ')
                });
                return { 
                    isValid: false, 
                    reason: 'Alucinación o entidades inventadas: ' + answerCheck.hallucinatedEntities.join(', '), 
                    type: 'hallucination',
                    entities: answerCheck.hallucinatedEntities
                };
            }

            // Inyectar advertencia
            const warningMsg = "\n\n*(⚠️ Nota: La confianza de la recuperación documental es media. Por favor verifica esta información con el documento original).*";
            let responseWithWarning = generatedResponse;
            if (!generatedResponse.includes('⚠️ Nota:')) {
                responseWithWarning = generatedResponse + warningMsg;
            }

            return { isValid: true, finalResponse: responseWithWarning };
        }

        // ZONA 4: Confianza Baja (< 0.40)
        // Permitimos que la respuesta pase, pero el LLM debería haber dicho "NO ESPECIFICADO"
        // Si no lo hizo, aplicamos todo el rigor.
        ragLogger._log('warn', 'Confianza Baja (<0.40). Aplicando validación estricta total.');
        
        const polarityCheck = await polarityValidator.validate(question, evidence, generatedResponse, session);
        if (!polarityCheck.isValid) {
            logAudit({
                type: 'POLARITY_REJECT',
                query: question,
                retrieval_confidence: retrievalConfidence,
                evidence: evidence.substring(0, 500) + '...',
                generated_response: generatedResponse,
                reason: polarityCheck.reason
            });
            return { isValid: false, reason: polarityCheck.reason, type: 'polarity' };
        }

        const answerCheck = await answerVerifier.verify(evidence, generatedResponse, session);
        if (!answerCheck.isClean) {
            logAudit({
                type: 'HALLUCINATION_REJECT',
                query: question,
                retrieval_confidence: retrievalConfidence,
                evidence: evidence.substring(0, 500) + '...',
                generated_response: generatedResponse,
                reason: 'Alucinación detectada: ' + answerCheck.hallucinatedEntities.join(', ')
            });
            return { 
                isValid: false, 
                reason: 'Alucinación: ' + answerCheck.hallucinatedEntities.join(', '), 
                type: 'hallucination',
                entities: answerCheck.hallucinatedEntities
            };
        }

        return { isValid: true, finalResponse: generatedResponse };
    }
}

export default new ConfidenceValidator();
