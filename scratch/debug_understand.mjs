import qu from "../services/queryUnderstandingService.js";
const q = "¿Qué tipo de información o pruebas tiene estrictamente prohibido exigir la empresa a los aspirantes durante el proceso de selección?";
const r = qu.understand(q);
console.log(JSON.stringify(r, null, 2));
process.exit(0);
