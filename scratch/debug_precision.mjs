import ragService from "../services/ragService.js";
const tests = [
  "¿Cómo reporto un accidente laboral?",
  "¿Cuál es la jornada máxima semanal de trabajo y cómo se distribuye para el personal administrativo a partir del 14 de julio?",
  "¿Qué tipo de información o pruebas tiene estrictamente prohibido exigir la empresa a los aspirantes durante el proceso de selección?",
  "¿Cuántas horas laborales son en 2026?",
  "¿Qué es SAGRILAFT?",
];
for (const q of tests) {
  const res = await ragService.processQuery(q);
  console.log("Q:", q);
  console.log("  conf:", res.confidence.toFixed(3), "chunks:", res.chunksUsed);
  console.log("  A:", res.answer.replace(/\n/g, " "));
  console.log("---");
}
process.exit(0);
