import ragService from "../services/ragService.js";
const q = "¿Cuál es la duración máxima permitida para el período de prueba y qué requisito es indispensable para que sea legalmente válido?";
const res = await ragService.processQuery(q, "debug-session-periodo");
console.log("RESULT:", JSON.stringify({answer: res.answer, confidence: res.confidence, chunksUsed: res.chunksUsed}, null, 2));
process.exit(0);
