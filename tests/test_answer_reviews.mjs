// Prueba de punta a punta del portal RRHH (respuestas aprobadas).
// SOLO contra una instancia aislada: base y caché propias, nunca producción.
//   HR_CACHE_DB=<copia> FAQ_CACHE_FILE=<tmp> HR_PIN_HASH=… HR_PIN_SALT=… PORT=3999 node server.js
//   TEST_API=http://localhost:3999 TEST_HR_PIN=<pin> HR_CACHE_DB=<copia> node tests/test_answer_reviews.mjs
// Hace ~3 consultas reales al LLM (~40 s cada una en el servidor actual).
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const API = process.env.TEST_API || 'http://localhost:3999';
const PIN = process.env.TEST_HR_PIN;
const DB = process.env.HR_CACHE_DB;
if (!PIN || !DB || /hr_cache\.db$/i.test(DB) && !/tmp|temp|scratch/i.test(DB)) {
    console.error('Faltan TEST_HR_PIN / HR_CACHE_DB, o HR_CACHE_DB parece la base de producción.');
    process.exit(2);
}

const Q = '¿Cuántos días de permiso por luto tengo?';
const Q_VARIANT = 'cuantos dias de permiso por LUTO tengo';
const Q_OTHER = '¿Cuántos días de permiso por matrimonio tengo?';
const EDITED = 'PRUEBA RRHH: por luto tienes 5 días hábiles remunerados.';

let failures = 0;
const check = (name, ok, extra = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
    if (!ok) failures++;
};

const post = async (path, body, token) => {
    const r = await fetch(`${API}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body || {}),
        signal: AbortSignal.timeout(300000),
    });
    return { status: r.status, json: await r.json().catch(() => ({})) };
};
const get = async (path, token) => {
    const r = await fetch(`${API}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    return { status: r.status, json: await r.json().catch(() => ({})) };
};
const ask = async (query) => {
    const t0 = Date.now();
    const { json } = await post('/api/query', { query });
    return { ...json, ms: Date.now() - t0 };
};
const findReview = async (token, status, question) => {
    const { json } = await get(`/api/answer-reviews?status=${status}`, token);
    return (json.reviews || []).find(r => r.question.toLowerCase().includes(question));
};

// 1. Autenticación
const wrong = await post('/api/verify-pin', { pin: '0000' === PIN ? '1111' : '0000' });
check('PIN incorrecto no da acceso', wrong.json.success === false);
const login = await post('/api/verify-pin', { pin: PIN });
const token = login.json.token;
check('PIN de RRHH da rol rrhh + token', login.json.success && login.json.role === 'rrhh' && !!token);
check('Sin token → 401', (await get('/api/answer-reviews')).status === 401);
check('Token alterado → 401', (await get('/api/answer-reviews', `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`)).status === 401);
check('Aprobar sin token → 401', (await post('/api/answer-reviews/1/approve', { answer: 'x' })).status === 401);

// 2. La consulta real queda como pendiente con respuesta y fuentes
const first = await ask(Q);
check('Primera consulta pasa por el RAG', first.cacheSource !== 'aprobada', `${(first.ms / 1000).toFixed(1)}s`);
let review = await findReview(token, 'pendiente', 'luto');
check('Aparece en Pendientes con respuesta', !!review && !!review.latestAnswer && review.askCount >= 1);
if (!review) { console.log('\nNo se puede seguir sin la fila pendiente.'); process.exit(1); }
const originalCitations = review.latestAnswer.slice(review.latestAnswer.lastIndexOf('\n\n---\n'));

// 3. Aprobar con corrección → variante exacta responde desde la caché
const approve = await post(`/api/answer-reviews/${review.id}/approve`, { answer: EDITED, note: 'prueba' }, token);
check('Aprobar con corrección', approve.status === 200);
const hit = await ask(Q_VARIANT);
check('Variante (mayúsculas/tildes) responde la aprobada', hit.cacheSource === 'aprobada' && hit.ms < 1500, `${hit.ms} ms`);
check('Texto corregido + fuentes originales', String(hit.response).startsWith(EDITED) && String(hit.response).trim().endsWith(originalCitations.trim().slice(-40)));
const other = await ask(Q_OTHER);
check('"matrimonio" NO recibe la respuesta de "luto"', other.cacheSource !== 'aprobada' && !String(other.response).includes('PRUEBA RRHH'), `${(other.ms / 1000).toFixed(1)}s`);

// 4. "No sirvió" → Por revisar, deja de servirse
await post('/api/rate-answer', { rating: 'bad', question: Q_VARIANT, answer: EDITED });
review = await findReview(token, 'revisar', 'luto');
check('Calificación negativa → Por revisar', review?.statusReason === 'calificacion_negativa');

// 5. Cambio de documentos (firma distinta) → Por revisar
await post(`/api/answer-reviews/${review.id}/approve`, {}, token);
const db = await open({ filename: DB, driver: sqlite3.Database });
await db.run(`UPDATE answer_reviews SET signature = 'firma-anterior' WHERE id = ?`, [review.id]);
await db.close();
const afterDocs = await ask(Q);
check('Documentos cambiados → vuelve al RAG', afterDocs.cacheSource !== 'aprobada', `${(afterDocs.ms / 1000).toFixed(1)}s`);
review = await findReview(token, 'revisar', 'luto');
check('Queda Por revisar (documentos_cambiaron)', review?.statusReason === 'documentos_cambiaron');

// 6. Revocar y historial
await post(`/api/answer-reviews/${review.id}/approve`, {}, token);
const revoke = await post(`/api/answer-reviews/${review.id}/revoke`, {}, token);
check('Revocar', revoke.status === 200 && !!(await findReview(token, 'pendiente', 'luto')));
const { json: hist } = await get(`/api/answer-reviews/${review.id}/history`, token);
const actions = (hist.history || []).map(h => h.action).reverse();
check('Historial completo', ['corregir', 'suspender', 'aprobar', 'suspender', 'aprobar', 'revocar'].every((a, i) => actions[i] === a), actions.join(','));

console.log(failures ? `\n${failures} FALLO(S)` : '\nOK');
process.exit(failures ? 1 : 0);
