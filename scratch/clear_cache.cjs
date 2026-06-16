const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '../hr_cache.db');
const walPath = path.join(__dirname, '../hr_cache.db-wal');
const shmPath = path.join(__dirname, '../hr_cache.db-shm');

try {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
    console.log("Caché borrada exitosamente.");
} catch (e) {
    console.error("Error borrando caché:", e);
}
