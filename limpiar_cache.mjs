import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'hr_cache.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  console.log('🧹 Limpiando caché de respuestas antiguas (tabla: knowledge_base)...');
  db.run('DELETE FROM knowledge_base', (err) => {
    if (err) console.error('Error:', err.message);
    else console.log('✅ Base de datos de conocimiento vaciada con éxito.');
  });
});

db.close();
