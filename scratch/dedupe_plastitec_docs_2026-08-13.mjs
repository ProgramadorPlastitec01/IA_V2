/**
 * Limpieza de puntos duplicados en la colección Qdrant de producción.
 *
 * Hallazgo (2026-08-13, sesión de diagnóstico post-pruebas RRHH): de 582
 * puntos en `plastitec_docs`, solo 438 combinaciones (fuente, chunk_index)
 * son únicas — 144 chunks están duplicados (probablemente de una ingesta
 * corrida más de una vez sin dedup). Efecto observado: una búsqueda semántica
 * para "beneficios extralegales para pasantes" devolvía el MISMO chunk de
 * "beneficios" dos veces en el top-8, con score idéntico, desplazando otros
 * candidatos.
 *
 * Estrategia:
 *   1. Backup filesystem de storage/collections/<COLLECTION> (el snapshot
 *      nativo de Qdrant falló en seguimiento_6.md por bloqueo de archivos;
 *      la copia de filesystem SÍ funcionó y fue verificada restaurable en
 *      seguimiento_7.md — mismo método aquí).
 *   2. Scroll completo de la colección.
 *   3. Agrupar por (fuente, chunk_index). Para cada grupo con >1 punto,
 *      conservar el de menor `id` (orden estable) y borrar el resto.
 *   4. Verificar conteo final.
 *
 * NO SE EJECUTA AUTOMÁTICAMENTE. Revisar y correr manualmente:
 *   node scratch/dedupe_plastitec_docs_2026-08-13.mjs
 *
 * Requiere Qdrant corriendo. Requiere PowerShell/Node con permisos para
 * copiar la carpeta storage/collections/<COLLECTION> (varios GB posibles).
 */
import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const QDRANT_URL  = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION  = process.env.QDRANT_COLLECTION || 'plastitec_docs';
const STORAGE_DIR = path.join(__dirname, '..', 'storage', 'collections', COLLECTION);
const BACKUP_DIR  = path.join(__dirname, '..', 'backups', `${COLLECTION}_backup_dedupe_2026-08-13`);

async function copyDir(src, dst) {
    await fs.mkdir(dst, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
        const s = path.join(src, entry.name);
        const d = path.join(dst, entry.name);
        if (entry.isDirectory()) {
            await copyDir(s, d);
        } else {
            await fs.copyFile(s, d);
        }
    }
}

async function scrollAll(collection) {
    const points = [];
    let offset = null;
    for (;;) {
        const body = { limit: 300, with_payload: true, with_vector: false };
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
    console.log(`Colección objetivo: ${COLLECTION}`);

    // ── 1. Backup filesystem ──────────────────────────────────────────────
    console.log(`\nBackup: ${STORAGE_DIR} -> ${BACKUP_DIR}`);
    const before = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`).then(r => r.json());
    console.log(`Estado antes del backup: ${before.result.points_count} puntos, status=${before.result.status}`);
    await copyDir(STORAGE_DIR, BACKUP_DIR);
    await fs.writeFile(
        path.join(BACKUP_DIR, 'collection_info_before_dedupe.json'),
        JSON.stringify(before, null, 2)
    );
    console.log('Backup completado y verificable en collection_info_before_dedupe.json.');

    // ── 2. Scroll + detección de duplicados ───────────────────────────────
    const allPoints = await scrollAll(COLLECTION);
    console.log(`\nTotal puntos: ${allPoints.length}`);

    const groups = new Map(); // key -> [points]
    for (const p of allPoints) {
        const key = `${p.payload?.fuente}::${p.payload?.chunk_index}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(p);
    }

    const idsToDelete = [];
    for (const [key, pts] of groups.entries()) {
        if (pts.length <= 1) continue;
        // Ordenar por id para elegir un sobreviviente determinístico.
        const sorted = [...pts].sort((a, b) => String(a.id).localeCompare(String(b.id)));
        const [keep, ...rest] = sorted;
        idsToDelete.push(...rest.map(p => p.id));
    }

    console.log(`Combinaciones (fuente, chunk_index) únicas: ${groups.size}`);
    console.log(`Puntos duplicados a borrar: ${idsToDelete.length}`);

    if (idsToDelete.length === 0) {
        console.log('Nada que borrar. Fin.');
        return;
    }

    // ── 3. Borrado por lotes ───────────────────────────────────────────────
    const BATCH = 200;
    for (let i = 0; i < idsToDelete.length; i += BATCH) {
        const batch = idsToDelete.slice(i, i + BATCH);
        const resp = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/delete?wait=true`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ points: batch }),
        });
        if (!resp.ok) throw new Error(await resp.text());
        process.stdout.write('.');
    }
    console.log(`\nBorrados ${idsToDelete.length} puntos duplicados.`);

    // ── 4. Verificación final ──────────────────────────────────────────────
    const after = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`).then(r => r.json());
    console.log(`\nEstado final: ${after.result.points_count} puntos (esperado: ${allPoints.length - idsToDelete.length}).`);
    console.log('LISTO. Si algo falla, restaurar desde:', BACKUP_DIR);
}

main().catch(err => {
    console.error('ERROR:', err);
    process.exit(1);
});
