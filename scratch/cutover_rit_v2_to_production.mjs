/**
 * Corte a producción del re-chunking header-aware del RIT (seguimiento_6.md).
 *
 * Mecanismo de "promoción": Qdrant no soporta renombrar colecciones, así que
 * en vez de crear/reemplazar la colección `plastitec_docs` completa, se
 * reemplazan IN-PLACE únicamente los puntos del RIT:
 *   1. Borrar de `plastitec_docs` todos los puntos con fuente = RIT (602, chunking viejo).
 *   2. Copiar (reusando vectores, sin reembeber) los 294 puntos del RIT ya
 *      calculados en `plastitec_docs_test_ritv2` hacia `plastitec_docs`.
 *
 * Backup ya realizado por separado (copia de filesystem de
 * storage/collections/plastitec_docs) antes de correr este script.
 */
import 'dotenv/config';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const PROD_COLLECTION = 'plastitec_docs';
const TEST_COLLECTION = 'plastitec_docs_test_ritv2';
const RIT_FILE = 'RIT_PLASTITEC_01_DE_JULIO_2026_VF.md';

async function scrollAll(collection, filter = null) {
    const points = [];
    let offset = null;
    for (;;) {
        const body = { limit: 200, with_payload: true, with_vector: true };
        if (filter) body.filter = filter;
        if (offset) body.offset = offset;
        const resp = await fetch(`${QDRANT_URL}/collections/${collection}/points/scroll`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!resp.ok) throw new Error(await resp.text());
        const json = await resp.json();
        points.push(...json.result.points);
        offset = json.result.next_page_offset;
        if (!offset) break;
    }
    return points;
}

async function main() {
    const before = await (await fetch(`${QDRANT_URL}/collections/${PROD_COLLECTION}`)).json();
    console.log(`Puntos en ${PROD_COLLECTION} ANTES del corte: ${before.result.points_count}`);

    // ── 1. Borrar puntos RIT viejos de producción ────────────────────────
    const oldRitPoints = await scrollAll(PROD_COLLECTION, { must: [{ key: 'fuente', match: { value: RIT_FILE } }] });
    console.log(`Puntos RIT viejos a borrar en producción: ${oldRitPoints.length}`);

    const delResp = await fetch(`${QDRANT_URL}/collections/${PROD_COLLECTION}/points/delete?wait=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter: { must: [{ key: 'fuente', match: { value: RIT_FILE } }] } }),
    });
    if (!delResp.ok) throw new Error(await delResp.text());
    console.log('Puntos RIT viejos borrados de producción.');

    // ── 2. Copiar puntos RIT nuevos desde la colección de prueba ─────────
    const newRitPoints = await scrollAll(TEST_COLLECTION, { must: [{ key: 'fuente', match: { value: RIT_FILE } }] });
    console.log(`Puntos RIT nuevos (header-aware) a insertar: ${newRitPoints.length}`);

    for (let i = 0; i < newRitPoints.length; i += 100) {
        const batch = newRitPoints.slice(i, i + 100).map(p => ({
            id: p.id, vector: p.vector, payload: p.payload,
        }));
        const resp = await fetch(`${QDRANT_URL}/collections/${PROD_COLLECTION}/points?wait=true`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ points: batch }),
        });
        if (!resp.ok) throw new Error(await resp.text());
        process.stdout.write('#');
    }
    console.log(`\nInsertados ${newRitPoints.length} puntos RIT nuevos en producción.`);

    const after = await (await fetch(`${QDRANT_URL}/collections/${PROD_COLLECTION}`)).json();
    console.log(`Puntos en ${PROD_COLLECTION} DESPUÉS del corte: ${after.result.points_count}`);
    console.log('CORTE COMPLETADO.');
}

main().catch(err => {
    console.error('ERROR EN EL CORTE:', err);
    process.exit(1);
});
