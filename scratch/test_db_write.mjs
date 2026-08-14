import DatabaseService from "../services/database.js";

await DatabaseService.init();
const result = await DatabaseService.storeOrUpdate(
  "¿Pregunta de prueba de guardado con confianza e IP?",
  "Esta es una respuesta de prueba con longitud suficiente para pasar el filtro de calidad del sistema.",
  "general",
  "gemma_rag",
  0,
  0.734,
  "127.0.0.1"
);
console.log("storeOrUpdate result:", result);

const row = await DatabaseService.db.get(
  `SELECT question_original, confidence, client_ip, usage_count FROM knowledge_base WHERE question_normalized = ?`,
  [DatabaseService.normalize("¿Pregunta de prueba de guardado con confianza e IP?")]
);
console.log("Row:", row);

// Test update path (should COALESCE new confidence/ip)
const result2 = await DatabaseService.storeOrUpdate(
  "¿Pregunta de prueba de guardado con confianza e IP?",
  "Esta es una respuesta de prueba con longitud suficiente para pasar el filtro de calidad del sistema.",
  "general",
  "gemma_rag",
  0,
  0.891,
  "192.168.1.50"
);
console.log("storeOrUpdate result2:", result2);
const row2 = await DatabaseService.db.get(
  `SELECT confidence, client_ip, usage_count FROM knowledge_base WHERE question_normalized = ?`,
  [DatabaseService.normalize("¿Pregunta de prueba de guardado con confianza e IP?")]
);
console.log("Row2:", row2);

// cleanup test row
await DatabaseService.db.run(`DELETE FROM knowledge_base WHERE question_normalized = ?`, [DatabaseService.normalize("¿Pregunta de prueba de guardado con confianza e IP?")]);
console.log("cleaned up test row");
process.exit(0);
