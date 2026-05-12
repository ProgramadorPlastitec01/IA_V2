import dotenv from 'dotenv';

dotenv.config();

/**
 * Embeddings Service
 * Provee una interfaz desacoplada para generar embeddings de texto usando Ollama localmente.
 */
class EmbeddingsService {
  constructor() {
    this.provider = process.env.EMBEDDINGS_PROVIDER || 'ollama';
    
    // Configuración para Ollama
    this.ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    this.ollamaModel = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
    
    if (this.provider === 'ollama') {
      this._log('info', 'Inicializado', { provider: 'Ollama', model: this.ollamaModel, url: this.ollamaUrl });
    } else {
      this._log('warn', `Proveedor ${this.provider} configurado, pero el servicio fue modificado para usar Ollama de forma predeterminada.`);
    }
  }

  /**
   * Retorna la dimensión del vector según el modelo actual.
   * nomic-embed-text genera vectores de 768 dimensiones.
   * @returns {number}
   */
  getEmbeddingDimension() {
    return parseInt(process.env.LOCAL_EMBEDDING_DIMENSION) || 768;
  }

  /**
   * Genera uno o varios embeddings a partir de texto.
   * @param {string|string[]} input - Texto o array de textos.
   * @returns {Promise<number[]|number[][]>} - Vector o array de vectores.
   */
  async generateEmbedding(input) {
    if (!input || (Array.isArray(input) && input.length === 0)) {
      throw new Error('[EmbeddingsService] Entrada inválida: Se requiere texto o array de textos.');
    }

    return await this._withRetry(async () => {
      return await this._generateOllamaEmbedding(input);
    }, 'generateEmbedding');
  }

  /**
   * Implementación para Ollama.
   * Realiza un POST a /api/embeddings.
   * @private
   */
  async _generateOllamaEmbedding(input) {
    const isArray = Array.isArray(input);
    const texts = isArray ? input : [input];
    const embeddings = [];

    for (const text of texts) {
      const response = await fetch(`${this.ollamaUrl}/api/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.ollamaModel,
          prompt: text,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.embedding) {
        throw new Error('No se recibió embedding en la respuesta de Ollama');
      }

      embeddings.push(data.embedding);
    }

    return isArray ? embeddings : embeddings[0];
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
        this._log('warn', `Reintentando operación (${i + 1}/${retries})`, { op: opName, error: error.message, delay: `${delay}ms` });
        await new Promise(res => setTimeout(res, delay));
      }
    }
    this._log('error', `Operación fallida tras ${retries} intentos`, { op: opName, error: lastError?.message });
    throw lastError;
  }

  /**
   * Logger estructurado simple.
   * @private
   */
  _log(level, msg, context = {}) {
    const timestamp = new Date().toISOString();
    console.log(JSON.stringify({ timestamp, level, service: 'EmbeddingsService', msg, ...context }));
  }
}

export default new EmbeddingsService();
