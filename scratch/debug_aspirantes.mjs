import ragService from "../services/ragService.js";
const q = "¿Qué tipo de información o pruebas tiene estrictamente prohibido exigir la empresa a los aspirantes durante el proceso de selección?";
const res = await ragService.processQuery(q, "debug-session-aspirantes");
console.log("ANSWER:", res.answer);
console.log("CONFIDENCE:", res.confidence, "CHUNKS:", res.chunksUsed);
process.exit(0);
