import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'hr_cache.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  console.log('🗑️ Eliminando registro con ID 132...');
  db.run('DELETE FROM knowledge_base WHERE id = 132', function(err) {
    if (err) {
      console.error('Error:', err.message);
    } else {
      console.log(`✅ Registro eliminado. Filas afectadas: ${this.changes}`);
    }
  });
});

db.close();
