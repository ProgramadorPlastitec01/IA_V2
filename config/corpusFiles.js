/**
 * Definición única de qué archivos de /docs forman el corpus de consulta.
 * La usan la ingesta (qué se indexa en Qdrant) y el citationValidator
 * (qué vocabulario existe en la documentación) — deben coincidir.
 */
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DOCS_DIR = path.join(__dirname, '..', 'docs');

// Documentos derogados, comunicados obsoletos y meta-archivos técnicos que no
// son contenido RRHH del corpus de consulta.
export const EXCLUDED_FILES = new Set([
    'OPERATION_MANUAL.md',                    // manual operativo del sistema
    'PROJECT_CONTEXT.md',                     // meta: contexto técnico del proyecto
    'TECHNICAL_MANUAL.md',                    // meta: manual técnico del proyecto
    'RIT_PLASTITEC_25_NOV_2025.md',           // RIT derogado (vigente: 01-Jul-2026)
    'COMUNICADO_RIT_PLASTITEC_25_NOV_2025.md', // comunicado del RIT derogado
]);

export const isCorpusFile = (f) =>
    (f.endsWith('.pdf') || f.endsWith('.txt') || f.endsWith('.md')) && !EXCLUDED_FILES.has(f);
