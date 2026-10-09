const sqlite3 = require('sqlite3');
const fs = require('fs');
const db = new sqlite3.Database('C:/AIV2/hr_cache.db', sqlite3.OPEN_READONLY);
const all = (q, p = []) => new Promise((res, rej) => db.all(q, p, (e, r) => e ? rej(e) : res(r)));
const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();
(async () => {
  const rows = await all('SELECT * FROM knowledge_base ORDER BY usage_count DESC, id');
  for (const k of ['category', 'source', 'client_ip', 'knowledge_version']) {
    console.log(k, JSON.stringify(await all(`SELECT ${k} v, COUNT(*) c, SUM(usage_count) u FROM knowledge_base GROUP BY ${k}`)));
  }
  console.log('created range', JSON.stringify(await all('SELECT MIN(created_at) a, MAX(created_at) b FROM knowledge_base')));
  const map = new Map();
  for (const r of rows) {
    const k = norm(r.question_original);
    if (!map.has(k)) map.set(k, { key: k, ids: [], usage: 0, rows: [] });
    const e = map.get(k); e.ids.push(r.id); e.usage += r.usage_count; e.rows.push(r);
  }
  const out = [...map.values()].map(e => {
    const best = e.rows.sort((a, b) => (b.last_validated || '').localeCompare(a.last_validated || ''))[0];
    return { key: e.key, ids: e.ids, usage: e.usage, question: best.question_original, old_answer: best.answer, old_confidence: best.confidence, category: best.category, source: best.source, client_ip: best.client_ip, created_at: best.created_at, last_validated: best.last_validated };
  }).sort((a, b) => b.usage - a.usage);
  fs.writeFileSync('C:/AIV2/scratch/sqlite_questions_2026-10-09.json', JSON.stringify(out, null, 2), 'utf8');
  console.log('distinct', out.length);
  for (const q of out) console.log(q.ids.join(','), '|u', q.usage, '|', q.category, '|', q.source, '|', q.client_ip, '|', q.created_at, '|', (q.old_confidence ?? 'null'), '|', q.question.length, '|', q.question);
  db.close();
})();
