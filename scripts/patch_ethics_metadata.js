/**
 * patch_ethics_metadata.js
 * Fase 2.4.2 — Patch quirúrgico de metadata en Qdrant.
 *
 * Actualiza en caliente el campo metadata.category de los chunks
 * del Código de Ética de "General" → "Código Ética".
 *
 * NO reindexar. Solo update de payload.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION = process.env.QDRANT_COLLECTION || 'rrhh_docs';
const REPORTS_DIR = path.join(__dirname, '..', 'reports');

const ETHICS_FILENAME = 'I-RH-017-5 CODIGO DE ETICA (Material visual).pdf';
const PATCH_CATEGORY  = 'Código Ética';
const PATCH_DOC_TYPE  = 'Código de Ética';

// ── Scroll filtrando por fuente del doc de ética ────────────────────────────
async function getEthicsPoints() {
    const points = [];
    let offset = null;

    console.log(`🔍 Buscando chunks de: "${ETHICS_FILENAME}"...`);

    while (true) {
        const body = {
            filter: {
                must: [{ key: 'fuente', match: { value: ETHICS_FILENAME } }]
            },
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

        if (!res.ok) throw new Error(`Qdrant scroll error: ${res.status} ${await res.text()}`);
        const data = await res.json();
        const batch = data.result?.points || [];
        points.push(...batch);

        const next = data.result?.next_page_offset;
        if (!next) break;
        offset = next;
    }

    return points;
}

// ── Patch de payload en caliente ────────────────────────────────────────────
async function patchPoints(points) {
    if (points.length === 0) {
        console.log('⚠️  No se encontraron puntos para patchear.');
        return { updated: 0, alreadyCorrect: 0, failed: 0 };
    }

    const toUpdate = points.filter(p => {
        const meta = p.payload?.metadata || {};
        return meta.category !== PATCH_CATEGORY || meta.doc_type !== PATCH_DOC_TYPE;
    });
    const alreadyCorrect = points.length - toUpdate.length;

    console.log(`   Total chunks encontrados:   ${points.length}`);
    console.log(`   Ya correctos (sin cambio):  ${alreadyCorrect}`);
    console.log(`   Chunks a patchear:          ${toUpdate.length}`);

    if (toUpdate.length === 0) {
        console.log('✅ Todos los chunks ya tienen la categoría correcta.');
        return { updated: 0, alreadyCorrect, failed: 0 };
    }

    // Construir el payload update batch
    const pointIds = toUpdate.map(p => p.id);

    // Qdrant API: /points/payload endpoint
    const updateBody = {
        points: pointIds,
        payload: {
            'metadata.category': PATCH_CATEGORY,
            'metadata.doc_type': PATCH_DOC_TYPE,
        },
    };

    let updated = 0;
    let failed  = 0;

    // Qdrant soporta set_payload con filter o lista de IDs
    // Usamos la API de set_payload con lista de IDs
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload?wait=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            points: pointIds,
            payload: {
                'metadata.category': PATCH_CATEGORY,
                'metadata.doc_type': PATCH_DOC_TYPE,
            },
        }),
    });

    if (res.ok) {
        updated = toUpdate.length;
        console.log(`✅ Patch aplicado a ${updated} chunks.`);
    } else {
        const err = await res.text();
        console.error(`❌ Error al patchear: ${err}`);
        // Intentar punto a punto como fallback
        console.log('   Intentando patch individual como fallback...');
        for (const point of toUpdate) {
            const r = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload?wait=true`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    points: [point.id],
                    payload: {
                        'metadata.category': PATCH_CATEGORY,
                        'metadata.doc_type': PATCH_DOC_TYPE,
                    },
                }),
            });
            if (r.ok) {
                updated++;
                process.stdout.write('█');
            } else {
                failed++;
                process.stdout.write('✗');
            }
        }
        console.log(`\n   Actualizados: ${updated} | Fallidos: ${failed}`);
    }

    return { updated, alreadyCorrect, failed };
}

// ── Validar el patch ─────────────────────────────────────────────────────────
async function validatePatch() {
    const points = await getEthicsPoints();
    const correct = points.filter(p => p.payload?.metadata?.category === PATCH_CATEGORY);
    const wrong   = points.filter(p => p.payload?.metadata?.category !== PATCH_CATEGORY);

    return {
        total: points.length,
        correct: correct.length,
        wrong: wrong.length,
        wrongSamples: wrong.slice(0, 3).map(p => ({
            id: p.id,
            category: p.payload?.metadata?.category,
            text_preview: (p.payload?.texto_original || '').substring(0, 80),
        })),
    };
}

// ── Generar reporte ──────────────────────────────────────────────────────────
function generateReport(points, patchResult, validation) {
    const now = new Date().toISOString();

    let md = `# Reporte de Patch de Metadata — Código de Ética\n`;
    md += `Generado: ${now}\n\n`;
    md += `---\n\n`;
    md += `## Objetivo\n\n`;
    md += `Actualizar el campo \`metadata.category\` de los chunks del documento:\n\n`;
    md += `\`\`\`\n${ETHICS_FILENAME}\n\`\`\`\n\n`;
    md += `**Cambio aplicado:**\n`;
    md += `- Antes: \`"General"\`\n`;
    md += `- Después: \`"${PATCH_CATEGORY}"\`\n\n`;
    md += `---\n\n`;
    md += `## Resultados del Patch\n\n`;
    md += `| Métrica | Valor |\n`;
    md += `|---------|-------|\n`;
    md += `| Chunks encontrados | ${points.length} |\n`;
    md += `| Ya correctos (sin cambio) | ${patchResult.alreadyCorrect} |\n`;
    md += `| Chunks actualizados | ${patchResult.updated} |\n`;
    md += `| Fallidos | ${patchResult.failed} |\n\n`;
    md += `---\n\n`;
    md += `## Validación Post-Patch\n\n`;
    md += `| Métrica | Valor |\n`;
    md += `|---------|-------|\n`;
    md += `| Total chunks Ética en Qdrant | ${validation.total} |\n`;
    md += `| Con categoría correcta | ${validation.correct} ✅ |\n`;
    md += `| Con categoría incorrecta | ${validation.wrong} ${validation.wrong > 0 ? '⚠️' : '✅'} |\n\n`;

    if (validation.wrong === 0) {
        md += `> ✅ **VALIDACIÓN EXITOSA:** Todos los ${validation.total} chunks del Código de Ética tienen ahora \`category = "Código Ética"\`.\n\n`;
    } else {
        md += `> ⚠️ **VALIDACIÓN PARCIAL:** ${validation.wrong} chunks aún tienen categoría incorrecta.\n\n`;
        md += `### Chunks con categoría incorrecta:\n\n`;
        for (const s of validation.wrongSamples) {
            md += `- ID: \`${s.id}\` | Category: \`${s.category}\` | Texto: "${s.text_preview}..."\n`;
        }
        md += `\n`;
    }

    md += `---\n\n`;
    md += `## Impacto Esperado\n\n`;
    md += `Con esta corrección de metadata:\n\n`;
    md += `1. **DOC_PRIORITY_MAP** en \`ragService.js\` ahora reconocerá los chunks de Ética cuando se aplique el boost de dominio.\n`;
    md += `2. **RerankingService** podrá discriminar correctamente los chunks del Código de Ética al calcular \`finalScore\`.\n`;
    md += `3. **Retrieval Accuracy** para preguntas de ética debería mejorar significativamente.\n`;

    return md;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log('══════════════════════════════════════════════');
    console.log('  Patch Metadata — Código de Ética (Fase 2.4.2)');
    console.log('══════════════════════════════════════════════\n');

    // 1. Obtener chunks del doc de Ética
    const points = await getEthicsPoints();
    if (points.length === 0) {
        console.error('❌ No se encontraron chunks para el Código de Ética. Verificar el nombre del archivo.');
        process.exit(1);
    }
    console.log(`   Encontrados: ${points.length} chunks\n`);

    // Mostrar categorías actuales
    const catsBefore = {};
    for (const p of points) {
        const cat = p.payload?.metadata?.category || 'sin-categoria';
        catsBefore[cat] = (catsBefore[cat] || 0) + 1;
    }
    console.log('📊 Categorías ANTES del patch:');
    for (const [cat, count] of Object.entries(catsBefore)) {
        console.log(`   "${cat}": ${count} chunks`);
    }
    console.log('');

    // 2. Aplicar patch
    console.log('🔧 Aplicando patch de metadata...');
    const patchResult = await patchPoints(points);
    console.log('');

    // 3. Validar
    console.log('🔍 Validando resultado...');
    const validation = await validatePatch();
    console.log(`   ✅ Correctos: ${validation.correct}/${validation.total}`);
    if (validation.wrong > 0) {
        console.log(`   ⚠️  Incorrectos: ${validation.wrong}`);
    }
    console.log('');

    // 4. Generar reporte
    if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
    const report = generateReport(points, patchResult, validation);
    const reportPath = path.join(REPORTS_DIR, 'ethics_metadata_patch.md');
    fs.writeFileSync(reportPath, report, 'utf8');
    console.log(`📝 Reporte generado: ${reportPath}\n`);

    if (validation.wrong === 0) {
        console.log('🎯 PATCH COMPLETADO EXITOSAMENTE.');
    } else {
        console.log('⚠️  Patch parcial. Revisar logs para chunks fallidos.');
    }
}

main().catch(err => {
    console.error('Error fatal:', err.message);
    process.exit(1);
});
