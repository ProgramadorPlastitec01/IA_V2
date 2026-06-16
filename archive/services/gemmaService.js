import dotenv from 'dotenv';

dotenv.config();

/**
 * Gemma Service - Integración con modelos locales vía Ollama.
 * Diseñado para flujos RAG con alta resiliencia.
 */
class GemmaService {
  constructor() {
    this.url = process.env.OLLAMA_URL || 'http://localhost:11434';
    this.model = process.env.OLLAMA_MODEL || 'gemma';
    this.timeout = parseInt(process.env.OLLAMA_TIMEOUT) || 180000; // 180s para permitir contextos grandes
    
    this._log('info', 'Servicio Gemma inicializado', { url: this.url, model: this.model });
  }

  /**
   * Genera una respuesta simple a partir de un prompt.
   * @param {string} prompt - El texto de entrada para el modelo.
   * @returns {Promise<string>} - Texto generado por el modelo.
   */
async generateResponse(prompt, modelOverride) {
        if (!prompt) throw new Error('[GemmaService] Prompt vacío no permitido.');
        const modelToUse = modelOverride || this.model;
        return await this._withRetry(async () => {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), this.timeout);
            try {
                const response = await fetch(`${this.url}/api/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: modelToUse,
                        prompt: prompt,
                        stream: false,
                        options: {
                            temperature: 0.1,
                            top_p: 0.9
                        }
                    }),
                    signal: controller.signal
                });
                clearTimeout(id);
                if (!response.ok) {
                    const error = await response.text();
                    throw new Error(`Ollama API Error (${response.status}): ${error}`);
                }
                const data = await response.json();
                return data.response;
            } catch (error) {
                clearTimeout(id);
                if (error.name === 'AbortError') {
                    throw new Error(`Timeout de ${this.timeout}ms excedido en la inferencia de ${modelToUse}.`);
                }
                throw error;
            }
        }, 'generateResponse');
    }

  /**
   * Genera una respuesta basada en contexto (RAG).
   * @param {string} question - La duda del usuario.
   * @param {string} context - Información recuperada de la base vectorial.
   * @returns {Promise<string>}
   */
  async generateRAGResponse(question, context) {
    const ragPrompt = `Eres el Asistente de IA de Plastitec. Tu objetivo es ayudar al empleado usando la información de la empresa.

Contexto de Plastitec:
${context}

Pregunta del empleado:
${question}

Instrucciones:
1. Responde de forma amable y profesional.
2. Usa el contexto proporcionado para dar la respuesta más completa posible.
3. Si la respuesta no es exacta pero el contexto habla del tema, resume la información relevante.
4. Solo indica que no tienes la información si el contexto no tiene relación alguna con la pregunta.

Respuesta detallada:`;

    this._log('info', 'Generando respuesta RAG', { questionLength: question.length, contextLength: context.length });
    
    return await this.generateResponse(ragPrompt);
  }

  /**
   * Utilidad de reintentos con backoff exponencial.
   * @private
   */
  async _withRetry(fn, opName, retries = 3) {
    let lastError;
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        const delay = Math.pow(2, i) * 500;
        this._log('warn', `Reintentando operación (${i + 1}/${retries})`, { 
          op: opName, 
          error: error.message,
          delay: `${delay}ms` 
        });
        await new Promise(res => setTimeout(res, delay));
      }
    }
    this._log('error', `Operación fallida tras reintentos`, { op: opName, error: lastError.message });
    throw lastError;
  }

  /**
   * Pre-carga el modelo en VRAM (Warm-up).
   * Evita el retraso de 30-60s en la primera consulta.
   */
  async warmUp() {
    this._log('info', 'Iniciando warm-up del modelo...', { model: this.model });
    try {
      // Enviamos un prompt mínimo para forzar la carga en VRAM
      await fetch(`${this.url}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: '',
          stream: false,
          options: { num_predict: 1 }
        })
      });
      this._log('info', 'Modelo cargado en VRAM exitosamente.');
      return true;
    } catch (error) {
      this._log('warn', 'Fallo el warm-up (posiblemente Ollama iniciando)', { error: error.message });
      return false;
    }
  }

  /**
   * Mantiene el modelo activo en VRAM.
   */
  async keepAlive() {
    try {
      await fetch(`${this.url}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: '',
          stream: false,
          keep_alive: '5m' // Extiende el tiempo de vida en VRAM
        })
      });
    } catch (e) {}
  }

  /**
   * Logger estructurado para monitoreo en producción.
   * @private
   */
  _log(level, msg, context = {}) {
    const timestamp = new Date().toISOString();
    console.log(JSON.stringify({ 
      timestamp, 
      level, 
      service: 'GemmaService', 
      msg, 
      ...context 
    }));
  }
}

export default new GemmaService();
