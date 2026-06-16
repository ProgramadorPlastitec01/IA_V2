# Auditoría del Proyecto - Plastitec AI (Fase 2.4.4A)

## Resumen Ejecutivo
Se ha realizado un escaneo completo del repositorio `C:\AIV2`. Se detectó una enorme acumulación de scripts temporales, pruebas iterativas (v3, v4, v5), backups de bases de datos, y colecciones de vectores antiguas (rrhh_docs, rrhh_docs_v2, etc.) que superan los GBs de espacio muerto. Hay múltiples benchmarks redundantes y servicios obsoletos que complican el mantenimiento.

## Inventario de Archivos Activos (Core Pipeline)
*Archivos esenciales para el funcionamiento actual de la Fase 2.4.5 WIP.*

- `server.js`: Punto de entrada Express.
- `services/ragService.js`: Core de recuperación híbrida.
- `services/llmService.js`: Motor de inferencia agnóstico.
- `services/ingestionService.js`: Motor de chunking y Qdrant ingestion.
- `services/pdfProcessor.js`: OCR y lectura de PDFs.
- `services/rerankingService.js`: Reranker heurístico y de palabras clave.
- `services/queryUnderstandingService.js`: Normalizador de queries.
- `services/confidenceValidator.js`: Validador de thresholds.
- `config/corporateVocabulary.json`: Diccionario corporativo.

## Deuda Técnica Identificada
### Archivos Obsoletos y Reemplazados
Estos servicios ya no se usan, fueron deprecados en iteraciones previas:
- `services/gemmaService.js` (Reemplazado por `llmService.js`)
- `services/rebuild_rag.js` (Lógica migrada a `ingestionService.js`)
- `services/answerVerifier.js` (Reemplazado por `answerJudge.js` / Validadores)
- `services/startupCheck.js` (Posiblemente migrado o innecesario)

### Duplicidad de Benchmarks e Históricos
La raíz del proyecto está inundada de pruebas que ya cumplieron su propósito:
- `test_accuracy.js`, `test_accuracy_v3.js`, `test_accuracy_v4.js`, `test_accuracy_v5.js`
- `test_enterprise_benchmark.js` (Reemplazado por `tests/test_enterprise_real_benchmark.js`)
- `test_final_validation.js`, `test_grounding_validation.js`, `qa_suite.js`, `test_api.js`, `test_embeddings.js`, `test_embedding_bench.mjs`

### Archivos Pesados (> 10 MB) y Colecciones Vectoriales
- Qdrant está almacenando colecciones muertas (`rrhh_docs`, `rrhh_docs_v2`, `v3`, `v4`, `v5`). Cada una pesa ~32MB x N segmentos. Se requiere purgar las colecciones desde el API de Qdrant.
- `hr_cache.db` (SQLite): Debería revisarse su uso actual, ya que el sistema se apoya 100% en Qdrant.

### Logs Acumulados
- `logs/enterprise_benchmark.jsonl`, `logs/rag_debug.jsonl`, `logs/retrieval_debug.jsonl`
No hay mecanismo de rotación. Crecen indefinidamente.

## Riesgos Arquitectónicos
1. **Configuraciones Hardcodeadas**: Existen umbrales (ej. `confidenceThreshold = 0.50` en el router, o el `+0.45` en rerankingService) que deberían vivir en `.env` o en `config/`.
2. **Dependencias "Fat"**: Se identifican dlls pesados de `canvas` y builds completos de `esbuild` en producción.
3. **Desorden de Raíz**: Hay scripts `bat`, `cmd`, `.sh`, `.mjs`, `.cjs` mezclados. Falta una estructura de carpetas unificada (ej. `/scripts` y `/deploy`).
