import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'hr_cache.db');

const db = await open({ filename: dbPath, driver: sqlite3.Database });
const before = await db.get('SELECT COUNT(*) as cnt FROM knowledge_base');
await db.run('DELETE FROM knowledge_base');
await db.run('VACUUM');
const after = await db.get('SELECT COUNT(*) as cnt FROM knowledge_base');
await db.close();

console.log(`Caché limpiada: ${before.cnt} registros eliminados. Registros restantes: ${after.cnt}`);
