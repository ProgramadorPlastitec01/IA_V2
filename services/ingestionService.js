import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import embeddingsService from './embeddingsService.js';
import qdrantService from './qdrantService.js';

const require = createRequire(import.meta.url);
let pdfParse = null;
try {
  pdfParse = require('pdf-parse');
  console.log('[Ingestion] ✅ pdf-parse cargado correctamente.');
} catch (e) {
  console.error('[Ingestion] ❌ CRÍTICO: No se pudo cargar pdf-parse:', e.message);
}

// Setup de rutas relativas
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DOCS_DIR = path.join(__dirname, '..', 'docs');

/**
 * Ingestion Service
 * Optimizado para calidad de recuperación semántica en sistemas RAG.
 * Con logging explícito en cada etapa — cero fallos silenciosos.
 */
class IngestionService {
  constructor() {
    this.batchSize = 5; // Chunks por llamada para no saturar APIs (evita 'context length exceeded' en Ollama)
  }

  /**
   * Limpia el texto eliminando saltos de línea y espacios innecesarios
   * preservando la estructura lógica (párrafos dobles).
   */
  _cleanText(text) {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Intenta detectar la sección actual (ej: "CAPÍTULO I: DISPOSICIONES")
   */
  _extractSection(text) {
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 5 && trimmed.length < 100) {
        if (trimmed === trimmed.toUpperCase() || trimmed.endsWith(':')) {
          return trimmed;
        }
      }
    }
    return 'General';
  }

  /**
   * Implementa chunking de alta fidelidad basado en párrafos con detección de listas y tablas.
   */
  _intelligentChunking(text, minSize = 400, maxSize = 1500, overlapRatio = 0.20) {
    const cleanedText = this._cleanText(text);
    
    // Separamos por párrafos, pero intentamos detectar tablas/listas
    const paragraphs = cleanedText.split(/\n{2,}/).filter(p => p.trim().length > 0);

    const chunks = [];
    let currentChunk = [];
    let currentLen = 0;
    const targetOverlapLen = maxSize * overlapRatio;

    const finalizeChunk = (isFinal = false) => {
      const chunkStr = currentChunk.join('\n\n').trim();
      if (chunkStr.length >= minSize || (isFinal && chunks.length === 0 && chunkStr.length > 50)) {
        chunks.push(chunkStr);
      }
    };

    const isListOrTable = (p) => {
        const trimmed = p.trim();
        // Detectar listas: numeradas (1.), bullets (*, -, •), o letras (a.)
        const isList = /^(\d+[\.\)]|[a-zA-Z][\.\)]|[\u2022\-\*\u25CF])\s/m.test(trimmed);
        // Detectar tablas: líneas con múltiples separadores | o múltiples espacios tabulares
        const isTable = (trimmed.match(/\|/g) || []).length > 2 || (trimmed.match(/\t/g) || []).length > 1;
        return isList || isTable;
    };

    const splitLargeParagraph = (p) => {
      // Si es una lista o tabla de hasta 2000 chars, intentamos mantenerla junta aunque exceda maxSize ligeramente
      if (isListOrTable(p) && p.length < maxSize * 1.5) {
        return [p]; 
      }
      
      // Split por oraciones cuidando de no romper semántica
      const sentences = p.match(/[^.!?\n]+[.!?\n]+|\s+/g)?.map(s => s.trim()).filter(Boolean) || [p];
      const result = [];
      let current = "";
      for (const s of sentences) {
          if ((current + s).length > maxSize && current.length > 0) {
              result.push(current);
              current = s;
          } else {
              current += (current ? " " : "") + s;
          }
      }
      if (current) result.push(current);
      return result;
    };

    for (const p of paragraphs) {
      const subParts = p.length > maxSize ? splitLargeParagraph(p) : [p];

      for (const part of subParts) {
        // Si el párrafo actual es una continuación de una lista/tabla, preferimos mantenerlo
        if (currentLen + part.length > maxSize && currentLen > 0) {
          finalizeChunk(false);

          // Generar overlap para mantener contexto entre fragmentos
          let overlapChunk = [];
          let overlapLen = 0;
          for (let i = currentChunk.length - 1; i >= 0; i--) {
            if (overlapLen + currentChunk[i].length <= targetOverlapLen || overlapChunk.length === 0) {
              overlapChunk.unshift(currentChunk[i]);
              overlapLen += currentChunk[i].length + 2;
            } else {
              break;
            }
          }

          currentChunk = [...overlapChunk, part];
          currentLen = overlapLen + part.length;
        } else {
          currentChunk.push(part);
          currentLen += part.length + (currentLen > 0 ? 2 : 0);
        }
      }
    }

    if (currentChunk.length > 0) finalizeChunk(true);
    return { chunks, rejectedChunks: 0 };
  }

  /**
   * Genera metadata automática analizando el contenido del chunk.
   */
  _generateMetadata(text, fileName) {
    const lowerText = text.toLowerCase();
    const metadata = {
        document_type: fileName.toLowerCase().endsWith('.pdf') ? 'PDF' : 'TXT',
        category: 'ESTANDAR',
        topics: [],
        keywords: [],
        document_priority: 'NORMAL'
    };

    // Clasificación por categorías
    const categories = {
        CORPORATIVA: ['misión', 'mision', 'visión', 'vision', 'historia corporativa', 'quiénes somos', 'quienes somos', 'fundada', 'nuestros valores', 'política de calidad'],
        SEGURIDAD: ['seguridad', 'epp', 'sst', 'accidentes', 'prevención', 'riesgos', 'industrial', 'protección', 'gafas', 'casco', 'guantes'],
        REGLAMENTO: ['reglamento', 'vacaciones', 'permisos', 'sanciones', 'faltas', 'horarios', 'disciplina', 'incapacidad', 'ley', 'normativa'],
        ETICA: ['ética', 'etica', 'conducta', 'comportamiento', 'política', 'anticorrupción', 'fraude', 'integridad'],
        PROCESOS: ['bpm', 'calidad', 'proceso', 'procedimiento', 'manufactura', 'inocuidad', 'higiene', 'limpieza', 'sanitización']
    };

    for (const [cat, keywords] of Object.entries(categories)) {
        if (keywords.some(k => lowerText.includes(k))) {
            metadata.category = cat;
            if (cat === 'CORPORATIVA' || cat === 'SEGURIDAD') metadata.document_priority = 'ALTA';
            break;
        }
    }

    // Extracción de tópicos simple (keywords que aparecen)
    const allKeywords = [].concat(...Object.values(categories));
    metadata.topics = allKeywords.filter(k => lowerText.includes(k)).slice(0, 5);
    metadata.keywords = metadata.topics;

    return metadata;
  }

  /**
   * Lee el contenido de un archivo TXT o PDF.
   * Lanza error explícito si falla — NO retorna null silenciosamente.
   */
  async _readFileContent(filePath, fileName) {
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.txt') {
      console.log(`   📄 [TXT] Leyendo archivo de texto: ${fileName}`);
      const content = await fs.readFile(filePath, 'utf-8');
      console.log(`   ✅ [TXT] Texto extraído: ${content.length.toLocaleString()} caracteres`);
      return content;
    }

    if (ext === '.pdf') {
      console.log(`   📄 [PDF] Iniciando extracción de texto: ${fileName}`);

      if (!pdfParse) {
        throw new Error('pdf-parse no está disponible. Ejecuta: npm install pdf-parse');
      }

      const dataBuffer = await fs.readFile(filePath);
      console.log(`   📦 [PDF] Tamaño del archivo: ${(dataBuffer.length / 1024).toFixed(1)} KB`);

      const parserFunc = typeof pdfParse === 'function' ? pdfParse : pdfParse.default;
      if (typeof parserFunc !== 'function') {
        throw new Error('La librería pdf-parse no exportó una función válida.');
      }

      const data = await parserFunc(dataBuffer);

      console.log(`   📑 [PDF] Páginas detectadas: ${data.numpages}`);
      console.log(`   📝 [PDF] Texto extraído: ${data.text.length.toLocaleString()} caracteres`);

      if (data.text.length < 100) {
        console.warn(`   ⚠️  [PDF] ADVERTENCIA: Muy poco texto extraído (${data.text.length} chars).`);
        console.warn(`   ⚠️  Posible PDF basado en imágenes/escaneado. Considera convertirlo a texto primero.`);
      }

      return data.text;
    }

    throw new Error(`Formato no soportado: ${ext}. Solo se aceptan .txt y .pdf`);
  }

  /**
   * Procesa todo el ciclo de ingesta para todos los documentos de /docs
   */
  async run() {
    const startTime = Date.now();
    let docsProcessed = 0;
    let docsWithErrors = 0;
    let totalChunksGenerados = 0;
    let totalVectoresInsertados = 0;

    console.log('\n=======================================================');
    console.log('🚀 INICIANDO INGESTA DE DOCUMENTOS RAG');
    console.log('=======================================================\n');

    try {
      // 1. Asegurar que Qdrant está disponible y la colección existe
      console.log('[INFO] Verificando colección Qdrant...');
      await qdrantService.createCollectionIfNotExists();
      console.log('[OK]  Colección Qdrant lista.\n');

      // 2. Leer archivos del directorio /docs
      await fs.mkdir(DOCS_DIR, { recursive: true });
      const files = await fs.readdir(DOCS_DIR);
      const supportedFiles = files.filter(f => f.endsWith('.txt') || f.endsWith('.pdf'));

      console.log(`[INFO] Directorio: ${DOCS_DIR}`);
      console.log(`[INFO] Archivos totales encontrados: ${files.length}`);
      console.log(`[INFO] Archivos soportados (.txt/.pdf): ${supportedFiles.length}`);

      if (supportedFiles.length === 0) {
        console.log(`\n⚠️  No se encontraron archivos TXT o PDF en ${DOCS_DIR}`);
        console.log('   Coloca tus documentos del RIT en esa carpeta y vuelve a ejecutar.');
        return;
      }

      console.log('\n--- ARCHIVOS A PROCESAR ---');
      supportedFiles.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
      console.log('');

      // 3. Procesar cada archivo
      for (const file of supportedFiles) {
        const filePath = path.join(DOCS_DIR, file);
        console.log(`\n${'─'.repeat(55)}`);
        console.log(`📂 PROCESANDO [${supportedFiles.indexOf(file) + 1}/${supportedFiles.length}]: ${file}`);
        console.log(`${'─'.repeat(55)}`);

        try {
          // a. Extraer texto
          const rawText = await this._readFileContent(filePath, file);

          if (!rawText || rawText.trim().length < 50) {
            console.warn(`   ⚠️  Texto insuficiente (${rawText?.length || 0} chars). Saltando archivo.`);
            docsWithErrors++;
            continue;
          }

          // b. Chunking inteligente
          const { chunks, rejectedChunks } = this._intelligentChunking(rawText);
          console.log(`   ✂️  Chunking: ${chunks.length} fragmentos válidos generados (${rejectedChunks} rechazados por tamaño mínimo)`);

          if (chunks.length === 0) {
            console.warn(`   ⚠️  No se generaron chunks válidos para este archivo. Saltando.`);
            docsWithErrors++;
            continue;
          }

          totalChunksGenerados += chunks.length;
          let vectoresEsteDoc = 0;

          // c. Procesar en batches
          for (let i = 0; i < chunks.length; i += this.batchSize) {
            const batchStr = chunks.slice(i, i + this.batchSize);
            const batchNum = Math.floor(i / this.batchSize) + 1;
            const totalBatches = Math.ceil(chunks.length / this.batchSize);

            console.log(`   🧠 Generando Embeddings — Batch ${batchNum}/${totalBatches} (${batchStr.length} chunks)...`);

            // d. Generar embeddings
            const embeddings = await embeddingsService.generateEmbedding(batchStr);
            const vectors = Array.isArray(embeddings[0]) ? embeddings : [embeddings];

            console.log(`   ✅ Embeddings generados: ${vectors.length} vectores (dim: ${vectors[0]?.length || 'N/A'})`);

            // e. Preparar payload con Metadata Inteligente
            const qdrantItems = batchStr.map((chunkText, index) => {
              const chunkId = crypto.randomUUID();
              const metadata = this._generateMetadata(chunkText, file);
              
              return {
                id: chunkId,
                vector: vectors[index],
                payload: {
                  texto_original: chunkText,
                  fuente: file,
                  metadata: {
                    ...metadata,
                    seccion: this._extractSection(chunkText),
                    chunk_id: chunkId,
                    longitud: chunkText.length,
                    indexed_at: new Date().toISOString()
                  }
                }
              };
            });

            // f. Insertar en Qdrant
            console.log(`   💾 Insertando ${qdrantItems.length} vectores en Qdrant...`);
            await qdrantService.upsertBatch(qdrantItems);
            vectoresEsteDoc += qdrantItems.length;
            console.log(`   ✅ Batch ${batchNum}/${totalBatches} insertado correctamente.`);
          }

          totalVectoresInsertados += vectoresEsteDoc;
          docsProcessed++;
          console.log(`\n   ✅ COMPLETADO: "${file}" → ${vectoresEsteDoc} vectores en Qdrant`);

        } catch (fileError) {
          docsWithErrors++;
          console.error(`\n   ❌ ERROR procesando "${file}":`);
          console.error(`      Mensaje : ${fileError.message}`);
          if (fileError.stack) {
            const stackLines = fileError.stack.split('\n').slice(1, 4);
            stackLines.forEach(l => console.error(`      Stack   : ${l.trim()}`));
          }
          console.error(`   ⚠️  Continuando con el siguiente archivo...\n`);
        }
      }

      const durationSecs = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log('\n=======================================================');
      console.log('🎉 RESUMEN DE INGESTA');
      console.log('=======================================================');
      console.log(`   📚 Documentos procesados exitosamente : ${docsProcessed}/${supportedFiles.length}`);
      console.log(`   ❌ Documentos con errores             : ${docsWithErrors}`);
      console.log(`   🧩 Total chunks generados             : ${totalChunksGenerados}`);
      console.log(`   🔢 Total vectores en Qdrant           : ${totalVectoresInsertados}`);
      console.log(`   ⏱️  Tiempo total                       : ${durationSecs} segundos`);
      console.log('=======================================================\n');

      if (docsWithErrors > 0) {
        console.warn(`⚠️  ${docsWithErrors} archivo(s) tuvieron errores. Revisa los mensajes arriba.`);
      }
      if (totalVectoresInsertados === 0) {
        console.error('🚨 CRÍTICO: No se insertó ningún vector en Qdrant.');
        console.error('   El sistema RAG no funcionará hasta que haya datos en la colección.');
      } else {
        console.log(`✅ Qdrant ahora tiene ${totalVectoresInsertados} vectores disponibles para búsqueda semántica.`);
        
        // --- GUARDAR ESTADO DE INDEXACIÓN ---
        try {
          const state = {};
          const files = await fs.readdir(DOCS_DIR);
          const supported = files.filter(f => f.endsWith('.pdf') || f.endsWith('.txt'));
          
          for (const file of supported) {
            const stats = await fs.stat(path.join(DOCS_DIR, file));
            state[file] = {
              size: stats.size,
              mtime: stats.mtimeMs
            };
          }
          
          const STATE_FILE = path.join(DOCS_DIR, '.indexing_state.json');
          await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
          console.log('✅ Estado de documentos guardado en .indexing_state.json');
        } catch (e) {
          console.warn('⚠️ No se pudo guardar el estado de indexación:', e.message);
        }
        // ------------------------------------
      }

    } catch (error) {
      console.error('\n❌ ERROR CRÍTICO DURANTE LA INGESTA:');
      console.error(`   ${error.message}`);
      if (error.stack) console.error(error.stack);
    }
  }
}

// Ejecución directa si se llama con `node ingestionService.js`
if (process.argv[1] && (process.argv[1].endsWith('ingestionService.js') || process.argv[1].endsWith('ingestionService'))) {
  const service = new IngestionService();
  service.run();
}

export default new IngestionService();
