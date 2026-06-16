const sqlite3 = require('sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../hr_cache.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("Error opening DB:", err.message);
        return;
    }
    db.run('DELETE FROM knowledge_base', function(err) {
        if (err) {
            console.error("Error clearing cache:", err.message);
        } else {
            console.log(`Database cache cleared via SQL! Rows deleted: ${this.changes}`);
        }
        db.close();
    });
});
