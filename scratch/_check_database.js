import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";
import { diceCoefficient } from "dice-coefficient";
const DB_PATH = path.join(process.cwd(), "hr_cache.db");
const MAX_RECORDS = 1e4;
const SIMILARITY_THRESHOLD = 0.85;
const NEGATIVE_MARKERS = [
  "no se encontr\xF3",
  "no encontr\xF3",
  "no existe informaci\xF3n",
  "no tengo informaci\xF3n",
  "no tengo acceso",
  "no se menciona",
  "no hay informaci\xF3n",
  "no est\xE1 documentado",
  "no figura",
  "no se registra",
  "el rit no menciona",
  "no contempla"
];
class DatabaseService {
  constructor() {
    this.db = null;
  }
  async init() {
    try {
      this.db = await open({
        filename: DB_PATH,
        driver: sqlite3.Database
      });
      await this.db.exec(`PRAGMA journal_mode = WAL;`);
      await this.db.exec(`PRAGMA synchronous = NORMAL;`);
      await this.db.exec(`
                CREATE TABLE IF NOT EXISTS knowledge_base (
                    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
                    question_original    TEXT    NOT NULL,
                    question_normalized  TEXT    NOT NULL,
                    answer               TEXT    NOT NULL,
                    category             TEXT    DEFAULT 'general',
                    source               TEXT    DEFAULT 'gemma_rag',
                    knowledge_version    INTEGER DEFAULT 0,
                    last_validated       DATETIME DEFAULT CURRENT_TIMESTAMP,
                    usage_count          INTEGER DEFAULT 1,
                    last_used            DATETIME DEFAULT CURRENT_TIMESTAMP,
                    created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
                    confidence           REAL    DEFAULT NULL,
                    client_ip            TEXT    DEFAULT NULL
                )
            `);
      const cols = await this.db.all(`PRAGMA table_info(knowledge_base)`);
      const colNames = cols.map((c) => c.name);
      if (!colNames.includes("source")) {
        await this.db.exec(`ALTER TABLE knowledge_base ADD COLUMN source TEXT DEFAULT 'gemma_rag'`);
        console.log('\u{1F527} [DB Migration] Columna "source" agregada');
      }
      if (!colNames.includes("knowledge_version")) {
        await this.db.exec(`ALTER TABLE knowledge_base ADD COLUMN knowledge_version INTEGER DEFAULT 0`);
        console.log('\u{1F527} [DB Migration] Columna "knowledge_version" agregada');
      }
      if (!colNames.includes("last_validated")) {
        await this.db.exec(`ALTER TABLE knowledge_base ADD COLUMN last_validated DATETIME DEFAULT NULL`);
        console.log('\u{1F527} [DB Migration] Columna "last_validated" agregada');
      }
      if (!colNames.includes("confidence")) {
        await this.db.exec(`ALTER TABLE knowledge_base ADD COLUMN confidence REAL DEFAULT NULL`);
        console.log('\u{1F527} [DB Migration] Columna "confidence" agregada');
      }
      if (!colNames.includes("client_ip")) {
        await this.db.exec(`ALTER TABLE knowledge_base ADD COLUMN client_ip TEXT DEFAULT NULL`);
        console.log('\u{1F527} [DB Migration] Columna "client_ip" agregada');
      }
      await this.db.exec(`CREATE INDEX IF NOT EXISTS idx_category ON knowledge_base(category)`);
      await this.db.exec(`CREATE INDEX IF NOT EXISTS idx_knowledge_version ON knowledge_base(knowledge_version)`);
      await this.db.exec(`
                CREATE UNIQUE INDEX IF NOT EXISTS idx_question_normalized_unique
                ON knowledge_base(question_normalized)
            `);
      console.log(`\u2705 SQLite Cache Database inicializada en: ${DB_PATH}`);
    } catch (error) {
      console.error("\u274C Error inicializando SQLite:", error.message);
      throw error;
    }
  }
  /**
   * Normaliza un texto para búsqueda consistente.
   */
  normalize(text) {
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.,?¿!¡]/g, "").replace(/\s+/g, " ").trim();
  }
  /**
   * Detecta si una respuesta es negativa/vacía de información.
   * @param {string} answer
   * @returns {boolean}
   */
  isNegativeResponse(answer) {
    if (!answer) return true;
    const lower = answer.toLowerCase();
    return NEGATIVE_MARKERS.some((marker) => lower.includes(marker));
  }
  /**
   * Verifica si una pregunta normalizada ya existe en la BD.
   * @param {string} questionNormalized
   * @returns {Promise<boolean>}
   */
  async exists(questionNormalized) {
    if (!this.db) return false;
    const row = await this.db.get(
      `SELECT id FROM knowledge_base WHERE question_normalized = ? LIMIT 1`,
      [questionNormalized]
    );
    return !!row;
  }
  /**
   * Determina si un registro de caché requiere revalidación (por versión o antigüedad).
   *
   * Criterios:
   * 1. knowledge_version del registro < versión actual del sistema
   * 2. usage_count < 3 (poco validado por el uso)
   * 3. Respuesta corta (< 150 chars) — sospechosamente incompleta
   * 4. Respuesta negativa previa — puede haber nueva información
   *
   * @param {Object} row         Fila de knowledge_base
   * @param {number} currentVersion  Versión actual del knowledge base
   * @returns {boolean}
   */
  needsRevalidation(row, currentVersion) {
    if (!row) return false;
    if ((row.knowledge_version || 0) < currentVersion) {
      return true;
    }
    if (row.usage_count < 3) {
      return true;
    }
    if (row.answer && row.answer.length < 150) {
      return true;
    }
    if (this.isNegativeResponse(row.answer)) {
      return true;
    }
    return false;
  }
  /**
   * Determina si dos respuestas difieren significativamente.
   * Usa combinación de longitud, contenido y Dice Coefficient.
   *
   * @param {string} oldAnswer
   * @param {string} newAnswer
   * @returns {boolean} true = cambio significativo, actualizar
   */
  hasSignificantChange(oldAnswer, newAnswer) {
    if (!oldAnswer || !newAnswer) return true;
    if (this.isNegativeResponse(oldAnswer) && !this.isNegativeResponse(newAnswer)) {
      return true;
    }
    if (newAnswer.length > oldAnswer.length + 50) {
      return true;
    }
    const similarity = diceCoefficient(
      this.normalize(oldAnswer),
      this.normalize(newAnswer)
    );
    if (similarity < 0.6) {
      return true;
    }
    return false;
  }
  /**
   * Actualiza un registro con la nueva respuesta revalidada.
   * Siempre actualiza knowledge_version y last_validated.
   *
   * @param {number} id
   * @param {string} newAnswer     Nueva respuesta del LLM (puede ser null si no cambió)
   * @param {number} currentVersion
   * @returns {Promise<'updated'|'touched'>}
   */
  async markRevalidated(id, newAnswer, currentVersion) {
    if (!this.db) return "touched";
    if (newAnswer) {
      await this.db.run(
        `UPDATE knowledge_base
                 SET answer            = ?,
                     knowledge_version = ?,
                     last_validated    = CURRENT_TIMESTAMP,
                     last_used         = CURRENT_TIMESTAMP
                 WHERE id = ?`,
        [newAnswer, currentVersion, id]
      );
      return "updated";
    } else {
      await this.db.run(
        `UPDATE knowledge_base
                 SET knowledge_version = ?,
                     last_validated    = CURRENT_TIMESTAMP
                 WHERE id = ?`,
        [currentVersion, id]
      );
      return "touched";
    }
  }
  /**
   * Retorna registros con knowledge_version desactualizada para batch revalidation.
   * @param {number} currentVersion
   * @param {number} limit
   * @returns {Promise<Array>}
   */
  async getStaleRecords(currentVersion, limit = 20) {
    if (!this.db) return [];
    return this.db.all(
      `SELECT id, question_original, answer, knowledge_version, usage_count
             FROM knowledge_base
             WHERE knowledge_version < ?
             ORDER BY usage_count DESC, last_used DESC
             LIMIT ?`,
      [currentVersion, limit]
    );
  }
  /**
   * Busca una respuesta similar en la base de datos.
   * Prioridad: coincidencia exacta → similitud fuzzy.
   */
  async findSimilar(question) {
    if (!this.db) return null;
    const normalizedInput = this.normalize(question);
    const exactMatch = await this.db.get(
      `SELECT * FROM knowledge_base WHERE question_normalized = ? LIMIT 1`,
      [normalizedInput]
    );
    if (exactMatch) {
      await this.incrementUsage(exactMatch.id);
      console.log(`\u2705 [SQLite] Coincidencia exacta para: "${question}"`);
      return exactMatch;
    }
    const candidates = await this.db.all(
      `SELECT id, question_normalized, answer, usage_count, knowledge_version
             FROM knowledge_base WHERE category = 'general'`
    );
    let bestMatch = null;
    let maxScore = 0;
    for (const cand of candidates) {
      const score = diceCoefficient(normalizedInput, cand.question_normalized);
      if (score > maxScore) {
        maxScore = score;
        bestMatch = cand;
      }
    }
    if (maxScore >= SIMILARITY_THRESHOLD) {
      const fullRow = await this.db.get(
        `SELECT * FROM knowledge_base WHERE id = ?`,
        [bestMatch.id]
      );
      console.log(`\u2705 [SQLite] Similitud ${(maxScore * 100).toFixed(1)}% para: "${question}"`);
      return fullRow;
    }
    return null;
  }
  /**
   * Elimina un registro por ID.
   * @param {number} id
   */
  async delete(id) {
    if (!this.db) return;
    await this.db.run(`DELETE FROM knowledge_base WHERE id = ?`, [id]);
    console.log(`\u{1F5D1}\uFE0F [SQLite] Registro id:${id} eliminado (Fuera de RIT)`);
  }
  /**
   * UPSERT real — INSERT si no existe, UPDATE si ya existe.
   *
   * @param {string} questionOriginal
   * @param {string} answer
   * @param {string} category
   * @param {string} source
   * @param {number} knowledgeVersion
   * @param {number|null} confidence  Confianza del Retrieval Confidence Engine (0-1) para esta respuesta.
   * @param {string|null} clientIp    IP del cliente que originó la consulta (req.ip).
   * @returns {Promise<'inserted'|'updated'|'skipped'>}
   */
  async storeOrUpdate(questionOriginal, answer, category = "general", source = "gemma_rag", knowledgeVersion = 0, confidence = null, clientIp = null) {
    if (!this.db) {
      console.warn("\u26A0\uFE0F [SQLite] DB no inicializada, no se puede guardar.");
      return "skipped";
    }
    if (!questionOriginal || !answer || answer.length < 10) {
      console.warn("\u26A0\uFE0F [SQLite] Datos insuficientes, omitiendo guardado.");
      return "skipped";
    }
    const normalized = this.normalize(questionOriginal);
    try {
      const insertResult = await this.db.run(
        `INSERT OR IGNORE INTO knowledge_base
                    (question_original, question_normalized, answer, category, source, knowledge_version, last_validated, confidence, client_ip)
                 VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)`,
        [questionOriginal, normalized, answer, category, source, knowledgeVersion, confidence, clientIp]
      );
      if (insertResult.changes > 0) {
        console.log(`\u{1F4BE} [SQLite] \u2705 NUEVA entrada guardada: "${questionOriginal.substring(0, 60)}"`);
        await this._runCleanupIfNeeded();
        return "inserted";
      }
      await this.db.run(
        `UPDATE knowledge_base
                 SET usage_count = usage_count + 1,
                     last_used   = CURRENT_TIMESTAMP,
                     confidence  = COALESCE(?, confidence),
                     client_ip   = COALESCE(?, client_ip)
                 WHERE question_normalized = ?`,
        [confidence, clientIp, normalized]
      );
      console.log(`\u{1F504} [SQLite] Entrada existente actualizada (uso++): "${questionOriginal.substring(0, 60)}"`);
      return "updated";
    } catch (error) {
      console.error("\u26A0\uFE0F [SQLite] Error en storeOrUpdate:", error.message);
      return "skipped";
    }
  }
  /** @deprecated Usar storeOrUpdate() */
  async store(questionOriginal, answer, category = "general") {
    return this.storeOrUpdate(questionOriginal, answer, category, "gemma_rag", 0);
  }
  async incrementUsage(id) {
    if (!this.db) return;
    await this.db.run(
      `UPDATE knowledge_base
             SET usage_count = usage_count + 1,
                 last_used   = CURRENT_TIMESTAMP
             WHERE id = ?`,
      [id]
    );
  }
  async getStats() {
    if (!this.db) return { total: 0, byCategory: [], topQuestions: [] };
    const [total, byCategory, topQuestions] = await Promise.all([
      this.db.get(`SELECT COUNT(*) as total FROM knowledge_base`),
      this.db.all(`SELECT category, COUNT(*) as count FROM knowledge_base GROUP BY category`),
      this.db.all(
        `SELECT question_original, usage_count, last_used, knowledge_version
                 FROM knowledge_base ORDER BY usage_count DESC LIMIT 10`
      )
    ]);
    return {
      total: total.total,
      maxCapacity: MAX_RECORDS,
      utilizationPct: (total.total / MAX_RECORDS * 100).toFixed(1),
      byCategory,
      topQuestions
    };
  }
  async _runCleanupIfNeeded() {
    const count = await this.db.get(`SELECT COUNT(*) as total FROM knowledge_base`);
    if (count.total > MAX_RECORDS) {
      await this.db.run(
        `
                DELETE FROM knowledge_base WHERE id IN (
                    SELECT id FROM knowledge_base
                    ORDER BY usage_count ASC, last_used ASC
                    LIMIT ?
                )`,
        [Math.floor(MAX_RECORDS * 0.1)]
      );
      console.log("\u{1F9F9} [SQLite] Auto-limpieza ejecutada");
    }
  }
  async cleanup() {
    return this._runCleanupIfNeeded();
  }
}
export default new DatabaseService();
