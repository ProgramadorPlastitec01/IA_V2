/**
 * Definición única de qué archivos de /docs forman el corpus de consulta.
 * La usan la ingesta (qué se indexa en Qdrant) y el citationValidator
 * (qué vocabulario existe en la documentación) — deben coincidir.
 */
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DOCS_DIR = path.join(__dirname, '..', 'docs');

// Documentos derogados y comunicados obsoletos que no son contenido RRHH
// del corpus de consulta. Los meta-archivos técnicos del proyecto ya no viven
// en /docs (ver /project-docs), así que no requieren exclusión aquí.
export const EXCLUDED_FILES = new Set([
    'RIT_PLASTITEC_25_NOV_2025.md',           // RIT derogado (vigente: 01-Jul-2026)
    'COMUNICADO_RIT_PLASTITEC_25_NOV_2025.md', // comunicado del RIT derogado
]);

export const isCorpusFile = (f) =>
    (f.endsWith('.pdf') || f.endsWith('.txt') || f.endsWith('.md')) && !EXCLUDED_FILES.has(f);

// ── Instructivos cortos (2026-10-28) ────────────────────────────────────────
// Documentos de ≤ ~8 KB (Visitas, Áreas Grises/Negras/Blancas, Lavado de Manos,
// Código de Ética). Se trocean en 4-8 chunks que separan reglas de sus notas y
// pasos de ingreso de pasos de salida; para estos documentos el contexto lleva
// el instructivo COMPLETO (ragService._buildContextExpanded).
export const WHOLE_DOC_RE = /i-rh-0(06|09|10|11|12|17)(?!\d)/i;
export const isWholeDocSource = (fuente) => WHOLE_DOC_RE.test(fuente || '');

// Instructivos de ingreso por área: textos casi idénticos entre sí ("Póngase la
// blusa blanca", "Quítese la ropa de calle"), por eso no se deben mezclar.
export const AREA_INSTRUCTIVOS = [
    { re: /i-rh-010(?!\d)/i, label: 'ÁREA NEGRA' },
    { re: /i-rh-009(?!\d)/i, label: 'ÁREA GRIS' },
    { re: /i-rh-011(?!\d)/i, label: 'ÁREA BLANCA' },
];
export const isAreaInstructivo = (fuente) => AREA_INSTRUCTIVOS.some(a => a.re.test(fuente || ''));
