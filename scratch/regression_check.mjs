import ragService from "../services/ragService.js";
const tests = [
  "¿Qué es SAGRILAFT?",
  "¿Cuál es el código de ética de la empresa?",
  "¿Qué es un conflicto de interés?",
  "¿Cuáles son los tipos de contrato que maneja la empresa?",
  "¿Cuál es la capital de Francia?",
];
for (const q of tests) {
  const res = await ragService.processQuery(q);
  console.log("Q:", q);
  console.log("  conf:", res.confidence, "chunks:", res.chunksUsed);
  console.log("  A:", res.answer.slice(0, 200).replace(/\n/g, " "));
}
process.exit(0);
