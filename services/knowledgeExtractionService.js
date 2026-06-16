/**
 * knowledgeExtractionService.js
 * Fase 2.4.5 — Capa de Extracción de Conocimiento Estructurado
 *
 * Transforma chunks crudos en conocimiento estructurado:
 * FAQs, Procedimientos, Políticas, Definiciones, Responsabilidades, Restricciones.
 * 
 * Implementa Quality Gate estricto para evitar ruido en la base de conocimiento.
 */

import llmService from './llmService.js';

const SYSTEM_PROMPT = `Eres un experto analista de documentación corporativa. 
Tu trabajo es leer fragmentos de documentos internos de la empresa PLASTITEC y extraer el conocimiento en un formato estructurado y estricto.

REGLAS ABSOLUTAS:
1. NO inventes información. Si el texto no contiene información útil, responde con un arreglo vacío [].
2. Extrae SOLO en los siguientes formatos: "FAQ", "Procedimiento", "Política", "Definición", "Responsabilidad", "Restricción".
3. Toda extracción DEBE incluir la cita textual exacta ("evidencia") de donde salió.
4. Responde ÚNICAMENTE con un JSON válido en formato de Array.

FORMATOS JSON ESPERADOS (puedes extraer varios por texto):

Para FAQ:
{
  "type": "FAQ",
  "pregunta": "¿...?",
  "respuesta": "...",
  "evidencia": "cita exacta del texto"
}

Para Procedimiento:
{
  "type": "Procedimiento",
  "proceso": "Nombre del proceso",
  "pasos": ["Paso 1...", "Paso 2..."],
  "evidencia": "cita exacta"
}

Para Política:
{
  "type": "Política",
  "politica": "Nombre/Tema",
  "descripcion": "...",
  "aplicabilidad": "A quién aplica",
  "evidencia": "cita exacta"
}

Para Definición:
{
  "type": "Definición",
  "concepto": "Término",
  "definicion": "...",
  "evidencia": "cita exacta"
}

Para Responsabilidad:
{
  "type": "Responsabilidad",
  "rol": "Cargo o grupo",
  "responsabilidades": ["Resp 1...", "Resp 2..."],
  "evidencia": "cita exacta"
}

Para Restricción:
{
  "type": "Restricción",
  "regla": "Prohibición o norma",
  "consecuencia": "...",
  "evidencia": "cita exacta"
}

Responde SOLO con el array de JSON. Nada más.`;

export class KnowledgeExtractionService {
    constructor() {
        this.llm = llmService;
        this.discardLogs = [];
    }

    /**
     * Extrae y filtra (Quality Gate) los items de un chunk.
     * @returns {Promise<{ valid: Array, discarded: Array }>}
     */
    async extractFromChunk(chunkText) {
        if (!chunkText || chunkText.length < 100) return { valid: [], discarded: [] };

        const prompt = `${SYSTEM_PROMPT}\n\nExtrae el conocimiento estructurado del siguiente fragmento documental:\n\nTEXTO:\n${chunkText}\n\nRECUERDA: Responde solo con un Array de JSON válido y copia la evidencia exacta.`;

        try {
            const response = await this.llm.generateResponse(prompt);
            
            let cleanResponse = response.trim();
            if (cleanResponse.startsWith('```json')) {
                cleanResponse = cleanResponse.replace(/```json/g, '').replace(/```/g, '').trim();
            }
            if (cleanResponse.startsWith('```')) {
                cleanResponse = cleanResponse.replace(/```/g, '').trim();
            }

            let parsed = [];
            try {
                const jsonObj = JSON.parse(cleanResponse);
                if (Array.isArray(jsonObj)) parsed = jsonObj;
                else if (jsonObj.extracciones && Array.isArray(jsonObj.extracciones)) parsed = jsonObj.extracciones;
                else if (jsonObj.datos && Array.isArray(jsonObj.datos)) parsed = jsonObj.datos;
                else if (jsonObj.knowledge && Array.isArray(jsonObj.knowledge)) parsed = jsonObj.knowledge;
                else if (jsonObj.type) parsed = [jsonObj];
            } catch (e) {
                console.warn('❌ LLM devolvió JSON inválido:', cleanResponse.substring(0, 50));
                return { valid: [], discarded: [] };
            }
            
            return this._applyQualityGate(parsed);
        } catch (error) {
            console.error('❌ Error en LLM Extraction:', error.message);
            return { valid: [], discarded: [] };
        }
    }

    _applyQualityGate(items) {
        const valid = [];
        const discarded = [];

        for (const item of items) {
            let rejectReason = null;

            // 1. Evidencia < 30 caracteres
            if (!item.evidencia || item.evidencia.trim().length < 30) {
                rejectReason = 'Evidencia muy corta o nula (< 30 chars)';
            }
            
            // 2. Contenido vacío o incompleto
            if (!rejectReason) {
                if (item.type === 'FAQ' && (!item.pregunta || !item.respuesta)) rejectReason = 'FAQ incompleta';
                else if (item.type === 'Procedimiento' && (!item.proceso || !item.pasos || item.pasos.length === 0)) rejectReason = 'Procedimiento incompleto';
                else if (item.type === 'Política' && (!item.politica || !item.descripcion)) rejectReason = 'Política incompleta';
                else if (item.type === 'Definición' && (!item.concepto || !item.definicion)) rejectReason = 'Definición incompleta';
                else if (item.type === 'Responsabilidad' && (!item.rol || !item.responsabilidades || item.responsabilidades.length === 0)) rejectReason = 'Responsabilidad incompleta';
                else if (item.type === 'Restricción' && (!item.regla)) rejectReason = 'Restricción sin regla';
            }

            // 3. Título genérico
            if (!rejectReason) {
                const title = (item.pregunta || item.proceso || item.politica || item.concepto || item.rol || item.regla || '').toLowerCase().trim();
                if (title.length < 5 || ['política', 'procedimiento', 'regla', 'nota', 'importante', 'definición', 'general'].includes(title)) {
                    rejectReason = 'Título genérico o ambiguo';
                }
            }

            // 4. Fragmentos inútiles ("RECUERDA", "VER FIGURA", etc.)
            if (!rejectReason) {
                const content = JSON.stringify(item).toLowerCase();
                if (content.includes('ver figura') || content.match(/^"?recuerda:?"?$/)) {
                    rejectReason = 'Fragmento inútil detectado (ej. VER FIGURA)';
                } else if (item.evidencia.trim().match(/^(RECUERDA|IMPORTANTE|NOTA|CONTINÚA):?$/i)) {
                    rejectReason = 'Evidencia es solo un encabezado sin contenido';
                }
            }

            if (rejectReason) {
                discarded.push({ item, reason: rejectReason });
            } else {
                valid.push(item);
            }
        }

        return { valid, discarded };
    }
}
