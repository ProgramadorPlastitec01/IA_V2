import ragService from "../services/ragService.js";
const qs = [
  "¿Cuánto tiempo de antelación se necesita para citar a descargos?",
  "¿Qué información se debe manejar con reserva o confidencialidad?"
];
for (const q of qs) {
  const res = await ragService.processQuery(q);
  console.log("Q:", q);
  console.log("  conf:", res.confidence, "chunks:", res.chunksUsed);
  console.log("  A:", res.answer.slice(0,200));
}
process.exit(0);
