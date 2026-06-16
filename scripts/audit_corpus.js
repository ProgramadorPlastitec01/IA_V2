/**
 * audit_corpus.js — Auditoría Documental del Corpus Qdrant
 * Fase 2.4.2 — Solo lectura, sin modificaciones.
 *
 * Genera: reports/document_corpus_audit.md
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION = process.env.QDRANT_COLLECTION || 'rrhh_docs';
const REPORTS_DIR = path.join(__dirname, '..', 'reports');
const DOCS_DIR = path.join(__dirname, '..', 'docs');

// ── Keywords de identificación de documentos problemáticos ──────────────────
const ETHICS_MARKERS = ['etica', 'ética', 'i-rh-017', 'codigo de etica', 'código de ética'];
const SAGRILAFT_MARKERS = ['sagrilaft', 'la/ft', 'laft', 'lavado de activos', 'autocontrol'];

// ── Scroll completo de Qdrant ───────────────────────────────────────────────
async function scrollAll() {
    const all = [];
    let offset = null;
    let page = 0;

    console.log('🔍 Leyendo colección Qdrant completa...');

    while (true) {
        const body = {
            limit: 250,
            with_payload: true,
            with_vector: false,
        };
        if (offset) body.offset = offset;

        const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            throw new Error(`Qdrant error: ${res.status} ${await res.text()}`);
        }

        const data = await res.json();
        const points = data.result?.points || [];
        all.push(...points);

        const nextOffset = data.result?.next_page_offset;
        page++;
        process.stdout.write(`  Página ${page}: ${points.length} puntos leídos (total acumulado: ${all.length})\n`);

        if (!nextOffset) break;
        offset = nextOffset;
    }

    return all;
}

// ── Estadísticas por documento ──────────────────────────────────────────────
function analyzeByDocument(points) {
    const docs = {};

    for (const p of points) {
        const payload = p.payload || {};
        const fuente = payload.fuente || 'DESCONOCIDO';
        const texto = payload.texto_original || '';
        const meta = payload.metadata || {};

        if (!docs[fuente]) {
            docs[fuente] = {
                fuente,
                chunks: 0,
                totalChars: 0,
                minChars: Infinity,
                maxChars: 0,
                shortChunks: 0,       // < 80 chars (basura)
                mediumChunks: 0,      // 80-300 chars
                largeChunks: 0,       // > 300 chars
                ocrUsed: false,
                ocrCount: 0,
                category: meta.category || payload.category || 'N/A',
                docType: meta.doc_type || payload.doc_type || 'N/A',
                sectionTitles: new Set(),
                noSectionCount: 0,
                indexedAt: payload.indexed_at || meta.date || 'N/A',
                sampleChunks: [],
            };
        }

        const doc = docs[fuente];
        doc.chunks++;
        doc.totalChars += texto.length;
        if (texto.length < doc.minChars) doc.minChars = texto.length;
        if (texto.length > doc.maxChars) doc.maxChars = texto.length;

        if (texto.length < 80) doc.shortChunks++;
        else if (texto.length < 300) doc.mediumChunks++;
        else doc.largeChunks++;

        if (meta.ocr_used || payload.extraction_strategy === 'OCR') {
            doc.ocrUsed = true;
            doc.ocrCount++;
        }

        const secTitle = meta.section_title || '';
        if (secTitle.trim()) {
            doc.sectionTitles.add(secTitle.trim().substring(0, 60));
        } else {
            doc.noSectionCount++;
        }

        if (doc.sampleChunks.length < 3) {
            doc.sampleChunks.push(texto.substring(0, 120).replace(/\n/g, ' '));
        }
    }

    // Calcular promedios
    for (const doc of Object.values(docs)) {
        doc.avgChars = doc.chunks > 0 ? Math.round(doc.totalChars / doc.chunks) : 0;
        doc.minChars = doc.minChars === Infinity ? 0 : doc.minChars;
        doc.sectionTitlesArr = Array.from(doc.sectionTitles).slice(0, 10);
        doc.noSectionPct = doc.chunks > 0 ? Math.round((doc.noSectionCount / doc.chunks) * 100) : 0;
        doc.ocrPct = doc.chunks > 0 ? Math.round((doc.ocrCount / doc.chunks) * 100) : 0;
        delete doc.sectionTitles;
    }

    return docs;
}

// ── Verificar presencia en disco ────────────────────────────────────────────
function checkDocsOnDisk() {
    const files = fs.readdirSync(DOCS_DIR).filter(f => f.endsWith('.pdf') || f.endsWith('.txt'));
    return files;
}

// ── Clasificar estado de Ética y SAGRILAFT ──────────────────────────────────
function classifyDocument(fuente, docs, diskFiles) {
    const fname = fuente.toLowerCase();

    const isEthics = ETHICS_MARKERS.some(m => fname.includes(m));
    const isSagrilaft = SAGRILAFT_MARKERS.some(m => fname.includes(m));

    const diskMatch = diskFiles.find(f => f.toLowerCase() === fuente.toLowerCase());
    const indexed = !!docs[fuente];

    if (!diskMatch && !indexed) return 'D) NO EXISTE en disco ni en Qdrant';
    if (!diskMatch && indexed) return 'C) Indexado pero NO está en disco (archivo eliminado)';
    if (diskMatch && !indexed) return 'C) Existe en disco pero NO fue indexado';
    if (indexed) {
        const doc = docs[fuente];
        const cat = (doc.category || '').toLowerCase();
        if (isEthics && !cat.includes('etica') && !cat.includes('ética')) {
            return 'D) Indexado pero CATEGORÍA INCORRECTA (no reconocida como Ética)';
        }
        return 'A) Indexado correctamente ✅';
    }
    return 'E) Estado desconocido';
}

// ── Buscar cobertura de SAGRILAFT en contenido ──────────────────────────────
function findSagrilaftCoverage(docs) {
    const results = [];
    for (const [fuente, doc] of Object.entries(docs)) {
        const samples = doc.sampleChunks.join(' ').toLowerCase();
        const hasSagrilaft = SAGRILAFT_MARKERS.some(m => fuente.toLowerCase().includes(m) || samples.includes(m));
        if (hasSagrilaft) {
            results.push({ fuente, chunks: doc.chunks, category: doc.category, hasDirect: fuente.toLowerCase().includes('sagrilaft') });
        }
    }
    return results;
}

// ── Generar reporte Markdown ─────────────────────────────────────────────────
function generateReport(docs, diskFiles, totalPoints) {
    const now = new Date().toISOString();
    const sortedDocs = Object.values(docs).sort((a, b) => b.chunks - a.chunks);

    // Verificar Ética
    const ethicsDoc = Object.entries(docs).find(([f]) => ETHICS_MARKERS.some(m => f.toLowerCase().includes(m)));
    const sagrilaftCoverage = findSagrilaftCoverage(docs);
    const sagrilaftDoc = Object.entries(docs).find(([f]) => f.toLowerCase().includes('sagrilaft'));

    // Estado SAGRILAFT
    let sagrilaftStatus;
    let sagrilaftStatusCode;
    if (sagrilaftDoc) {
        sagrilaftStatusCode = 'A';
        sagrilaftStatus = 'A) Existe documento fuente real y está indexado con nombre "sagrilaft"';
    } else if (sagrilaftCoverage.length > 0) {
        sagrilaftStatusCode = 'D';
        sagrilaftStatus = `D) No existe PDF nombrado "SAGRILAFT" pero el contenido está cubierto en ${sagrilaftCoverage.length} documento(s) (categorizado dentro de Políticas/RIT)`;
    } else {
        sagrilaftStatusCode = 'B';
        sagrilaftStatus = 'B) No existe documento fuente ni cobertura detectada en Qdrant';
    }

    // Estado Ética
    let ethicsStatus;
    if (ethicsDoc) {
        const [fname, docInfo] = ethicsDoc;
        const hasBadCategory = !['etica', 'ética', 'código', 'codigo'].some(m => (docInfo.category || '').toLowerCase().includes(m));
        if (hasBadCategory) {
            ethicsStatus = `D) Existe y está indexado PERO categoría = "${docInfo.category}" (incorrecta)`;
        } else {
            ethicsStatus = `A) Existe documento fuente, indexado con categoría "${docInfo.category}"`;
        }
    } else {
        const diskEthics = diskFiles.find(f => ETHICS_MARKERS.some(m => f.toLowerCase().includes(m)));
        if (diskEthics) {
            ethicsStatus = 'C) Existe en disco pero NO fue indexado en Qdrant';
        } else {
            ethicsStatus = 'B) No existe documento fuente en disco ni en Qdrant';
        }
    }

    let md = `# Auditoría Documental del Corpus — Fase 2.4.2\n`;
    md += `Generado: ${now}\n\n`;
    md += `---\n\n`;
    md += `## Resumen General\n\n`;
    md += `| Métrica | Valor |\n`;
    md += `|---------|-------|\n`;
    md += `| Total de puntos en Qdrant | ${totalPoints} |\n`;
    md += `| Documentos únicos indexados | ${sortedDocs.length} |\n`;
    md += `| Documentos en disco | ${diskFiles.length} |\n`;
    md += `| Fecha de auditoría | ${now.split('T')[0]} |\n\n`;

    md += `---\n\n`;
    md += `## Matriz de Corpus Documental\n\n`;
    md += `| Documento | Chunks | Avg Chars | OCR | Categoría | Sin Sección % | Chunks Cortos | Estado |\n`;
    md += `|-----------|--------|-----------|-----|-----------|---------------|---------------|--------|\n`;

    for (const doc of sortedDocs) {
        const diskOk = diskFiles.some(f => f.toLowerCase() === doc.fuente.toLowerCase());
        const estado = diskOk ? '✅ OK' : '⚠️ Sin PDF en disco';
        const ocrLabel = doc.ocrUsed ? `Sí (${doc.ocrPct}%)` : 'No';
        const shortLabel = doc.shortChunks > 0 ? `⚠️ ${doc.shortChunks}` : '0';
        md += `| ${doc.fuente.substring(0, 45)} | ${doc.chunks} | ${doc.avgChars} | ${ocrLabel} | ${doc.category} | ${doc.noSectionPct}% | ${shortLabel} | ${estado} |\n`;
    }

    md += `\n---\n\n`;
    md += `## Análisis por Documento (Detalle)\n\n`;

    for (const doc of sortedDocs) {
        const isProblematic = ETHICS_MARKERS.some(m => doc.fuente.toLowerCase().includes(m)) ||
                              SAGRILAFT_MARKERS.some(m => doc.fuente.toLowerCase().includes(m));
        const star = isProblematic ? ' ⚠️ PROBLEMÁTICO' : '';
        md += `### ${doc.fuente}${star}\n\n`;
        md += `- **Chunks totales:** ${doc.chunks}\n`;
        md += `- **Tamaño promedio:** ${doc.avgChars} chars\n`;
        md += `- **Tamaño mín/máx:** ${doc.minChars} / ${doc.maxChars} chars\n`;
        md += `- **Distribución:** Cortos (<80): ${doc.shortChunks} | Medios (80-300): ${doc.mediumChunks} | Grandes (>300): ${doc.largeChunks}\n`;
        md += `- **OCR utilizado:** ${doc.ocrUsed ? `Sí (${doc.ocrPct}% de chunks)` : 'No'}\n`;
        md += `- **Categoría asignada:** ${doc.category}\n`;
        md += `- **Tipo de documento:** ${doc.docType}\n`;
        md += `- **Chunks sin section_title:** ${doc.noSectionCount} (${doc.noSectionPct}%)\n`;
        md += `- **Fecha de indexación:** ${doc.indexedAt}\n`;

        if (doc.sectionTitlesArr.length > 0) {
            md += `- **Secciones detectadas (muestra):**\n`;
            for (const st of doc.sectionTitlesArr) {
                md += `  - \`${st}\`\n`;
            }
        }

        if (doc.sampleChunks.length > 0) {
            md += `- **Muestra de chunks:**\n`;
            for (const s of doc.sampleChunks) {
                md += `  > "${s}..."\n`;
            }
        }
        md += `\n`;
    }

    md += `---\n\n`;
    md += `## Diagnóstico Específico: Código de Ética\n\n`;
    md += `**Estado:** ${ethicsStatus}\n\n`;

    if (ethicsDoc) {
        const [fname, docInfo] = ethicsDoc;
        md += `### Chunks del Código de Ética\n\n`;
        md += `- Archivo: \`${fname}\`\n`;
        md += `- Chunks indexados: ${docInfo.chunks}\n`;
        md += `- Tamaño promedio: ${docInfo.avgChars} chars\n`;
        md += `- Sin section_title: ${docInfo.noSectionCount} (${docInfo.noSectionPct}%)\n`;
        md += `- Chunks basura (<80 chars): ${docInfo.shortChunks}\n`;
        md += `- OCR: ${docInfo.ocrUsed ? 'SÍ' : 'NO'}\n`;
        md += `- Categoría detectada: \`${docInfo.category}\`\n`;
        md += `- Tipo de documento: \`${docInfo.docType}\`\n\n`;

        if (docInfo.noSectionPct > 50) {
            md += `> ⚠️ **PROBLEMA CRÍTICO:** El ${docInfo.noSectionPct}% de los chunks no tiene section_title. Esto perjudica gravemente el Section Relevance Boost en el Reranker.\n\n`;
        }
        if (docInfo.shortChunks > 5) {
            md += `> ⚠️ **PROBLEMA:** Existen ${docInfo.shortChunks} chunks menores a 80 caracteres (basura de OCR). Deben ser eliminados o consolidados.\n\n`;
        }
        if (docInfo.avgChars < 150) {
            md += `> ⚠️ **PROBLEMA:** El tamaño promedio de chunk (${docInfo.avgChars} chars) es demasiado pequeño para contener contexto suficiente.\n\n`;
        }
    } else {
        md += `> ❌ **El Código de Ética NO fue encontrado en Qdrant.** Revisar si el archivo existe en \`docs/\` y fue procesado correctamente.\n\n`;
    }

    md += `---\n\n`;
    md += `## Diagnóstico Específico: SAGRILAFT\n\n`;
    md += `**Estado:** ${sagrilaftStatus}\n\n`;

    if (sagrilaftCoverage.length > 0) {
        md += `### Documentos que cubren contenido SAGRILAFT\n\n`;
        md += `| Documento | Chunks | Categoría | Nombre directo |\n`;
        md += `|-----------|--------|-----------|----------------|\n`;
        for (const s of sagrilaftCoverage) {
            md += `| ${s.fuente.substring(0, 50)} | ${s.chunks} | ${s.category} | ${s.hasDirect ? '✅ SÍ' : '❌ NO (contenido implícito)'} |\n`;
        }
        md += `\n`;

        if (sagrilaftStatusCode === 'D') {
            md += `> ⚠️ **PROBLEMA:** SAGRILAFT no tiene PDF dedicado. Está distribuido en documentos de categoría general (RIT/Reglamento). Esto dificulta el retrieval específico porque el reranker no puede discriminar qué chunk es de SAGRILAFT vs otras políticas del mismo PDF.\n\n`;
        }
    } else {
        md += `> ❌ **No se encontró contenido sobre SAGRILAFT en Qdrant.** Verificar si el documento fue indexado y si el OCR extrajo el texto correctamente.\n\n`;
    }

    md += `---\n\n`;
    md += `## Conclusiones y Recomendación\n\n`;

    // Evaluar problemas
    const ethicsProblems = [];
    const sagrilaftProblems = [];
    const generalProblems = [];

    if (!ethicsDoc) ethicsProblems.push('El Código de Ética NO está en Qdrant');
    else {
        const [, docInfo] = ethicsDoc;
        if (docInfo.noSectionPct > 50) ethicsProblems.push(`${docInfo.noSectionPct}% de chunks sin section_title`);
        if (docInfo.shortChunks > 5) ethicsProblems.push(`${docInfo.shortChunks} chunks basura (<80 chars)`);
        if (docInfo.avgChars < 150) ethicsProblems.push(`Chunks demasiado pequeños (avg ${docInfo.avgChars} chars)`);
        const hasBadCat = !['etica', 'ética'].some(m => (docInfo.category || '').toLowerCase().includes(m));
        if (hasBadCat) ethicsProblems.push(`Categoría incorrecta: "${docInfo.category}"`);
    }

    if (sagrilaftStatusCode === 'B') sagrilaftProblems.push('No existe documento SAGRILAFT ni cobertura en Qdrant');
    if (sagrilaftStatusCode === 'D') sagrilaftProblems.push('SAGRILAFT cubierto indirectamente (sin PDF dedicado), lo que dificulta el retrieval especializado');

    for (const doc of sortedDocs) {
        if (doc.shortChunks > 10) generalProblems.push(`"${doc.fuente.substring(0,40)}" tiene ${doc.shortChunks} chunks basura`);
    }

    if (ethicsProblems.length > 0 || sagrilaftProblems.length > 0 || generalProblems.length > 0) {
        md += `### ❌ Problemas Detectados\n\n`;
        if (ethicsProblems.length > 0) {
            md += `**Código de Ética:**\n`;
            for (const p of ethicsProblems) md += `- ${p}\n`;
            md += `\n`;
        }
        if (sagrilaftProblems.length > 0) {
            md += `**SAGRILAFT:**\n`;
            for (const p of sagrilaftProblems) md += `- ${p}\n`;
            md += `\n`;
        }
        if (generalProblems.length > 0) {
            md += `**Problemas generales:**\n`;
            for (const p of generalProblems) md += `- ${p}\n`;
            md += `\n`;
        }
    }

    md += `### ✅ Recomendación Final\n\n`;

    const needsCorpusCorrection = ethicsProblems.some(p => p.includes('NO está en Qdrant') || p.includes('Categoría incorrecta') || p.includes('basura') || p.includes('pequeños'));
    const needsOnlyReranking = !needsCorpusCorrection && (sagrilaftStatusCode === 'D');

    if (needsCorpusCorrection) {
        md += `> **🔴 PRIMERO CORREGIR EL CORPUS DOCUMENTAL antes de continuar con Fase 2.4.2.**\n>\n`;
        md += `> Los problemas detectados en el Código de Ética requieren re-ingesta selectiva. Continuar con el Reranking sin corregir el corpus produciría mejoras mínimas porque los chunks deficientes seguirían siendo recuperados.\n>\n`;
        md += `> **Acciones inmediatas:**\n`;
        for (const p of ethicsProblems) md += `> 1. Resolver: ${p}\n`;
    } else if (needsOnlyReranking) {
        md += `> **🟡 EL CORPUS ESTÁ BÁSICAMENTE ÍNTEGRO. Proceder directamente al Reranking especializado (Fase 4).**\n>\n`;
        md += `> El principal problema de SAGRILAFT es de clasificación/boost, no de contenido faltante. El corpus de Ética parece adecuado.\n>\n`;
        md += `> Se recomienda saltar la re-ingesta y aplicar directamente los boosts de Ethics + SAGRILAFT en el Reranker.\n`;
    } else {
        md += `> **🟢 EL CORPUS ESTÁ ÍNTEGRO. Proceder con la Fase 2.4.2 (Reranking specializado) directamente.**\n>\n`;
        md += `> No se requieren correcciones al corpus antes de optimizar el Retrieval.\n`;
    }

    return md;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log('══════════════════════════════════════════════');
    console.log('  Auditoría Documental — Fase 2.4.2');
    console.log('══════════════════════════════════════════════\n');

    try {
        // 1. Verificar conexión Qdrant
        const healthCheck = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`);
        if (!healthCheck.ok) throw new Error(`No se puede acceder a la colección "${COLLECTION}"`);
        const collInfo = await healthCheck.json();
        console.log(`✅ Colección: ${COLLECTION}`);
        console.log(`   Puntos totales reportados: ${collInfo.result?.points_count || 'N/A'}\n`);

        // 2. Scroll completo
        const allPoints = await scrollAll();
        console.log(`\n✅ Total de puntos leídos: ${allPoints.length}\n`);

        // 3. Analizar por documento
        console.log('📊 Analizando documentos...');
        const docs = analyzeByDocument(allPoints);
        console.log(`   Documentos únicos encontrados: ${Object.keys(docs).length}\n`);

        // 4. Verificar disco
        console.log('💾 Verificando archivos en disco...');
        const diskFiles = checkDocsOnDisk();
        console.log(`   Archivos en docs/: ${diskFiles.length}\n`);

        // 5. Imprimir resumen en consola
        console.log('═'.repeat(70));
        console.log('MATRIZ DE CORPUS:');
        console.log('═'.repeat(70));
        console.log(`${'Documento'.padEnd(48)} ${'Chunks'.padEnd(7)} ${'AvgChars'.padEnd(9)} ${'OCR'.padEnd(5)} Categoría`);
        console.log('─'.repeat(70));
        for (const [fname, doc] of Object.entries(docs).sort((a, b) => b[1].chunks - a[1].chunks)) {
            const isProb = ETHICS_MARKERS.some(m => fname.toLowerCase().includes(m)) ||
                           SAGRILAFT_MARKERS.some(m => fname.toLowerCase().includes(m));
            const flag = isProb ? '⚠️' : '  ';
            console.log(`${flag} ${fname.substring(0, 45).padEnd(46)} ${String(doc.chunks).padEnd(7)} ${String(doc.avgChars).padEnd(9)} ${(doc.ocrUsed ? 'SI' : 'NO').padEnd(5)} ${doc.category}`);
        }
        console.log('─'.repeat(70));
        console.log(`Total puntos: ${allPoints.length} | Docs únicos: ${Object.keys(docs).length}\n`);

        // 6. Generar reporte
        console.log('📝 Generando reporte Markdown...');
        if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

        const report = generateReport(docs, diskFiles, allPoints.length);
        const reportPath = path.join(REPORTS_DIR, 'document_corpus_audit.md');
        fs.writeFileSync(reportPath, report, 'utf8');
        console.log(`\n✅ Reporte generado: ${reportPath}\n`);

    } catch (err) {
        console.error(`\n❌ Error: ${err.message}`);
        console.error(err.stack);
        process.exit(1);
    }
}

main();
