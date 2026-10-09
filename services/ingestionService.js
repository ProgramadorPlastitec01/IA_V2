/**
 * IngestionService v4.0 — Plastitec AI
 *
 * Pipeline de ingesta con:
 *   - Semantic chunking (preserva secciones, listas, tablas)
 *   - chunkSize: 800 chars, overlap: 150 chars
 *   - Metadata enriquecida: section_title, page_number, ocr_used, quality_score
 *   - Logging detallado por documento
 */

import fs from 'fs/promises';
import path from 'path';
import pdfProcessor from './pdfProcessor.js';
import crypto from 'crypto';
import embeddingsService from './embeddingsService.js';
import qdrantService from './qdrantService.js';
// Archivos excluidos de la ingesta: definidos en config/corpusFiles.js
// (compartido con citationValidator, que necesita el mismo corpus).
import { DOCS_DIR, isCorpusFile } from '../config/corpusFiles.js';

// ─── Configuración de chunking ─────────────────────────────────────────────
const CHUNK_SIZE    = 900;   // Chars por chunk — ajustado al límite de tokens de mxbai-embed-large
const CHUNK_OVERLAP = 150;   // Overlap entre chunks — preserva contexto
const MIN_CHUNK_LEN = 60;    // Descartar chunks muy cortos

// ─── Regex para detectar estructura ───────────────────────────────────────
// Detecta títulos: línea corta en MAYÚSCULAS, o precedida de ### o ---
const SECTION_HEADER_RE = /^(?:#{1,4}\s+.{3,80}|[A-ZÁÉÍÓÚÑ0-9\s\-.:]{5,60}|[-─═]{5,})$/m;
// Detecta inicio de lista
const LIST_ITEM_RE = /^\s*(?:\d+[.)]\s+|[-•*►]\s+)/;
// Detecta tabla simple (separadores |)
const TABLE_ROW_RE = /^\|.+\|/;
// Detecta header de artículo numerado ("### ARTÍCULO 89." / "ARTICULO 110.")
const ARTICLE_HEADER_RE = /^#{1,4}\s*ART[IÍ]CULO[S]?\.?\s+\d+/i;

// ─── Clase principal ───────────────────────────────────────────────────────

class IngestionService {
    constructor() {
        this.batchSize = 3;
    }

    // ─── CHUNKING SEMÁNTICO ────────────────────────────────────────────────

