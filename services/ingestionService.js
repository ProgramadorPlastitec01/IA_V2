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
import { fileURLToPath } from 'url';
import embeddingsService from './embeddingsService.js';
import qdrantService from './qdrantService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const DOCS_DIR   = path.join(__dirname, '..', 'docs');

// ─── Configuración de chunking ─────────────────────────────────────────────
const CHUNK_SIZE    = 1200;  // Chars por chunk — suficiente para sección + lista
const CHUNK_OVERLAP = 150;   // Overlap entre chunks — preserva contexto
const MIN_CHUNK_LEN = 60;    // Descartar chunks muy cortos

// ─── Regex para detectar estructura ───────────────────────────────────────
// Detecta títulos: línea corta en MAYÚSCULAS, o precedida de ### o ---
const SECTION_HEADER_RE = /^(?:#{1,4}\s+.{3,80}|[A-ZÁÉÍÓÚÑ0-9\s\-.:]{5,60}|[-─═]{5,})$/m;
// Detecta inicio de lista
const LIST_ITEM_RE = /^\s*(?:\d+[.)]\s+|[-•*►]\s+)/;
// Detecta tabla simple (separadores |)
const TABLE_ROW_RE = /^\|.+\|/;

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
        const chunks = [];
        let currentChunk = [];
        let currentLen   = 0;
        let currentSection = '';

        const flushChunk = () => {
            if (currentChunk.length === 0) return;
            const chunkText = currentChunk.map(b => b.text).join('\n\n');
            if (chunkText.trim().length >= MIN_CHUNK_LEN) {
                chunks.push({
                    text:         chunkText.trim(),
                    sectionTitle: currentSection,
                    blockTypes:   currentChunk.map(b => b.type),
                });
            }
            currentChunk = [];
            currentLen   = 0;
        };

        for (let i = 0; i < classifiedBlocks.length; i++) {
            const block   = classifiedBlocks[i];
            const nextBlock = classifiedBlocks[i + 1];

            // Actualizar título de sección actual
            if (block.type === 'HEADER') {
                currentSection = block.text.replace(/^#+\s*/, '').replace(/[-─═]+/g, '').trim().substring(0, 80);
            }

            // Regla 1: NUNCA separar HEADER de su bloque siguiente
            const headerWithNext = (block.type === 'HEADER' && nextBlock);

            // Regla 2: NUNCA cortar a la mitad una LISTA o TABLE
            const isAtomicBlock = (block.type === 'LIST' || block.type === 'TABLE');

            // ── ¿Cabe el bloque en el chunk actual? ──────────────────────
            const wouldExceed = (currentLen + block.length) > CHUNK_SIZE;

            if (wouldExceed && currentChunk.length > 0 && !headerWithNext) {
                // Antes de vaciar, guardar overlap: último bloque del chunk actual
                const overlapBlock = currentChunk[currentChunk.length - 1];
                flushChunk();

                // Iniciar nuevo chunk con el overlap del anterior (solo si es párrafo corto)
                if (overlapBlock && overlapBlock.type === 'PARAGRAPH' && overlapBlock.length <= CHUNK_OVERLAP) {
                    currentChunk = [{ ...overlapBlock, _isOverlap: true }];
                    currentLen   = overlapBlock.length;
                }
            }

            currentChunk.push(block);
            currentLen += block.length;

            // Si el bloque es muy grande por sí solo, forzar fragmentación
            if (block.length > CHUNK_SIZE) {
                if (isAtomicBlock) {
                    // Fragmentar la lista internamente respetando items
                    const subChunks = this._splitLargeList(block.text);
                    currentChunk.pop();
                    currentLen -= block.length;
                    flushChunk();

                    for (const sub of subChunks) {
                        chunks.push({
                            text:         sub,
                            sectionTitle: currentSection,
                            blockTypes:   ['LIST_FRAGMENT'],
                        });
                    }
                } else {
                    // Fragmentar un párrafo enorme cortando por punto o salto de línea
                    const subChunks = this._splitLargeParagraph(block.text);
                    currentChunk.pop();
                    currentLen -= block.length;
                    flushChunk();
                    
                    for (const sub of subChunks) {
                        chunks.push({
                            text:         sub,
                            sectionTitle: currentSection,
                            blockTypes:   ['PARAGRAPH_FRAGMENT'],
                        });
                    }
                }
            }
        }

        // Vaciar lo que quedó
        flushChunk();

        return chunks;
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
            const files    = allFiles.filter(f => 
                (f.endsWith('.pdf') || f.endsWith('.txt') || f.endsWith('.md')) && 
                f !== 'OPERATION_MANUAL.md'
            );

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
                const semanticChunks = this._semanticChunking(text);
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
