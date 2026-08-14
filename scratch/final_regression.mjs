import ragService from "../services/ragService.js";
const tests = [
  "xjkqz wblu",
  "¿Cuál es la capital de Francia?",
  "¿De cuántos días hábiles consta la licencia por luto?",
  "¿Cuánto tiempo de antelación se necesita para citar a descargos?",
  "¿Qué información se debe manejar con reserva o confidencialidad?",
];
for (const q of tests) {
  const res = await ragService.processQuery(q);
  console.log("Q:", q, "| conf:", res.confidence.toFixed(3), "| chunks:", res.chunksUsed);
  console.log("  A:", res.answer.slice(0,150).replace(/\n/g," "));
}
process.exit(0);
