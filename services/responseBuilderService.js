/**
 * ResponseBuilderService
 * 
 * Toma los hechos crudos en JSON generados por el LLM extractivo y construye
 * respuestas determinísticas en lenguaje natural sin alucinaciones.
 */

class ResponseBuilderService {
    
    /**
     * @param {Object} jsonFacts 
     * @param {string} mode 
     */
    build(jsonFacts, mode) {
        if (!jsonFacts) {
            return "Lo siento, hubo un problema procesando la respuesta. Por favor, intenta nuevamente.";
        }

        // Fallback or Missing Info
        if (jsonFacts.error === 'no_information_found' || jsonFacts.contains_answer === false) {
            return "No se encontró información suficiente en los documentos consultados para responder esta pregunta.";
        }

        try {
            switch (mode) {
                case 'SHORT_ANSWER':
                    return this._buildShortAnswer(jsonFacts);
                case 'DEFINITION':
                    return this._buildDefinition(jsonFacts);
                case 'PROCEDURE':
                    return this._buildProcedure(jsonFacts);
                case 'LIST':
                    return this._buildList(jsonFacts);
                default:
                    return this._buildShortAnswer(jsonFacts);
            }
        } catch (e) {
            console.error('[ResponseBuilderService] Error construyendo respuesta:', e);
            return "Hubo un error al estructurar la respuesta basada en los documentos.";
        }
    }

    _buildShortAnswer(facts) {
        if (!facts.answer && (!facts.list_items || facts.list_items.length === 0)) {
            return "No se pudo extraer una respuesta clara de los documentos.";
        }
        let result = facts.answer ? facts.answer + "\n\n" : "";
        if (facts.list_items && facts.list_items.length > 0) {
            facts.list_items.forEach((item) => {
                result += `• ${item}\n`;
            });
        }
        return result.trim();
    }

    _buildDefinition(facts) {
        if (facts.answer) {
            return facts.answer.trim();
        }
        return this._buildShortAnswer(facts);
    }

    _buildProcedure(facts) {
        if (!facts.list_items || !Array.isArray(facts.list_items) || facts.list_items.length === 0) {
            return this._buildShortAnswer(facts);
        }

        let result = facts.answer ? facts.answer + "\n\n" : "Para realizar este procedimiento, sigue estos pasos:\n\n";
        facts.list_items.forEach((step, idx) => {
            result += `${idx + 1}. ${step}\n`;
        });
        return result.trim();
    }

    _buildList(facts) {
        if (!facts.list_items || !Array.isArray(facts.list_items) || facts.list_items.length === 0) {
            return this._buildShortAnswer(facts);
        }

        let result = facts.answer ? facts.answer + "\n\n" : "De acuerdo con los documentos, los elementos son:\n\n";
        facts.list_items.forEach((item) => {
            result += `• ${item}\n`;
        });
        return result.trim();
    }
}

export default new ResponseBuilderService();
