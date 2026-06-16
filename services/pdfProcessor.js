/**
 * PdfProcessor v4.0 — Plastitec AI
 *
 * Extracción inteligente de texto PDF con OCR híbrido.
 * Usa pdfjs-dist + node-canvas para renderizar páginas como imagen,
 * luego Tesseract.js aplica OCR cuando es necesario.
 *
 * NO requiere: Ghostscript, ImageMagick, Poppler.
 * Compatible con Windows offline.
 *
 * Estrategias:
 *   EMBEDDED_TEXT — texto digital extraído directamente (ideal)
 *   HYBRID_OCR    — mezcla: algunas páginas texto, otras OCR
 *   FULL_OCR      — todas las páginas son imagen/escaneo
 */

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import Tesseract from 'tesseract.js';
import { createRequire } from 'module';
import { mergeFragmentedWords, reconstructLists, preserveTitles, cleanOCRNoise } from '../utils/ocrHelpers.js';

const require = createRequire(import.meta.url);

// ─── node-canvas para renderizado PDF ─────────────────────────────────────
let canvasModule = null;
try {
    canvasModule = require('canvas');
} catch (e) {
    console.warn('[PdfProcessor] ⚠️  node-canvas no disponible. OCR visual limitado.');
}

// ─── Configuración pdfjs ───────────────────────────────────────────────────
const CMAP_URL    = new URL('../../node_modules/pdfjs-dist/cmaps/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const CMAP_PACKED = true;

// ─── Umbrales de detección ─────────────────────────────────────────────────
const MIN_CHARS_EMBEDDED    = 150;  // Mínimo chars para considerar página como texto
const MIN_ALPHA_DENSITY     = 0.55; // Mínimo ratio alfanumérico (< → sospechoso)
const MAX_GARBAGE_RATIO     = 0.40; // Si >40% son símbolos/ruido → OCR
const OCR_SCALE_FACTOR      = 2.5;  // Factor de escala para renderizado (más = mejor OCR, más lento)
const OCR_LANG              = 'spa';

// ─── Clase principal ───────────────────────────────────────────────────────

class PdfProcessor {

    /**
     * Punto de entrada: extrae texto de un buffer PDF.
     * Detecta automáticamente si usar texto embebido u OCR por página.
     *
     * @param {Buffer} dataBuffer  - Buffer del archivo PDF
     * @param {string} fileName    - Nombre del archivo (para logs)
     * @returns {Promise<{text, strategy, pageCount, qualityScore, pageResults}>}
     */
    async extractText(dataBuffer, fileName) {
        console.log(`\n📄 [PdfProcessor v4.0] Analizando: ${fileName}`);

        let pdfDocument;
        try {
            const loadingTask = pdfjs.getDocument({
                data:       new Uint8Array(dataBuffer),
                cMapUrl:    CMAP_URL,
                cMapPacked: CMAP_PACKED,
                // Desactivar workers en Node.js
                disableWorker: true,
                isEvalSupported: false,
            });
            pdfDocument = await loadingTask.promise;
        } catch (err) {
            throw new Error(`[PdfProcessor] No se pudo cargar el PDF "${fileName}": ${err.message}`);
        }

        const numPages   = pdfDocument.numPages;
        const pageResults = [];

        console.log(`   📑 Páginas: ${numPages}`);

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            const page       = await pdfDocument.getPage(pageNum);
            const pageResult = await this._processPage(page, pageNum, fileName);
            pageResults.push(pageResult);
            page.cleanup();
        }

        // ── Determinar estrategia global ──────────────────────────────────
        const methods    = pageResults.map(p => p.method);
        const ocrCount   = methods.filter(m => m === 'OCR').length;
        const textCount  = methods.filter(m => m === 'TEXT').length;

        let strategy;
        if (ocrCount === 0)           strategy = 'EMBEDDED_TEXT';
        else if (textCount === 0)     strategy = 'FULL_OCR';
        else                          strategy = 'HYBRID_OCR';

        // ── Calcular quality score global ─────────────────────────────────
        const avgQuality = pageResults.reduce((sum, p) => sum + (p.qualityScore || 0), 0) / numPages;

        // ── Construir texto final ─────────────────────────────────────────
        let fullText = pageResults.map(p => p.text).join('\n\n');

        // ── Post-procesamiento ────────────────────────────────────────────
        if (ocrCount > 0) {
            console.log(`   ✨ [PdfProcessor] Aplicando post-procesamiento OCR...`);
            fullText = mergeFragmentedWords(fullText);
            fullText = reconstructLists(fullText);
            fullText = preserveTitles(fullText);
            fullText = cleanOCRNoise(fullText);
        }

        // ── Resumen por documento ─────────────────────────────────────────
        const totalChars = fullText.trim().length;
        const methodSummary = `TEXT:${textCount} | OCR:${ocrCount}`;
        console.log(`   ✅ [PdfProcessor] Estrategia: ${strategy} | ${methodSummary} | Chars: ${totalChars} | Calidad: ${(avgQuality * 100).toFixed(0)}%`);

        return {
            text:         fullText,
            strategy,
            pageCount:    numPages,
            qualityScore: avgQuality,
            pageResults,
            charCount:    totalChars,
        };
    }

    // ─── Procesamiento por página ─────────────────────────────────────────

    /**
     * Procesa una sola página: intenta extraer texto embebido;
     * si es insuficiente o corrupto, aplica OCR.
     */
    async _processPage(page, pageNum, fileName) {
        // 1. Intentar extracción de texto embebido
        let embeddedText = '';
        try {
            const textContent = await page.getTextContent();
            embeddedText = textContent.items
                .map(item => item.str)
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();
        } catch (e) {
            console.warn(`   ⚠️  Página ${pageNum}: Error extrayendo texto embebido: ${e.message}`);
        }

        // 2. Evaluar calidad del texto extraído
        const quality = this._evaluateTextQuality(embeddedText);

        if (quality.isGood) {
            // Texto embebido suficiente y limpio
            console.log(`   📝 P${pageNum}: TEXTO_EMBEBIDO (${embeddedText.length} chars, calidad: ${(quality.score * 100).toFixed(0)}%)`);
            return {
                pageNum,
                method:       'TEXT',
                text:         embeddedText,
                qualityScore: quality.score,
                charCount:    embeddedText.length,
            };
        }

        // 3. Texto insuficiente o corrupto → intentar OCR
        console.log(`   📸 P${pageNum}: OCR requerido (chars: ${embeddedText.length}, alpha: ${(quality.alphaDensity * 100).toFixed(0)}%, razón: ${quality.reason})`);

        const ocrText = await this._ocrPage(page, pageNum);
        const ocrQuality = this._evaluateTextQuality(ocrText);

        // 4. Decidir qué texto usar: OCR vs embebido (si OCR falla, usar lo que hay)
        const finalText = (ocrText && ocrText.length > embeddedText.length)
            ? ocrText
            : (embeddedText || `[Página ${pageNum}: contenido visual no extraíble]`);

        console.log(`   ✅ P${pageNum}: OCR completado (${ocrText?.length || 0} chars, calidad: ${(ocrQuality.score * 100).toFixed(0)}%)`);

        return {
            pageNum,
            method:       'OCR',
            text:         finalText,
            qualityScore: ocrQuality.score,
            charCount:    finalText.length,
            embeddedFallback: embeddedText.length > 0,
        };
    }

    // ─── Evaluación de calidad de texto ───────────────────────────────────

    /**
     * Evalúa si el texto extraído es suficientemente bueno.
     * @returns {{ isGood, score, alphaDensity, reason }}
     */
    _evaluateTextQuality(text) {
        if (!text || text.trim().length === 0) {
            return { isGood: false, score: 0, alphaDensity: 0, reason: 'VACÍO' };
        }

        const trimmed    = text.trim();
        const totalChars = trimmed.length;

        // Test 1: longitud mínima
        if (totalChars < MIN_CHARS_EMBEDDED) {
            return { isGood: false, score: totalChars / MIN_CHARS_EMBEDDED, alphaDensity: 0, reason: `CORTO(${totalChars})` };
        }

        // Test 2: densidad alfanumérica
        const alphaChars    = (trimmed.match(/[a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ]/g) || []).length;
        const alphaDensity  = alphaChars / totalChars;

        if (alphaDensity < MIN_ALPHA_DENSITY) {
            return { isGood: false, score: alphaDensity, alphaDensity, reason: `BAJA_DENSIDAD(${(alphaDensity*100).toFixed(0)}%)` };
        }

        // Test 3: ratio de basura (caracteres extraños)
        const garbageChars  = (trimmed.match(/[^\w\s.,;:áéíóúÁÉÍÓÚñÑüÜ¿?¡!()%\-\/]/g) || []).length;
        const garbageRatio  = garbageChars / totalChars;

        if (garbageRatio > MAX_GARBAGE_RATIO) {
            return { isGood: false, score: 1 - garbageRatio, alphaDensity, reason: `CORRUPTO(garbage:${(garbageRatio*100).toFixed(0)}%)` };
        }

        // Test 4: palabras que parecen reales (avg longitud > 2)
        const words    = trimmed.split(/\s+/).filter(w => w.length > 1);
        const avgWordLen = words.length > 0 ? words.reduce((s, w) => s + w.length, 0) / words.length : 0;
        if (avgWordLen < 2.5 && words.length > 10) {
            return { isGood: false, score: avgWordLen / 5, alphaDensity, reason: `FRAGMENTADO(avg_word:${avgWordLen.toFixed(1)})` };
        }

        // Texto OK
        const score = Math.min(1, (alphaDensity * 0.5) + (Math.min(totalChars, 2000) / 2000 * 0.3) + (Math.min(avgWordLen, 6) / 6 * 0.2));
        return { isGood: true, score, alphaDensity, reason: 'OK' };
    }

    // ─── OCR via node-canvas + Tesseract ──────────────────────────────────

    /**
     * Renderiza la página PDF como imagen PNG usando node-canvas
     * y aplica OCR con Tesseract.js.
     */
    async _ocrPage(page, pageNum) {
        if (!canvasModule) {
            console.warn(`   ⚠️  P${pageNum}: node-canvas no disponible — OCR omitido.`);
            return '';
        }

        try {
            // 1. Renderizar la página a canvas
            const pngBuffer = await this._renderPageToBuffer(page, pageNum);
            if (!pngBuffer) {
                console.warn(`   ⚠️  P${pageNum}: No se pudo renderizar a imagen.`);
                return '';
            }

            // 2. OCR con Tesseract.js
            const { data: { text, confidence } } = await Tesseract.recognize(pngBuffer, OCR_LANG, {
                logger: () => {}, // Silenciar logs de Tesseract
            });

            const confPct = confidence?.toFixed(1) ?? '?';
            console.log(`      🔠 Tesseract P${pageNum}: confianza ${confPct}%, chars: ${text?.length || 0}`);

            return text?.trim() || '';

        } catch (err) {
            console.warn(`   ⚠️  P${pageNum}: OCR falló: ${err.message}`);
            return '';
        }
    }

    /**
     * Renderiza una página PDF a un buffer PNG usando node-canvas.
     * Este es el fix crítico: pdfjs-dist en Node necesita un canvas real.
     */
    async _renderPageToBuffer(page, pageNum) {
        try {
            const { createCanvas, ImageData } = canvasModule;

            // Obtener viewport escalado (más resolución = mejor OCR)
            const viewport   = page.getViewport({ scale: OCR_SCALE_FACTOR });
            const canvas     = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
            const ctx        = canvas.getContext('2d');

            // Fondo blanco (necesario para OCR)
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Renderizar página PDF al canvas
            await page.render({
                canvasContext: ctx,
                viewport,
                // Proveer factory de canvas para pdfjs
                canvasFactory: {
                    create: (w, h) => {
                        const c = createCanvas(w, h);
                        return { canvas: c, context: c.getContext('2d') };
                    },
                    reset: (canvasAndCtx, w, h) => {
                        canvasAndCtx.canvas.width  = w;
                        canvasAndCtx.canvas.height = h;
                    },
                    destroy: () => {},
                },
            }).promise;

            // Exportar como PNG buffer
            return canvas.toBuffer('image/png');

        } catch (err) {
            console.warn(`   ⚠️  Render P${pageNum}: ${err.message}`);
            return null;
        }
    }
}

export default new PdfProcessor();
