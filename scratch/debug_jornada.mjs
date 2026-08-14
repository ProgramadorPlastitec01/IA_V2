import ragService from "../services/ragService.js";
const q = "¿Cuál es la jornada máxima semanal de trabajo y cómo se distribuye para el personal administrativo a partir del 14 de julio?";
const res = await ragService.processQuery(q);
console.log("CONTAINS 7:30:", res.context?.includes("7:30") || false);
console.log("CONTAINS 14 de julio:", res.context?.includes("14 de julio") || false);
console.log("ANSWER:", res.answer);
process.exit(0);
