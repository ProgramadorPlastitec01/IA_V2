import ragService from "../services/ragService.js";
const q = "¿Cómo reporto un accidente laboral?";
const res = await ragService.processQuery(q);
console.log("CONTAINS ART65:", res.context?.includes("ARTICULO 65") || false);
console.log("CONTAINS ART66:", res.context?.includes("ARTICULO 66") || false);
console.log("ANSWER:", res.answer);
process.exit(0);
