const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('C:/AIV2/hr_cache.db', sqlite3.OPEN_READONLY);
const all = (q, p = []) => new Promise((res, rej) => db.all(q, p, (e, r) => e ? rej(e) : res(r)));
(async () => {
  const tables = await all("SELECT name, sql FROM sqlite_master WHERE type IN ('table','view')");
  for (const t of tables) {
    const cnt = await all(`SELECT COUNT(*) c FROM "${t.name}"`);
    console.log('==', t.name, 'rows=', cnt[0].c);
    console.log(t.sql);
    const sample = await all(`SELECT * FROM "${t.name}" LIMIT 2`);
    for (const s of sample) {
      const o = {};
      for (const [k, v] of Object.entries(s)) o[k] = typeof v === 'string' && v.length > 200 ? v.slice(0, 200) + '…' : v;
      console.log(JSON.stringify(o));
    }
  }
  db.close();
})();
