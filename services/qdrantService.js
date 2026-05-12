import dotenv from 'dotenv';
import embeddingsService from './embeddingsService.js';

dotenv.config();

/**
 * Qdrant Service - Interfaz optimizada para RAG en producción.
 */
class QdrantService {
  constructor() {
    this.url = process.env.QDRANT_URL || 'http://localhost:6333';
    this.collection = process.env.QDRANT_COLLECTION || 'rrhh_docs';
  }

  /**
   * Verifica si la colección existe y la crea usando dimensiones dinámicas.
   * @param {number} [vectorSize] - Opcional, si no se provee se consulta al servicio de embeddings.
   */
  async createCollectionIfNotExists(vectorSize = null) {
    // Dimensión dinámica según el requerimiento crítico
    const finalVectorSize = vectorSize || embeddingsService.getEmbeddingDimension();
    
    return await this._withRetry(async () => {
      const response = await fetch(`${this.url}/collections/${this.collection}`);
      
      if (response.ok) {
        this._log('info', 'Colección verificada', { collection: this.collection });
        return true;
      }

      if (response.status === 404) {
        this._log('info', 'Creando colección', { collection: this.collection, size: finalVectorSize });
        const createResponse = await fetch(`${this.url}/collections/${this.collection}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vectors: {
              size: finalVectorSize,
              distance: 'Cosine'
            }
          })
        });

        if (!createResponse.ok) {
          const error = await createResponse.text();
          throw new Error(`Error al crear colección: ${error}`);
        }

        return true;
      }

      throw new Error(`Error inesperado: ${response.statusText}`);
    }, 'createCollectionIfNotExists');
  }

  /**
   * Inserta un vector con validación estricta de payload.
   */
  async upsertVector(id, vector, payload) {
    // 4. VALIDACIÓN DE PAYLOAD
    if (!payload.texto_original || !payload.fuente) {
      throw new Error('[QdrantService] Payload inválido: Se requiere "texto_original" y "fuente".');
    }

    // Limitar tamaño de texto_original (1000 caracteres) para optimizar memoria
    const textoValidado = payload.texto_original.substring(0, 1000);

    return await this._withRetry(async () => {
      const response = await fetch(`${this.url}/collections/${this.collection}/points?wait=true`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points: [
            {
              id,
              vector,
              payload: {
                ...payload.metadata,
                texto_original: textoValidado,
                fuente: payload.fuente,
                updated_at: new Date().toISOString()
              }
            }
          ]
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Error en upsertVector: ${error}`);
      }

      return await response.json();
    }, 'upsertVector');
  }

  /**
   * Inserta un batch de vectores para ingesta masiva.
   * @param {Array} items - Array de objetos { id, vector, payload }
   */
  async upsertBatch(items) {
    const points = items.map(item => {
      if (!item.payload.texto_original || !item.payload.fuente) {
        throw new Error('[QdrantService] Batch item inválido: falta texto_original o fuente.');
      }
      return {
        id: item.id,
        vector: item.vector,
        payload: {
          metadata: item.payload.metadata || {},
          texto_original: item.payload.texto_original,
          fuente: item.payload.fuente,
          updated_at: new Date().toISOString()
        }
      };
    });

    return await this._withRetry(async () => {
      const response = await fetch(`${this.url}/collections/${this.collection}/points?wait=true`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points })
      });
      if (!response.ok) throw new Error(await response.text());
      return await response.json();
    }, 'upsertBatch');
  }

  /**
   * Búsqueda semántica con reintentos.
   */
  async searchSimilar(vector, topK = 5) {
    return await this._withRetry(async () => {
      const response = await fetch(`${this.url}/collections/${this.collection}/points/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vector,
          limit: topK,
          with_payload: true
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Error en searchSimilar: ${error}`);
      }

      const result = await response.json();
      return result.result;
    }, 'searchSimilar');
  }

  /**
   * Utilidad de reintentos con backoff exponencial.
   */
  async _withRetry(fn, opName, retries = 3) {
    let lastError;
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        const delay = Math.pow(2, i) * 500;
        this._log('warn', `Reintentando operación (${i + 1}/${retries})`, { op: opName, error: error.message });
        await new Promise(res => setTimeout(res, delay));
      }
    }
    this._log('error', `Operación fallida tras reintentos`, { op: opName, error: lastError.message });
    throw lastError;
  }

  /**
   * Logger estructurado.
   */
  _log(level, msg, context = {}) {
    const timestamp = new Date().toISOString();
    console.log(JSON.stringify({ timestamp, level, service: 'QdrantService', msg, ...context }));
  }
}

export default new QdrantService();
