/**
 * Caché de respuestas de los temas sugeridos (2026-10-29, latencia).
 *
 * Los chips del chat y la vista "Preguntas Frecuentes" envían siempre el mismo
 * texto, pero cada consulta tardaba 40-60 s en la GPU del servidor. Solo las
 * consultas marcadas `faq: true` por el frontend usan esta caché; las preguntas
 * escritas pasan siempre por el RAG.
 *
 * Una entrada vale mientras no cambie la base documental: la firma combina la
 * colección de Qdrant, knowledge_version.json, el contenido de los archivos del
 * corpus y FAQ_CACHE_VERSION (subirla a mano si cambia el prompt o el pipeline).
 * Una calificación "No sirvió" borra la entrada para regenerarla.
 * Se persiste en un JSON (no en hr_cache.db) para sobrevivir reinicios.
 */
import fs from 'fs';
import path from 'path';
import { normalizeQuestion as normalize, corpusSignature } from './answerKeys.js';

const FAQ_CACHE_VERSION = 1;
const MAX_ENTRIES = 50;
const CACHE_FILE = process.env.FAQ_CACHE_FILE || path.join(process.cwd(), 'faq_cache.json');

let entries = null; // clave normalizada → { question, response, signature, createdAt }

const load = () => {
    if (entries) return entries;
    try {
        entries = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    } catch {
        entries = {};
    }
    return entries;
};

const persist = () => {
    try {
        fs.writeFileSync(CACHE_FILE, JSON.stringify(entries, null, 1));
    } catch (e) {
        console.error(`⚠️ [FaqCache] No se pudo guardar ${CACHE_FILE}: ${e.message}`);
    }
};

/** Firma vigente: documentos (answerKeys) + colección de Qdrant + versión de esta caché. */
const currentSignature = () =>
    `v${FAQ_CACHE_VERSION}|${process.env.QDRANT_COLLECTION || ''}|${corpusSignature()}`;

const faqCache = {
    /** Respuesta guardada para la pregunta, o null si no hay o quedó desactualizada. */
    get(question) {
        const hit = load()[normalize(question)];
        if (!hit) return null;
        if (hit.signature !== currentSignature()) return null;
        return hit.response;
    },

    set(question, response) {
        const key = normalize(question);
        if (!key) return;
        const all = load();
        all[key] = { question, response, signature: currentSignature(), createdAt: new Date().toISOString() };
        const keys = Object.keys(all);
        if (keys.length > MAX_ENTRIES) {
            keys.sort((a, b) => String(all[a].createdAt).localeCompare(String(all[b].createdAt)))
                .slice(0, keys.length - MAX_ENTRIES).forEach(k => delete all[k]);
        }
        persist();
    },

    /** Borra la entrada (calificación "No sirvió"); devuelve true si existía. */
    invalidate(question) {
        const all = load();
        const key = normalize(question);
        if (!all[key]) return false;
        delete all[key];
        persist();
        return true;
    },
};

export default faqCache;
