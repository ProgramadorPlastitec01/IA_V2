/**
 * Clave de pregunta y firma de la base documental (2026-10-29).
 *
 * Compartido por la caché de temas sugeridos (faqCache.js) y las respuestas
 * aprobadas por RRHH (answer_reviews en hr_cache.db): ambas responden sin
 * pasar por el LLM y deben dejar de hacerlo cuando cambian los documentos.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DOCS_DIR, isCorpusFile } from '../config/corpusFiles.js';

const KV_FILE = path.join(process.cwd(), 'knowledge_version.json');

/** Coincidencia exacta: minúsculas, sin tildes ni signos (la ñ queda como n). */
export const normalizeQuestion = (q) => String(q || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

export const knowledgeVersion = () => {
    try { return JSON.parse(fs.readFileSync(KV_FILE, 'utf8')).version || 0; } catch { return 0; }
};

/** Archivos del corpus con tamaño y mtime (barato: solo stat de ~12 archivos). */
export const corpusFileStats = () => {
    try {
        return fs.readdirSync(DOCS_DIR).filter(isCorpusFile).sort().map(f => {
            const st = fs.statSync(path.join(DOCS_DIR, f));
            return { file: f, size: st.size, mtimeMs: Math.round(st.mtimeMs) };
        });
    } catch {
        return [];
    }
};

let contentHashMemo = { stamp: null, hash: '' };

/**
 * Hash del CONTENIDO del corpus. Se recalcula solo si cambian tamaño o mtime
 * de algún archivo; copiar los mismos archivos no cambia el hash.
 */
const corpusContentHash = () => {
    const stats = corpusFileStats();
    const stamp = stats.map(s => `${s.file}:${s.size}:${s.mtimeMs}`).join('|');
    if (stamp === contentHashMemo.stamp) return contentHashMemo.hash;
    const h = crypto.createHash('sha1');
    for (const s of stats) {
        h.update(s.file);
        try { h.update(fs.readFileSync(path.join(DOCS_DIR, s.file))); } catch { /* archivo ilegible */ }
    }
    contentHashMemo = { stamp, hash: h.digest('hex').slice(0, 16) };
    return contentHashMemo.hash;
};

/**
 * Firma de la verdad documental: versión de conocimiento + contenido del corpus.
 * No incluye la colección de Qdrant ni el prompt: reindexar o ajustar el
 * pipeline no cambia lo que dicen los documentos.
 */
export const corpusSignature = () => `kv${knowledgeVersion()}|${corpusContentHash()}`;
