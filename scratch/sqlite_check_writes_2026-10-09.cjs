// Verifica (solo lectura) filas nuevas/actualizadas en knowledge_base durante la corrida.
const s = require('sqlite3');
const d = new s.Database('C:/AIV2/hr_cache.db', s.OPEN_READONLY);
d.all("SELECT id, question_original, usage_count, created_at, last_used, last_validated, client_ip FROM knowledge_base WHERE id > 231 OR last_used > '2026-10-09 13:49' ORDER BY last_used", (e, r) => {
  console.log(e || JSON.stringify(r, null, 1));
  d.close();
});
