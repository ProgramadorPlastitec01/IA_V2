import ragService from "../services/ragService.js";
const q = "¿Qué tipo de información o pruebas tiene estrictamente prohibido exigir la empresa a los aspirantes durante el proceso de selección?";
const res = await ragService.processQuery(q, "debug-ctx-check");
console.log("CONTAINS ART2 TEXT:", res.context?.includes("PARÁGRAFO PRIMERO") || false);
console.log("CONTAINS ESTADO CIVIL:", res.context?.includes("estado civil") || false);
console.log("ANSWER:", res.answer);
process.exit(0);
