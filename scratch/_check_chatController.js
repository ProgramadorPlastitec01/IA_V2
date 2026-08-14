import fs from "fs";
import path from "path";
import crypto from "crypto";
import DatabaseService from "../services/database.js";
import PrivacyService, { CATEGORIES } from "../services/privacy.js";
import ragService from "../services/ragService.js";
import { cleanResponse } from "../utils/textProcessor.js";
import { logAnalyticsEvent, logErrorEvent } from "../utils/logger.js";
import { SYSTEM_MESSAGES } from "../config/systemMessages.js";
const CACHE_READ_ENABLED = String(process.env.CACHE_READ_ENABLED || "false").toLowerCase() === "true";
const CACHE_WRITE_ENABLED = String(process.env.CACHE_WRITE_ENABLED || "true").toLowerCase() === "true";
const MAX_QUERY_LENGTH = parseInt(process.env.MAX_QUERY_LENGTH, 10) || 200;
const INJECTION_PATTERNS = [
  /ignora?\s+(tus\s+|mis\s+|las\s+|los\s+)?instrucciones/i,
  /olvida?\s+(lo\s+)?(anterior|todo|instrucciones)/i,
  /act[uú]a?\s+(como|siendo)\s+/i,
  /nuevas?\s+instrucciones/i,
  /eres?\s+(ahora|un|una)\s+/i,
  /sin\s+restricciones/i,
  /system\s*prompt/i,
  /\bprompt\s*[:=]/i,
  /\bjailbreak\b/i,
  /\bdeveloper\s+mode\b/i,
  /\bdo\s+anything\s+now\b/i,
  /modo\s+(sin\s+restricciones|desarrollador|developer)/i,
  /tus\s+instrucciones\s+anteriores/i
];
console.log(`[Cache] Lectura SQLite: ${CACHE_READ_ENABLED ? "HABILITADA" : "deshabilitada"} (CACHE_READ_ENABLED) | Escritura SQLite: ${CACHE_WRITE_ENABLED ? "HABILITADA" : "deshabilitada"} (CACHE_WRITE_ENABLED)`);
const _coreContent = (text) => {
  if (!text) return "";
  let t = String(text).split(/\n\n---\n/)[0];
  t = t.replace(/no encontr[ée] informaci[oó]n sobre:[\s\S]*$/i, "");
  return t.trim();
};
const isQualityAnswer = (text) => {
  if (!text || !text.trim()) return false;
  const core = _coreContent(text);
  if (core.length < 10) return false;
  const REJECT_START = [
    /^no encontr[ée] informaci[oó]n/i,
    /^no se pudo extraer/i,
    /^no se encontr[oó] informaci[oó]n/i,
    /^no tengo (la )?informaci[oó]n/i
  ];
  if (REJECT_START.some((r) => r.test(core))) return false;
  if (/hubo un problema interno/i.test(core)) return false;
  return true;
};
const stripFabricatedNote = (question, text) => {
  if (!text) return text;
  const tieneConectores = /\b(y|adem[áa]s|tambi[ée]n|asimismo)\b/i.test(question || "");
  if (tieneConectores) return text;
  const parts = String(text).split(/\n\n---\n/);
  const head = parts[0].replace(/\s*no encontr[ée] informaci[oó]n sobre[:\s][\s\S]*$/i, "").trim();
  if (head.length < 20) return text;
  parts[0] = head;
  return parts.join("\n\n---\n");
};
export const postQuery = async (req, res) => {
  const startTotal = Date.now();
  const { query, conversationId, bypass_cache } = req.body || {};
  const stats = {
    sqlite_ms: 0,
    embedding_ms: 0,
    qdrant_ms: 0,
    llm_ms: 0,
    total_ms: 0
  };
  try {
    if (!query || typeof query !== "string" || !query.trim()) {
      return res.status(400).json({ error: "Query is required" });
    }
    const initialCategory = PrivacyService.classify(query);
    if (initialCategory === CATEGORIES.CONFIDENCIAL) {
      logAnalyticsEvent("SecurityBlocked", { query, category: "confidencial" });
      return res.json({
        response: SYSTEM_MESSAGES.CONFIDENTIAL,
        outOfScope: true,
        securityBlocked: true
      });
    }
    if (query.length > MAX_QUERY_LENGTH) {
      logAnalyticsEvent("QueryRejected", { reason: "too_long", length: query.length, limit: MAX_QUERY_LENGTH });
      return res.json({
        response: `Tu pregunta supera el l\xEDmite de ${MAX_QUERY_LENGTH} caracteres. Por favor form\xFAlala de forma m\xE1s breve.`,
        outOfScope: true,
        rejected: true,
        reason: "query_too_long"
      });
    }
    if (INJECTION_PATTERNS.some((p) => p.test(query))) {
      logAnalyticsEvent("InjectionBlocked", { reason: "prompt_injection_pattern", length: query.length });
      return res.json({
        response: "Solo puedo responder consultas sobre los documentos de RRHH de Plastitec.",
        outOfScope: true,
        rejected: true,
        reason: "injection_detected"
      });
    }
    if (CACHE_READ_ENABLED && initialCategory === CATEGORIES.REGLAMENTO && !bypass_cache) {
      const startSqlite = Date.now();
      try {
        const cachedResult = await DatabaseService.findSimilar(query);
        stats.sqlite_ms = Date.now() - startSqlite;
        if (cachedResult) {
          await DatabaseService.incrementUsage(cachedResult.id);
          stats.total_ms = Date.now() - startTotal;
          logAnalyticsEvent("CacheHit", { query, latency: stats.total_ms });
          return res.json({
            response: stripFabricatedNote(query, cleanResponse(cachedResult.answer)),
            outOfScope: false,
            cached: true,
            cacheSource: "sqlite",
            conversationId: conversationId || "cached-session"
          });
        }
      } catch (e) {
        console.error("\u26A0\uFE0F Error cach\xE9:", e.message);
      }
    }
    const ragResult = await ragService.processQuery(query);
    Object.assign(stats, ragResult.metrics);
    if (ragResult.error === "no_context") {
      stats.total_ms = Date.now() - startTotal;
      const unansweredConversationId = conversationId || crypto.randomUUID();
      logAnalyticsEvent("UnansweredQuery", {
        conversationId: unansweredConversationId,
        clientIp: req.ip,
        query,
        response: SYSTEM_MESSAGES.NO_MATCH,
        reason: "no_context",
        maxScore: ragResult.qdrantResults?.[0]?.score || 0
      });
      return res.json({
        response: SYSTEM_MESSAGES.NO_MATCH,
        outOfScope: false,
        category: initialCategory,
        ragStatus: "low_relevance",
        conversationId: unansweredConversationId
      });
    }
    const responseText = ragResult.answer;
    const finalCategory = PrivacyService.classify(query);
    stats.total_ms = Date.now() - startTotal;
    if (CACHE_WRITE_ENABLED && finalCategory === CATEGORIES.REGLAMENTO && !bypass_cache && isQualityAnswer(responseText)) {
      const KV_FILE = path.join(process.cwd(), "knowledge_version.json");
      let kv = 0;
      try {
        kv = JSON.parse(fs.readFileSync(KV_FILE, "utf8")).version || 0;
      } catch (e) {
      }
      await DatabaseService.storeOrUpdate(query, responseText, "general", "gemma_rag", kv, ragResult.confidence || 0, req.ip);
    }
    const finalConversationId = conversationId || crypto.randomUUID();
    const finalResponseText = stripFabricatedNote(query, responseText);
    logAnalyticsEvent("RAGQueryMetrics", {
      conversationId: finalConversationId,
      clientIp: req.ip,
      query,
      response: finalResponseText,
      category: finalCategory,
      ...stats,
      chunksUsed: ragResult.chunksUsed,
      maxScore: ragResult.qdrantResults?.[0]?.score || 0
    });
    res.json({
      response: finalResponseText,
      outOfScope: finalCategory !== CATEGORIES.REGLAMENTO,
      category: finalCategory,
      confidence: ragResult.confidence || 0,
      sources: ragResult.sources || [],
      chunksUsed: ragResult.chunksUsed || 0,
      retrievalLogs: ragResult.retrievalLogs || null,
      context: ragResult.context || null,
      conversationId: finalConversationId
    });
  } catch (error) {
    console.error("Query error:", error);
    logErrorEvent("IA", "QueryEngine", error.message, error.stack, { query });
    let friendlyMessage = `Error al procesar la consulta: ${error.message}`;
    if (error.message.includes("fetch failed") || error.message.includes("ECONNREFUSED")) {
      friendlyMessage = "El servicio de IA no est\xE1 disponible temporalmente. Verifica los servicios locales.";
      logAnalyticsEvent("ServiceAlert", { service: "IA", status: "down", error: error.message });
    }
    res.status(500).json({ error: friendlyMessage });
  }
};
export const postReset = (req, res) => {
  res.json({ success: true });
};
