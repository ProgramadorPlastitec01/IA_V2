/**
 * Metadatos de control de los documentos del corpus (código, versión, fecha).
 *
 * Se leen del propio .md de /docs (tabla "Control/Identificación del Documento"
 * o front-matter), que es lo que realmente está indexado: así la vista pública
 * "Documentos Oficiales Disponibles" no se desactualiza cuando RRHH entrega una
 * versión nueva. Se cachea por mtime del archivo.
 */
import fs from 'fs';
import path from 'path';
import { DOCS_DIR } from '../config/corpusFiles.js';

const MONTHS = {
    enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06',
    julio: '07', agosto: '08', septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12',
};

const cache = new Map(); // ruta → { mtimeMs, meta }

const cell = (text, labelRe) => {
    const m = text.match(new RegExp(`\\|\\s*${labelRe}\\s*\\|\\s*([^|\\n]+?)\\s*\\|`, 'i'));
    return m ? m[1].trim() : null;
};

// "18" → "018": las versiones se escriben a 3 dígitos (V006, V014, V020).
const normalizeVersion = (v) => (v && /^\d{1,3}$/.test(v) ? v.padStart(3, '0') : v);

const parseDocument = (text, fileName) => {
    const frontEnd = text.startsWith('---') ? text.indexOf('\n---', 3) : -1;
    const front = frontEnd > 0 ? text.slice(0, frontEnd) : '';
    const head = text.slice(0, 4000); // la tabla de control está al inicio

    const fm = (key) => {
        const m = front.match(new RegExp(`^${key}:\\s*"?([^"\\n]+?)"?\\s*$`, 'mi'));
        return m ? m[1].trim() : null;
    };

    const codigo = cell(head, 'C[oó]digo') || fm('codigo');
    const version = normalizeVersion(cell(head, 'Versi[oó]n') || fm('version'));

    // Fecha: fila "Fecha…" de la tabla; si no hay, la fila "Aprobó" (tabla con fecha por rol).
    let fecha = cell(head, 'Fecha(?: de emisi[oó]n| elaboraci[oó]n y revisi[oó]n)?');
    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        const aprobo = head.match(/\|\s*Aprob[oó]\s*\|[^\n]*?(\d{4}-\d{2}-\d{2})\s*\|/i);
        fecha = aprobo ? aprobo[1] : (fm('fecha_aprobacion') || null);
    }
    if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) fecha = null;

    // RIT: sin tabla de control; la vigencia está en el nombre (…_01_DE_JULIO_2026_…).
    let vigenteDesde = null;
    const rit = fileName.match(/(\d{1,2})_DE_([A-ZÁÉÍÓÚ]+)_(\d{4})/i);
    if (!codigo && rit && MONTHS[rit[2].toLowerCase()]) {
        vigenteDesde = `${rit[3]}-${MONTHS[rit[2].toLowerCase()]}-${rit[1].padStart(2, '0')}`;
    }

    return { codigo: codigo || null, version: version || null, fecha, vigenteDesde };
};

/** Busca el archivo de /docs que corresponde a una fuente indexada. */
const resolveFile = (fuente) => {
    const direct = path.join(DOCS_DIR, path.basename(String(fuente)));
    if (fs.existsSync(direct)) return direct;
    const code = String(fuente).match(/i-rh-?\s*0*(\d{1,3})/i);
    if (!code) return null;
    const wanted = `i-rh-${code[1].padStart(3, '0')}`;
    const hit = fs.readdirSync(DOCS_DIR).find(f => f.toLowerCase().startsWith(wanted) && f.endsWith('.md'));
    return hit ? path.join(DOCS_DIR, hit) : null;
};

/**
 * @param {string} fuente - nombre de la fuente tal como está en Qdrant
 * @returns {{codigo, version, fecha, vigenteDesde}} (campos null si no hay dato)
 */
export const getDocumentMetadata = (fuente) => {
    const empty = { codigo: null, version: null, fecha: null, vigenteDesde: null };
    try {
        const file = resolveFile(fuente);
        if (!file) return empty;
        const { mtimeMs } = fs.statSync(file);
        const hit = cache.get(file);
        if (hit && hit.mtimeMs === mtimeMs) return hit.meta;
        const meta = parseDocument(fs.readFileSync(file, 'utf8'), path.basename(file));
        cache.set(file, { mtimeMs, meta });
        return meta;
    } catch {
        return empty;
    }
};
