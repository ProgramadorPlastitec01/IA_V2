# Plan de Limpieza y Consolidación (Fase 2.4.4A)

Esta matriz detalla los archivos propuestos para eliminación o revisión con el fin de reducir la deuda técnica, aligerar el repositorio y prevenir regresiones accidentales. **Ningún archivo ha sido eliminado todavía.**

## [A] Seguro Eliminar (Basura y Obsoletos)
*Archivos sin dependencias en el flujo productivo actual.*

| Ruta del Archivo | Motivo de Baja | Riesgo de Eliminación |
|------------------|----------------|-----------------------|
| `test_accuracy.js`, `test_accuracy_v3.js`, `v4`, `v5` | Benchmarks antiguos de las iteraciones 1.x. Totalmente reemplazados. | Nulo |
| `test_enterprise_benchmark.js` | Versión vieja del benchmark real, redundante con `tests/test_enterprise_real_benchmark.js`. | Nulo |
| `test_embedding_bench.mjs`, `test_embeddings.js` | Experimentos iniciales de embedding (fase 1.3). | Nulo |
| `test_api.js`, `qa_suite.js`, `debug_query.js` | Scripts de prueba aislados, no integrados en la suite actual. | Nulo |
| `audit_phase_1_3_1.js`, `audit_phase_1_3_2.js` | Auditorías estáticas de fases anteriores. Sus reportes ya generados bastan. | Nulo |
| `services/gemmaService.js` | Código heredado. LLM actual usa `llmService.js` genérico. | Bajo |
| `services/rebuild_rag.js` | El RAG rebuilding se gestiona por ingestión directa. | Bajo |
| Colecciones `rrhh_docs`, `rrhh_docs_v2`, `v3`, `v4`, `v5` | En Qdrant (`qdrant/storage/collections`). Ocupan GBs. La colección activa es `plastitec_docs`. | Bajo |

## [B] Revisar antes de Eliminar (Requieren Validación)
*Archivos que podrían tener lógicas útiles pero no están en el pipeline visible.*

| Ruta del Archivo | Motivo de Revisión | Impacto Potencial |
|------------------|--------------------|-------------------|
| `hr_cache.db` (y archivos `-shm`, `-wal`) | Base de datos SQLite. Posiblemente usada en versiones anteriores de cache o intent routing. | Medio (Puede que `database.js` la siga usando) |
| `services/answerVerifier.js` | Tenemos `answerJudge.js` y `confidenceValidator.js`. ¿Se usa en alguna ruta oculta del server? | Alto (Si un endpoint lo requiere) |
| `test_semantic_qa.js` | Está en la raíz. Existe un mandato de uso actual, pero lógicamente debería moverse a `/tests`. | Bajo (Refactor recomendado) |

## [C] Mantener
*Todos los archivos del pipeline core listados en el PROJECT_CONTEXT, la carpeta `/docs/`, `.env` y código de QA activo (`tests/test_enterprise_real_benchmark.js`).*

---

### Recomendaciones Operativas para Limpieza:
1. **Borrado de Vectores:** Eliminar las colecciones obsoletas directamente mediante la API REST de Qdrant (`DELETE /collections/rrhh_docs`) y NO borrando las carpetas manuales, para evitar corromper los registros WAL.
2. **Refactor de Scripts:** Crear una carpeta `scripts/legacy` y mover los tests v3, v4, v5 allí antes de su borrado definitivo en una fase posterior.
3. **Log Rotation:** Los archivos en `logs/*.jsonl` deberían ser borrados si superan los 50MB, o implementar un log rotator diario (ej. `winston-daily-rotate-file`).