    /**
     * Chunking semántico que respeta la estructura del documento.
     * NUNCA corta: listas, numeraciones, tablas, secciones completas.
     *
     * Algoritmo:
     * 1. Dividir por bloques (párrafos separados por \n\n)
     * 2. Detectar si cada bloque es: HEADER, LIST, TABLE, PARAGRAPH
     * 3. Agrupar bloques en chunks sin superar chunkSize
     * 4. Si un HEADER viene justo antes de una lista/párrafo, mantenerlos juntos
     * 5. Aplicar overlap semántico (último párrafo del chunk anterior)
     *
     * @param {string} text - Texto completo del documento
     * @returns {Array<{text, sectionTitle, blockTypes}>}
     */
    _semanticChunking(text) {
        // 1. Dividir en bloques por líneas en blanco
        const rawBlocks = text.split(/\n{2,}/).map(b => b.trim()).filter(b => b.length > 0);

        // 2. Clasificar cada bloque
        const classifiedBlocks = rawBlocks.map(block => {
            const lines      = block.split('\n');
            const firstLine  = lines[0].trim();
            let   type       = 'PARAGRAPH';

            // Detectar HEADER: línea corta y mayúsculas o marcadores ###
            if (
                firstLine.startsWith('#') ||
                (firstLine.length < 70 && firstLine.length > 4 &&
                 /^[A-ZÁÉÍÓÚÑÜ0-9\s\-:.,()/]+$/.test(firstLine) &&
                 !firstLine.match(/\b(el|la|los|las|de|que|es|en|un|una)\b/i))
            ) {
                type = 'HEADER';
            }
            // Detectar LISTA: mayoría de líneas empiezan con número/bullet
            else if (lines.filter(l => LIST_ITEM_RE.test(l)).length >= Math.max(2, lines.length * 0.5)) {
                type = 'LIST';
            }
            // Detectar TABLE
            else if (lines.filter(l => TABLE_ROW_RE.test(l)).length >= 2) {
                type = 'TABLE';
            }

            return { text: block, type, length: block.length };
        });

        // 3. Agrupar bloques en chunks respetando estructura
        //
        // BUG CORREGIDO (2026-10-08): la "Regla 1" (no separar HEADER de su
        // bloque siguiente) estaba invertida — evitaba vaciar el chunk justo
        // cuando llegaba un HEADER, así que el título quedaba como ÚLTIMA línea
        // del chunk anterior y su cuerpo empezaba el chunk siguiente SIN título.
        // En los instructivos cada "### Paso N — …" quedaba separado de su
        // instrucción: el LLM recibía pasos sin número (errores de secuencia),
        // "Desinfecte los guantes antes de ingresar" quedaba pegado a
        // "## Procedimiento de Salida" (mezcla ingreso/salida en área gris) y
        // "no retirarse la cofia" quedaba separado de "Paso 10 — Al Salir".
        // Además sectionTitle tomaba el ÚLTIMO título visto (desfasado un chunk:
        // el chunk con el texto de la Misión quedaba etiquetado "Principios y
        // Valores"). Ahora:
        //   - un HEADER nunca es el último bloque de un chunk: viaja al chunk
        //     siguiente junto con su cuerpo (también cadenas "## Sección" +
        //     "### Paso 9");
        //   - sectionTitle = la sección vigente al INICIO del chunk (o su primer
        //     título, si el chunk empieza con uno).
        const chunks = [];
        let currentChunk = [];
        let currentLen   = 0;
        let currentSection = '';
        let chunkStartSection = '';

        const headerTitle = (b) => b.text.replace(/^#+\s*/, '').replace(/[-─═]+/g, '').trim().substring(0, 80);

        const flushChunk = () => {
            if (currentChunk.length === 0) return;
            const chunkText = currentChunk.map(b => b.text).join('\n\n');
            if (chunkText.trim().length >= MIN_CHUNK_LEN) {
                const firstReal = currentChunk.find(b => !b._isOverlap);
                chunks.push({
                    text:         chunkText.trim(),
                    sectionTitle: firstReal && firstReal.type === 'HEADER' ? headerTitle(firstReal) : chunkStartSection,
                    blockTypes:   currentChunk.map(b => b.type),
                });
            }
            currentChunk = [];
            currentLen   = 0;
        };

        // Saca los HEADER que quedaron al final del chunk actual para que
        // viajen con su cuerpo al chunk siguiente.
        const popTrailingHeaders = () => {
            const carry = [];
            while (currentChunk.length > 0 && currentChunk[currentChunk.length - 1].type === 'HEADER') {
                const h = currentChunk.pop();
                currentLen -= h.length;
                carry.unshift(h);
            }
            return carry;
        };

        const startChunkWith = (blocks) => {
            chunkStartSection = currentSection;
            for (const b of blocks) {
                currentChunk.push(b);
                currentLen += b.length;
            }
        };

        for (let i = 0; i < classifiedBlocks.length; i++) {
            const block     = classifiedBlocks[i];
            const nextBlock = classifiedBlocks[i + 1];

            // Regla 2: NUNCA cortar a la mitad una LISTA o TABLE
            const isAtomicBlock = (block.type === 'LIST' || block.type === 'TABLE');

            // ── ¿Cabe el bloque en el chunk actual? ──────────────────────
            // Un HEADER se evalúa junto con su bloque siguiente (Regla 1): si
            // ambos no caben, se corta ANTES del título.
            const needed = block.type === 'HEADER' && nextBlock && nextBlock.type !== 'HEADER'
                ? block.length + Math.min(nextBlock.length, CHUNK_SIZE)
                : block.length;
            const wouldExceed = (currentLen + needed) > CHUNK_SIZE;

            if (wouldExceed && currentChunk.length > 0) {
                const carry        = popTrailingHeaders();
                const overlapBlock = currentChunk[currentChunk.length - 1];
                // Título que encabeza al bloque de overlap (si lo precede
                // directamente): el overlap viaja CON su título, para no dejar
                // un párrafo huérfano al inicio del chunk nuevo (ej. "Desinfecte
                // los guantes antes de ingresar" sin "Paso 8", pegado a
                // "## Procedimiento de Salida").
                const overlapHeader = currentChunk.length >= 2 && currentChunk[currentChunk.length - 2].type === 'HEADER'
                    ? currentChunk[currentChunk.length - 2]
                    : null;
                flushChunk();

                if (carry.length > 0) {
                    // El chunk nuevo empieza con sus títulos (sin overlap: el
                    // título ya da el contexto).
                    startChunkWith(carry);
                } else if (block.type !== 'HEADER' && overlapBlock && overlapBlock.type === 'PARAGRAPH' && overlapBlock.length <= CHUNK_OVERLAP) {
                    // Overlap del anterior (solo párrafo corto y solo si el
                    // chunk nuevo no empieza con un título propio).
                    startChunkWith([
                        ...(overlapHeader ? [{ ...overlapHeader, _isOverlap: true }] : []),
                        { ...overlapBlock, _isOverlap: true },
                    ]);
                }
            }

            // Actualizar título de sección DESPUÉS del posible flush, para que
            // el chunk que se cierra conserve su propia sección.
            if (block.type === 'HEADER') {
                currentSection = headerTitle(block);
            }

            if (currentChunk.length === 0) chunkStartSection = currentSection;
            currentChunk.push(block);
            currentLen += block.length;

            // Si el bloque es muy grande por sí solo, forzar fragmentación
            if (block.length > CHUNK_SIZE) {
                currentChunk.pop();
                currentLen -= block.length;
                // Los títulos que precedían al bloque se anteponen al primer
                // fragmento en vez de quedar huérfanos (o descartados por MIN_CHUNK_LEN).
                const carry = popTrailingHeaders();
                flushChunk();

                const subChunks = isAtomicBlock
                    ? this._splitLargeList(block.text)                 // respeta items
                    : this._splitLargeParagraph(block.text);           // corta por punto
                const prefix = carry.map(h => h.text).join('\n\n');

                subChunks.forEach((sub, idx) => {
                    chunks.push({
                        text:         idx === 0 && prefix ? `${prefix}\n\n${sub}` : sub,
                        sectionTitle: currentSection,
                        blockTypes:   [isAtomicBlock ? 'LIST_FRAGMENT' : 'PARAGRAPH_FRAGMENT'],
                    });
                });
            }
        }

        // Vaciar lo que quedó
        flushChunk();

        return chunks;
    }

    // ─── CHUNKING HEADER-AWARE POR ARTÍCULO (RIT, seguimiento_5.md #2) ──────

    /**
     * Chunking especializado para documentos con estructura de artículos
     * numerados ("### ARTÍCULO 89. Título.") — pensado para el RIT.
     *
     * Problema que resuelve: `_semanticChunking` genérico trata el header de
     * artículo como un bloque HEADER más; cuando el cuerpo del artículo es
     * grande, el flush por tamaño puede separar el header (queda solo en un
     * chunk) del cuerpo (fragmentado en chunks siguientes sin el título), y
     * el overlap heurístico no lo rescata porque solo aplica a bloques
     * PARAGRAPH. Casos confirmados: Art. 89 (redes sociales) y Art. 110
     * (justa causa) — ver seguimiento_2.md.
     *
     * Estrategia: partir el texto por límites de "### ARTÍCULO N." y tratar
     * cada artículo como una unidad atómica header+cuerpo. Si la unidad cabe
     * en un margen relajado (1.4x CHUNK_SIZE — evita cortar numerales o
     * causales a mitad para artículos algo más largos que el promedio), se
     * emite como un solo chunk. Si no cabe, el cuerpo se fragmenta respetando
     * límites de ítems (numerales/causales/párrafos) y el header del
     * artículo se antepone literalmente a CADA fragmento, para que el texto
     * recuperable siempre contenga el número y título del artículo.
     *
     * Limitación conocida: encabezados de capítulo/sección que preceden
     * inmediatamente a un "ARTÍCULO N." quedan como cola del artículo
     * anterior (no se reasignan al siguiente) — cosmético, no reintroduce el
     * bug de header separado del cuerpo.
     *
     * @param {string} text - Texto completo del documento
     * @returns {Array<{text, sectionTitle, blockTypes}>}
     */
    _semanticChunkingByArticle(text) {
        const ARTICLE_MAX = Math.round(CHUNK_SIZE * 1.4);
        const parts = text.split(/\n(?=#{1,4}\s*ART[IÍ]CULO[S]?\.?\s+\d+)/i);
        const chunks = [];

        // Preámbulo antes del primer "ARTÍCULO N." (portada, índice, etc.)
        if (parts.length > 0 && !ARTICLE_HEADER_RE.test(parts[0].trim().split('\n')[0] || '')) {
            const preamble = parts.shift();
            if (preamble && preamble.trim().length >= MIN_CHUNK_LEN) {
                chunks.push(...this._semanticChunking(preamble));
            }
        }

        for (const unit of parts) {
            const trimmedUnit = unit.trim();
            if (!trimmedUnit) continue;

            const lines      = trimmedUnit.split('\n');
            const headerLine = lines[0].trim();
            const headerText = headerLine.replace(/^#+\s*/, '').trim();
            // (2026-10-08) Los encabezados de CAPÍTULO que preceden al artículo
            // siguiente quedaban como cola de este ("…ARTICULO 22 … ## CAPITULO
            // VII DESCANSO OBLIGATORIO"), sugiriendo al LLM que el tema del
            // capítulo siguiente pertenece a este artículo. Se quitan de la cola.
            const body        = lines.slice(1).join('\n').trim()
                .replace(/(\n+\s*#{1,6}\s+[^\n]*)+\s*$/, '')
                .trim();

            if (!body) {
                chunks.push({ text: headerText, sectionTitle: headerText.substring(0, 80), blockTypes: ['ARTICLE_HEADER_ONLY'] });
                continue;
            }

            const combined = `${headerText}\n\n${body}`;
            if (combined.length <= ARTICLE_MAX) {
                chunks.push({
                    text:         combined,
                    sectionTitle: headerText.substring(0, 80),
                    blockTypes:   ['ARTICLE_UNIT'],
                });
            } else {
                const bodyFragments = this._splitBodyPreservingItems(body, CHUNK_SIZE);
                for (const frag of bodyFragments) {
                    chunks.push({
                        text:         `${headerText}\n\n${frag}`,
                        sectionTitle: headerText.substring(0, 80),
                        blockTypes:   ['ARTICLE_UNIT_FRAGMENT'],
                    });
                }
            }
        }

        return chunks;
    }

    /**
     * Fragmenta el cuerpo de un artículo sin partir numerales, causales
     * (a), b)...) ni romanos (I., II...) a mitad. Agrupa ítems completos de
     * forma voraz hasta el límite de tamaño; si no detecta estructura de
     * lista, cae a párrafos y luego a `_splitLargeParagraph`.
     */
    _splitBodyPreservingItems(body, maxLen) {
        const ITEM_BOUNDARY_RE = /\n(?=\s*(?:\d+[.)]\s|[a-zA-Z][.)]\s|[IVXivx]+[.)]\s))/;
        let units = body.split(ITEM_BOUNDARY_RE).map(u => u.trim()).filter(Boolean);

        if (units.length <= 1) {
            units = body.split(/\n{2,}/).map(u => u.trim()).filter(Boolean);
        }
        if (units.length <= 1) {
            return this._splitLargeParagraph(body);
        }

        const groups = [];
        let current = [];
        let len = 0;
        for (const u of units) {
            if (len + u.length > maxLen && current.length > 0) {
                groups.push(current.join('\n\n'));
                current = [];
                len = 0;
            }
            current.push(u);
            len += u.length + 2;
        }
        if (current.length > 0) groups.push(current.join('\n\n'));

        // (2026-10-08) Un ítem individual más grande que el límite (ej. un
        // numeral de 4.000 chars en el Art. 47 o el procedimiento del Art. 99,
        // 8.156 chars) quedaba como un solo fragmento — muy por encima de lo
        // que el modelo de embeddings representa bien. Se subdivide por
        // oraciones; el llamador sigue anteponiendo el "ARTÍCULO N" a cada uno.
        // Primero por líneas (no separa un numeral "2." de su texto) y solo si
        // una línea sigue siendo enorme, por oraciones.
        return groups.flatMap(g => g.length <= maxLen * 1.5
            ? [g]
            : this._splitTextByDelimiter(g, '\n').flatMap(p => p.length > maxLen * 1.5 ? this._splitLargeParagraph(p) : [p]));
    }

    /**
     * Divide una lista muy grande en sub-chunks respetando items completos.
     */
    _splitLargeList(listText) {
        return this._splitTextByDelimiter(listText, '\n');
    }

    /**
     * Divide un párrafo muy grande respetando puntos.
     */
    _splitLargeParagraph(paraText) {
        // Intenta dividir por puntos primero
        const byDots = this._splitTextByDelimiter(paraText, '. ');
        if (byDots.some(c => c.length > CHUNK_SIZE * 1.5)) {
            // Si sigue siendo muy grande, dividir por espacios
            return this._splitTextByDelimiter(paraText, ' ');
        }
        return byDots.map(s => s.trim().endsWith('.') ? s : s + '.');
    }

    _splitTextByDelimiter(text, delimiter) {
        const parts  = text.split(delimiter);
        const result = [];
        let current  = [];
        let len      = 0;

        for (const part of parts) {
            if (len + part.length > CHUNK_SIZE && current.length > 0) {
                result.push(current.join(delimiter));
                current = [];
                len     = 0;
            }
            current.push(part);
            len += part.length + delimiter.length;
        }
        if (current.length > 0) result.push(current.join(delimiter));
        return result;
    }

    // ─── METADATA ─────────────────────────────────────────────────────────

    /**
     * Extrae categoría, tipo de documento y tags desde el nombre de archivo y texto.
     */
    _extractMetadata(text, fileName, extra = {}) {
        const lowerText = text.toLowerCase();
        const lowerFile = fileName.toLowerCase();

        let category = 'General';
        let docType  = 'Informativo';
        const docTags = [];

        // ── Tipo de documento por nombre de archivo ──────────────────────
        if (lowerFile.includes('rit') || lowerFile.includes('reglamento')) {
            docTags.push('rit', 'reglamento');
            docType = 'Normativa';
        }
        if (lowerFile.includes('bpm') || lowerFile.includes('bpmm') || lowerFile.includes('visita') || lowerFile.includes('higiene')) {
            docTags.push('bpm', 'bpmm', 'visitas', 'higiene');
            docType = 'BPM';
        }
        if (lowerFile.includes('induccion') || lowerFile.includes('inducci')) {
            docTags.push('induccion', 'sst');
            docType = 'Inducción SST';
        }
        if (lowerFile.includes('etica') || lowerFile.includes('ética') || lowerFile.includes('etica')) {
            docTags.push('etica');
            docType = 'Código de Ética';
        }
        if (lowerFile.includes('conocimiento') || lowerFile.includes('visual')) {
            docTags.push('corporativo', 'misión', 'visión');
            docType = 'Material Corporativo';
        }
        if (lowerFile.includes('comunicado')) {
            docTags.push('comunicado');
            docType = 'Comunicado';
        }

        // ── Categoría por contenido ───────────────────────────────────────
        const categoryMap = {
            'BPM / Higiene': [
                'visitante', 'visita', 'cofia', 'polaina', 'overol', 'escafandra',
                'uniforme', 'lavado', 'hipoclorito', 'maquillaje', 'bpm', 'inocuidad',
                'sanitización', 'limpieza', 'higiene', 'manufactura',
            ],
            'Seguridad y Salud (SST)': [
                'sst', 'copasst', 'riesgo', 'accidente', 'epp', 'seguridad',
                'salud', 'sg-sst', 'incidente', 'emergencia',
            ],
            'Misión y Cultura': [
                'misión', 'visión', 'valores', 'principios', 'cultura', 'historia',
                'quiénes somos', 'corporativo',
            ],
            'Políticas y RRHH': [
                'reglamento', 'vacaciones', 'nómina', 'salario', 'prohibido',
                'sanción', 'permiso', 'datos personales', 'sagrilaft',
            ],
            'Procesos Internos': [
                'procedimiento', 'instructivo', 'operación', 'proceso',
            ],
        };

        for (const [cat, keys] of Object.entries(categoryMap)) {
            if (keys.some(k => lowerText.includes(k))) {
                category = cat;
                break;
            }
        }

        return {
            source:           fileName,
            category,
            doc_type:         docType,
            doc_tags:         docTags,
            date:             new Date().toISOString().split('T')[0],
            confidence_hint:  'high',
            section_title:    extra.sectionTitle || '',
            page_number:      extra.pageNumber   || null,
            ocr_used:         extra.ocrUsed      || false,
            quality_score:    extra.qualityScore  || 1.0,
            char_count:       text.length,
        };
    }

    // ─── PIPELINE PRINCIPAL ───────────────────────────────────────────────

    async run() {
        console.log('\n🧠 [Ingestion v4.0] Iniciando Ingesta Inteligente');
        console.log('─'.repeat(60));

        try {
            await qdrantService.createCollectionIfNotExists();

            const allFiles = await fs.readdir(DOCS_DIR);
            const files    = allFiles.filter(isCorpusFile);

            console.log(`📂 Documentos encontrados: ${files.length}`);
            console.log(`   PDFs: ${files.filter(f => f.endsWith('.pdf')).length}`);
            console.log(`   TXTs/MDs: ${files.filter(f => f.endsWith('.txt') || f.endsWith('.md')).length}\n`);

            let totalChunks  = 0;
            let totalOCR     = 0;
            let skipped      = 0;

            for (const file of files) {
                const fileStart  = Date.now();
                const filePath   = path.join(DOCS_DIR, file);
                const dataBuffer = await fs.readFile(filePath);

                console.log('═'.repeat(60));
                console.log(`📄 Procesando: ${file}`);

                let extractionResult = { text: '', strategy: 'TEXTO_PLANO', qualityScore: 1.0, pageResults: [] };

                // ── Extracción según tipo de archivo ─────────────────────
                if (file.endsWith('.pdf')) {
                    try {
                        extractionResult = await pdfProcessor.extractText(dataBuffer, file);
                    } catch (err) {
                        console.error(`   ❌ Error extrayendo PDF: ${err.message}`);
                        skipped++;
                        continue;
                    }
                } else {
                    const rawText = await fs.readFile(filePath, 'utf-8');
                    extractionResult = {
                        text:         rawText,
                        strategy:     'TEXTO_PLANO',
                        qualityScore: 1.0,
                        pageResults:  [],
                    };
                }

                const { text, strategy, qualityScore, pageResults } = extractionResult;

                // ── Validar texto extraído ────────────────────────────────
                if (!text || text.trim().length < 50) {
                    console.warn(`   ⚠️  Saltando "${file}": texto insuficiente (${text?.length || 0} chars)`);
                    skipped++;
                    continue;
                }

                const ocrUsed = strategy !== 'EMBEDDED_TEXT' && strategy !== 'TEXTO_PLANO';
                if (ocrUsed) totalOCR++;

                // ── Semantic Chunking ─────────────────────────────────────
                // Documentos con estructura de artículos numerados (RIT) usan el
                // chunking header-aware por artículo. (2026-10-08) Antes el
                // pipeline principal SIEMPRE usaba el genérico: los chunks del RIT
                // en producción venían de scratch/build_rit_test_collection.mjs,
                // y un rebuild_rag.js los habría regenerado sin el "ARTICULO N"
                // en cada fragmento.
                const articleHeaders = (text.match(/^#{1,4}\s*ART[IÍ]CULO[S]?\.?\s+\d+/gim) || []).length;
                const semanticChunks = articleHeaders >= 5
                    ? this._semanticChunkingByArticle(text)
                    : this._semanticChunking(text);
                console.log(`   ✂️  Chunks: ${semanticChunks.length} | Estrategia: ${strategy} | OCR: ${ocrUsed ? 'SÍ' : 'NO'}`);

                if (semanticChunks.length === 0) {
                    console.warn(`   ⚠️  Sin chunks generados para "${file}"`);
                    skipped++;
                    continue;
                }

                // ── Mostrar resumen de chunks ─────────────────────────────
                semanticChunks.slice(0, 3).forEach((chunk, i) => {
                    const preview = chunk.text.substring(0, 80).replace(/\n/g, ' ');
                    console.log(`   Chunk ${i+1}: [${chunk.sectionTitle || 'sin sección'}] "${preview}..."`);
                });
                if (semanticChunks.length > 3) {
                    console.log(`   ... y ${semanticChunks.length - 3} chunks más.`);
                }

                // ── Indexar en Qdrant por batches ─────────────────────────
                for (let i = 0; i < semanticChunks.length; i += this.batchSize) {
                    const batch = semanticChunks.slice(i, i + this.batchSize);

                    const texts      = batch.map(c => c.text);
                    const embeddings = await embeddingsService.generateEmbedding(texts);
                    const vectors    = Array.isArray(embeddings[0]) ? embeddings : [embeddings];

                    // Mapear page_number desde pageResults si está disponible
                    const getPageNum = (chunkIdx) => {
                        // Estimar número de página basado en posición proporcional
                        if (!pageResults || pageResults.length === 0) return null;
                        const ratio    = (i + chunkIdx) / semanticChunks.length;
                        const estPage  = Math.ceil(ratio * pageResults.length);
                        return Math.min(estPage, pageResults.length);
                    };

                    const points = batch.map((chunk, idx) => ({
                        id:     crypto.randomUUID(),
                        vector: vectors[idx],
                        payload: {
                            texto_original:      chunk.text,
                            fuente:              file,
                            chunk_index:         i + idx,
                            extraction_strategy: strategy,
                            metadata:            this._extractMetadata(chunk.text, file, {
                                sectionTitle: chunk.sectionTitle,
                                pageNumber:   getPageNum(idx),
                                ocrUsed,
                                qualityScore,
                            }),
                        },
                    }));

                    await qdrantService.upsertBatch(points);
                    process.stdout.write('█');
                }

                totalChunks += semanticChunks.length;
                const duration = ((Date.now() - fileStart) / 1000).toFixed(1);
                console.log(`\n   ✅ OK en ${duration}s | ${semanticChunks.length} chunks indexados\n`);
            }

            // ── Resumen final ─────────────────────────────────────────────
            console.log('═'.repeat(60));
            console.log('✨ [Ingestion v4.0] Ingesta completada.');
            console.log(`   Documentos procesados: ${files.length - skipped}/${files.length}`);
            console.log(`   Documentos omitidos:   ${skipped}`);
            console.log(`   Con OCR:               ${totalOCR}`);
            console.log(`   Total chunks:          ${totalChunks}`);
            console.log('═'.repeat(60));

        } catch (err) {
            console.error(`\n❌ [Ingestion] Error crítico: ${err.message}`);
            console.error(err.stack);
        }
    }
}

const service = new IngestionService();

// Solo ejecutar si se llama directamente
if (process.argv[1] && process.argv[1].endsWith('ingestionService.js')) {
    service.run();
}

export default service;
