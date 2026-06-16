// Test de importaciones de módulos RAG v7.0
async function testImports() {
    const tests = [
        { name: 'ragLogger',       path: './services/ragLogger.js' },
        { name: 'rerankingService',path: './services/rerankingService.js' },
        { name: 'pdfProcessor',    path: './services/pdfProcessor.js' },
        { name: 'ingestionService',path: './services/ingestionService.js' },
        { name: 'qdrantService',   path: './services/qdrantService.js' },
        { name: 'ragService',      path: './services/ragService.js' },
    ];

    let passed = 0;
    let failed = 0;

    for (const t of tests) {
        try {
            await import(t.path);
            console.log(`✅ ${t.name}`);
            passed++;
        } catch (e) {
            console.error(`❌ ${t.name}: ${e.message}`);
            failed++;
        }
    }

    console.log(`\nResultado: ${passed} OK, ${failed} fallidos`);
    process.exit(failed > 0 ? 1 : 0);
}

testImports();
